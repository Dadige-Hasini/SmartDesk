import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { inMemoryTickets } from '../repositories/ticket.repository.js';
import { NotificationService } from '../services/notification.service.js';
import { EmailService } from '../services/email.service.js';
import { slaService, DEMO_POLICY_LABEL } from '../services/sla.service.js';
import { auditService, AUDIT_ACTIONS } from '../services/audit.service.js';

function getDbClient() {
  return supabaseAdmin || supabaseClient;
}

// Persistent in-memory deduplication set to guarantee zero duplicate alerts
export const slaAlertsSent = new Set();

export class SlaWorker {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Run one pass of the SLA watchdog:
   * 1. Detect tickets approaching SLA targets (80% elapsed time) -> emit SLA_WARNING
   * 2. Detect tickets exceeding SLA targets -> mark overdue & emit SLA_BREACHED / OVERDUE
   * 3. Detect unacknowledged tickets exceeding escalation targets -> emit TICKET_ESCALATED
   * Strictly avoids duplicate alerts.
   */
  async checkOverdueTickets() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const db = getDbClient();
      let activeTickets = [];

      // 1. Fetch all active tickets from database
      if (db) {
        try {
          const { data, error } = await db
            .from('tickets')
            .select(`
              id, ticket_number, title, priority, status, created_at,
              assigned_to, assigned_department_id, sla_due_at,
              first_response_due_at, resolution_due_at, escalation_due_at,
              is_overdue, is_escalated, sla_warning_sent
            `)
            .not('status', 'in', '("RESOLVED","CLOSED","REJECTED")');

          if (!error && Array.isArray(data)) {
            activeTickets = data;
          }
        } catch (err) {
          logger.warn('[SlaWorker] Failed to query active tickets from database', { error: err.message });
        }
      }

      // Merge in-memory tickets for testing and resilient fallback
      if (inMemoryTickets.size > 0) {
        for (const t of inMemoryTickets.values()) {
          if (!activeTickets.some((at) => at.id === t.id)) {
            if (!['RESOLVED', 'CLOSED', 'REJECTED'].includes(t.status)) {
              activeTickets.push(t);
            }
          }
        }
      }


      if (activeTickets.length === 0) {
        return;
      }

      for (const t of activeTickets) {
        const evaluation = slaService.evaluateTicketSlaStatus(t, now);

        // --- STAGE 1: SLA Approaching Warning (80% target elapsed) ---
        const warnKey = `sla-warn-${t.id}`;
        if (evaluation.isApproaching && !slaAlertsSent.has(warnKey) && !t.sla_warning_sent) {
          slaAlertsSent.add(warnKey);
          t.sla_warning_sent = true;
          t.sla_warning_at = nowIso;

          // Update database
          if (db) {
            try {
              await db.from('tickets')
                .update({ sla_warning_sent: true, updated_at: nowIso })
                .eq('id', t.id);

              await db.from('ticket_events')
                .insert({
                  ticket_id: t.id,
                  event_type: 'SLA_WARNING',
                  new_value: JSON.stringify({
                    elapsedPercentage: evaluation.elapsedPercentage,
                    timeRemainingMinutes: evaluation.timeRemainingMinutes,
                    policyLabel: DEMO_POLICY_LABEL,
                  }),
                  note: `SLA warning: Ticket has elapsed ${evaluation.elapsedPercentage}% of resolution target. Due in ${evaluation.timeRemainingMinutes} mins.`,
                });
            } catch {
              // Ignore DB error
            }
          }

          // In-memory update
          const memWarn = inMemoryTickets.get(t.id);
          if (memWarn) {
            memWarn.sla_warning_sent = true;
            memWarn.sla_warning_at = nowIso;
          }

          // Centralized audit event
          auditService.recordAuditEvent({
            actor: 'SYSTEM',
            role: 'SYSTEM',
            action: AUDIT_ACTIONS.SLA_WARNING,
            entity: 'ticket',
            entityId: t.id,
            metadata: {
              ticketNumber: t.ticket_number,
              priority: t.priority,
              elapsedPercentage: evaluation.elapsedPercentage,
              timeRemainingMinutes: evaluation.timeRemainingMinutes,
              slaDueAt: t.sla_due_at,
              policyLabel: DEMO_POLICY_LABEL,
            },
          }).catch(() => {});

          // In-app notification to assignee or department
          const recipientId = t.assigned_to;
          if (recipientId) {
            NotificationService.createInAppNotification({
              recipientId,
              ticketId: t.id,
              title: `SLA Target Approaching: ${t.ticket_number}`,
              message: `Ticket "${t.title}" is approaching its resolution deadline (${evaluation.timeRemainingMinutes} mins remaining).`,
              type: 'SLA_WARNING',
            }).catch(() => {});
          }
        }

        // --- STAGE 2: SLA Target Breached (Overdue Resolution) ---
        const overdueKey = `sla-overdue-${t.id}`;
        if (evaluation.isOverdue && !slaAlertsSent.has(overdueKey) && !t.is_overdue) {
          slaAlertsSent.add(overdueKey);
          t.is_overdue = true;
          t.sla_breached_at = nowIso;

          // Update database
          if (db) {
            try {
              await db.from('tickets')
                .update({
                  is_overdue: true,
                  sla_breached_at: nowIso,
                  updated_at: nowIso,
                })
                .eq('id', t.id);

              await db.from('ticket_events')
                .insert({
                  ticket_id: t.id,
                  event_type: 'STATUS_CHANGED',
                  old_value: JSON.stringify({ is_overdue: false }),
                  new_value: JSON.stringify({ is_overdue: true, sla_breached_at: nowIso }),
                  note: `SLA resolution target elapsed. Ticket flagged as overdue for priority attention.`,
                });
            } catch {
              // Ignore DB error
            }
          }

          // In-memory update
          const memOverdue = inMemoryTickets.get(t.id);
          if (memOverdue) {
            memOverdue.is_overdue = true;
            memOverdue.sla_breached_at = nowIso;
          }

          // Centralized audit event
          auditService.recordAuditEvent({
            actor: 'SYSTEM',
            role: 'SYSTEM',
            action: AUDIT_ACTIONS.STATUS_CHANGED,
            entity: 'ticket',
            entityId: t.id,
            metadata: {
              ticketNumber: t.ticket_number,
              statusChange: 'OVERDUE',
              priority: t.priority,
              slaDueAt: t.sla_due_at,
              breachedAt: nowIso,
              policyLabel: DEMO_POLICY_LABEL,
            },
          }).catch(() => {});

          // In-app notification
          if (t.assigned_to) {
            NotificationService.createInAppNotification({
              recipientId: t.assigned_to,
              ticketId: t.id,
              title: `SLA Target Breached: ${t.ticket_number}`,
              message: `Ticket "${t.title}" (${t.priority} priority) has exceeded its SLA resolution deadline.`,
              type: 'STATUS_CHANGED',
            }).catch(() => {});

            // Asynchronous email notification (resilient, non-blocking)
            EmailService.queueTicketEmail({
              ticketId: t.id,
              eventType: 'STATUS_CHANGED',
              recipientId: t.assigned_to,
              subject: `[OVERDUE ALERT] SLA Breached for ${t.ticket_number}`,
              bodyHtml: `<p>Ticket <strong>${t.ticket_number}</strong> (${t.title}) has exceeded its target resolution deadline and requires immediate staff action.</p>`,
              bodyText: `Ticket ${t.ticket_number} (${t.title}) has exceeded its target resolution deadline and requires immediate staff action.`,
            }).catch((err) => {
              logger.debug('[SlaWorker] Non-fatal email queueing error', { error: err.message });
            });
          }
        }

        // --- STAGE 3: Escalation Deadline Passed ---
        const escKey = `sla-esc-${t.id}`;
        if (evaluation.isEscalated && !slaAlertsSent.has(escKey) && !t.is_escalated) {
          slaAlertsSent.add(escKey);
          t.is_escalated = true;
          t.escalated_at = nowIso;

          // Update database
          if (db) {
            try {
              await db.from('tickets')
                .update({ is_escalated: true, escalated_at: nowIso, updated_at: nowIso })
                .eq('id', t.id);

              await db.from('ticket_events')
                .insert({
                  ticket_id: t.id,
                  event_type: 'TICKET_ESCALATED',
                  new_value: JSON.stringify({
                    escalated_at: nowIso,
                    escalation_due_at: t.escalation_due_at,
                    policyLabel: DEMO_POLICY_LABEL,
                  }),
                  note: `Escalation threshold reached without staff triage. Escalating case to department supervisor.`,
                });
            } catch {
              // Ignore DB error
            }
          }

          // In-memory update
          const memEsc = inMemoryTickets.get(t.id);
          if (memEsc) {
            memEsc.is_escalated = true;
            memEsc.escalated_at = nowIso;
          }


          // Centralized audit event
          auditService.recordAuditEvent({
            actor: 'SYSTEM',
            role: 'SYSTEM',
            action: AUDIT_ACTIONS.TICKET_ESCALATED,
            entity: 'ticket',
            entityId: t.id,
            metadata: {
              ticketNumber: t.ticket_number,
              priority: t.priority,
              escalationDueAt: t.escalation_due_at,
              policyLabel: DEMO_POLICY_LABEL,
            },
          }).catch(() => {});

          // In-app notification
          if (t.assigned_to) {
            NotificationService.createInAppNotification({
              recipientId: t.assigned_to,
              ticketId: t.id,
              title: `Ticket Escalated: ${t.ticket_number}`,
              message: `Ticket "${t.title}" has passed the escalation deadline and has been escalated to departmental supervision.`,
              type: 'TICKET_ESCALATED',
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      logger.error('[SlaWorker] Error executing scheduled SLA check', { error: err.message });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start scheduled background execution
   */
  start(intervalMs = 60000) {
    if (this.intervalId) return;
    logger.info(`[SlaWorker] Initialized server-side SLA overdue watchdog (interval: ${intervalMs / 1000}s)`);

    // Initial check on boot
    this.checkOverdueTickets();

    this.intervalId = setInterval(() => {
      this.checkOverdueTickets();
    }, intervalMs);

    if (this.intervalId.unref) {
      this.intervalId.unref();
    }
  }

  /**
   * Stop scheduled background execution
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('[SlaWorker] Stopped SLA overdue watchdog.');
    }
  }
}

export const slaWorker = new SlaWorker();
