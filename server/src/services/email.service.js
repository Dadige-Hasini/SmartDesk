import nodemailer from 'nodemailer';
import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

function getDbClient() {
  if (process.env.NODE_ENV === 'test') return null;
  return supabaseAdmin || supabaseClient;
}

// In-memory fallback outbox store for testing and when remote database is mocking
export const inMemoryEmailJobs = [];

/**
 * Configure Nodemailer transport
 */
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: { user, pass },
    });
  }

  // Graceful test transport when SMTP credentials are not configured
  return {
    sendMail: async (options) => {
      logger.info('[EmailOutbox] Simulated sendMail dispatch', {
        to: options.to,
        subject: options.subject,
      });
      return { messageId: `mock-${Date.now()}` };
    },
    verify: async () => true,
  };
}

let transporter = createTransporter();

export function setCustomTransporter(customTransport) {
  transporter = customTransport;
}

export function resetTransporter() {
  transporter = createTransporter();
}

export class EmailService {
  /**
   * Enqueues an email job for ticket status or SLA events.
   */
  static async queueTicketEmail(params) {
    return EmailService.enqueueEmailJob({
      recipientEmail: params.recipientEmail || (params.recipientId ? `${params.recipientId}@college.edu` : 'staff@college.edu'),
      recipientName: params.recipientName || '',
      subject: params.subject,
      bodyHtml: params.bodyHtml,
      bodyText: params.bodyText,
      eventType: params.eventType || 'STATUS_CHANGED',
      ticketId: params.ticketId,
      dedupKey: params.dedupKey || `sla-${params.ticketId}-${params.eventType}-${Date.now()}`,
    });
  }

  /**
   * Enqueues an email job into the reliable asynchronous outbox table.
   * A mail-provider outage will NEVER fail or roll back the calling transaction.
   *
   * @param {Object} job
   * @param {string} job.recipientEmail
   * @param {string} [job.recipientName]
   * @param {string} job.subject
   * @param {string} job.bodyHtml
   * @param {string} job.bodyText
   * @param {string} job.eventType
   * @param {string} [job.ticketId]
   * @param {string} job.dedupKey - Prevents duplicate sends
   */
  static async enqueueEmailJob({
    recipientEmail,
    recipientName = '',
    subject,
    bodyHtml,
    bodyText,
    eventType,
    ticketId = null,
    dedupKey,
  }) {
    if (!recipientEmail || !subject || !dedupKey) {
      logger.warn('[EmailService] Missing required parameters for enqueueEmailJob', {
        recipientEmail,
        subject,
        dedupKey,
      });
      return null;
    }

    const db = getDbClient();

    // 1. Check in-memory store for duplicates
    const existingMemoryJob = inMemoryEmailJobs.find((j) => j.dedup_key === dedupKey);
    if (existingMemoryJob) {
      logger.debug('[EmailService] Duplicate email job detected in memory outbox; skipping', { dedupKey });
      return existingMemoryJob;
    }

    const jobRecord = {
      id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      event_type: eventType,
      ticket_id: ticketId,
      dedup_key: dedupKey,
      status: 'PENDING',
      attempts: 0,
      max_attempts: 5,
      last_attempt_at: null,
      next_attempt_at: new Date().toISOString(),
      error_message: null,
      sent_at: null,
      created_at: new Date().toISOString(),
    };

    if (db && process.env.NODE_ENV !== 'test') {
      try {
        const { data, error } = await db
          .from('email_jobs')
          .insert({
            recipient_email: recipientEmail,
            recipient_name: recipientName,
            subject,
            body_html: bodyHtml,
            body_text: bodyText,
            event_type: eventType,
            ticket_id: ticketId,
            dedup_key: dedupKey,
            status: 'PENDING',
            attempts: 0,
            max_attempts: 5,
            next_attempt_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();

        if (error) {
          // If unique constraint violation on dedup_key, it was already enqueued
          if (error.code === '23505' || error.message?.includes('duplicate key')) {
            logger.debug('[EmailService] Duplicate email job skipped by database constraint', { dedupKey });
            return null;
          }
          logger.warn('[EmailService] Failed to insert into email_jobs table, saving to memory fallback', {
            error: error.message,
          });
          inMemoryEmailJobs.push(jobRecord);
          return jobRecord;
        }

        if (data) {
          inMemoryEmailJobs.push(data);
          return data;
        }
      } catch (err) {
        logger.warn('[EmailService] Exception saving to email_jobs, fallback to memory', { error: err.message });
      }
    }

    inMemoryEmailJobs.push(jobRecord);
    return jobRecord;
  }

  /**
   * Processes ready email jobs in the outbox queue with retry handling and exponential backoff.
   */
  static async processPendingJobs() {
    const now = new Date();
    const db = getDbClient();

    // 1. Gather pending jobs from memory
    const readyMemoryJobs = inMemoryEmailJobs.filter(
      (job) =>
        ['PENDING', 'FAILED'].includes(job.status) &&
        job.attempts < job.max_attempts &&
        new Date(job.next_attempt_at) <= now
    );

    let processedCount = 0;
    let failedCount = 0;

    for (const job of readyMemoryJobs) {
      job.status = 'PROCESSING';
      job.attempts += 1;
      job.last_attempt_at = new Date().toISOString();

      try {
        await transporter.sendMail({
          from: process.env.EMAIL_FROM_ADDRESS
            ? `"${process.env.EMAIL_FROM_NAME || 'SmartDesk'}" <${process.env.EMAIL_FROM_ADDRESS}>`
            : '"SmartDesk Support" <support@smartdesk.college.edu>',
          to: job.recipient_email,
          subject: job.subject,
          text: job.body_text,
          html: job.body_html,
        });

        job.status = 'SENT';
        job.sent_at = new Date().toISOString();
        job.error_message = null;
        processedCount += 1;
      } catch (err) {
        failedCount += 1;
        job.error_message = err.message;

        if (job.attempts >= job.max_attempts) {
          job.status = 'DEAD_LETTER';
          logger.error('[EmailOutbox] Job permanently failed; moved to DEAD_LETTER', {
            jobId: job.id,
            attempts: job.attempts,
            error: err.message,
          });
        } else {
          job.status = 'FAILED';
          // Exponential backoff: 30s * 2^(attempts - 1)
          const backoffSec = Math.pow(2, job.attempts) * 30;
          job.next_attempt_at = new Date(Date.now() + backoffSec * 1000).toISOString();
          logger.warn('[EmailOutbox] Job failed; scheduled retry', {
            jobId: job.id,
            attempt: job.attempts,
            nextAttemptInSec: backoffSec,
            error: err.message,
          });
        }
      }
    }

    return { processed: processedCount, failed: failedCount };
  }

  /**
   * Generates formatted email body templates for ticket lifecycle events
   */
  static generateEmailTemplate(eventType, data) {
    const { ticketNumber, title, recipientName, note, status, actorName } = data;
    const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const ticketUrl = `${baseUrl}/tickets/${data.ticketId || ''}`;

    let subject = '';
    let messageText = '';

    switch (eventType) {
      case 'TICKET_CREATED':
        subject = `[SmartDesk] Ticket #${ticketNumber} Created: ${title}`;
        messageText = `Your support ticket #${ticketNumber} has been successfully created.\n\nTitle: ${title}\nCategory: ${data.categoryName || 'General'}\nPriority: ${data.priority || 'Medium'}\n\nOur departmental support team will review it shortly.`;
        break;

      case 'ASSIGNED':
        subject = `[SmartDesk] Ticket #${ticketNumber} Assigned: ${title}`;
        messageText = `Ticket #${ticketNumber} (${title}) has been assigned to ${data.assignedToName || 'you'} for resolution.`;
        break;

      case 'NEW_COMMENT':
        subject = `[SmartDesk] New comment on Ticket #${ticketNumber}`;
        messageText = `${actorName || 'A user'} commented on ticket #${ticketNumber}:\n\n"${note}"`;
        break;

      case 'STATUS_CHANGED':
        subject = `[SmartDesk] Status update on Ticket #${ticketNumber}: ${status}`;
        messageText = `Ticket #${ticketNumber} status changed to ${status}.${note ? `\n\nNote: ${note}` : ''}`;
        break;

      case 'RESOLVED':
        subject = `[SmartDesk] Ticket #${ticketNumber} Resolved: ${title}`;
        messageText = `Ticket #${ticketNumber} has been resolved by our support team.\n\nResolution Summary: ${note || 'Issue resolved.'}\n\nPlease take a moment to rate our service or reopen within 7 days if you still need assistance.`;
        break;

      case 'REOPENED':
        subject = `[SmartDesk] Ticket #${ticketNumber} Reopened: ${title}`;
        messageText = `Student has reopened ticket #${ticketNumber}.\n\nReopen Reason: ${note || 'Further help required.'}`;
        break;

      default:
        subject = `[SmartDesk] Update on Ticket #${ticketNumber}`;
        messageText = `There is an update on ticket #${ticketNumber}.`;
    }

    const bodyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #1e293b;">
        <div style="padding-bottom: 16px; border-bottom: 1px solid #334155; margin-bottom: 20px;">
          <h2 style="color: #38bdf8; margin: 0; font-size: 20px;">SmartDesk Help Desk</h2>
        </div>
        <p style="font-size: 15px; line-height: 1.6;">${greeting}</p>
        <div style="background: #1e293b; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #38bdf8;">
          <p style="margin: 0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${messageText}</p>
        </div>
        <div style="margin: 24px 0;">
          <a href="${ticketUrl}" style="background: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">View Ticket Details</a>
        </div>
        <hr style="border: none; border-top: 1px solid #334155; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">This is an automated notification from SmartDesk Support System. You can configure your email notification preferences in your portal settings.</p>
      </div>
    `;

    return { subject, bodyHtml, bodyText: messageText };
  }
}

// Background email polling timer
let emailWorkerInterval = null;

export function startEmailWorker(intervalMs = 15000) {
  if (emailWorkerInterval) return;
  emailWorkerInterval = setInterval(() => {
    EmailService.processPendingJobs().catch((err) => {
      logger.error('[EmailWorker] Periodic processing cycle error', { error: err.message });
    });
  }, intervalMs);
}

export function stopEmailWorker() {
  if (emailWorkerInterval) {
    clearInterval(emailWorkerInterval);
    emailWorkerInterval = null;
  }
}
