import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { inMemoryTickets } from '../repositories/ticket.repository.js';
import { NotificationService } from '../services/notification.service.js';
import { EmailService } from '../services/email.service.js';

function getDbClient() {
  return supabaseAdmin || supabaseClient;
}

class SlaWorker {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Run one pass of the overdue ticket checker
   */
  async checkOverdueTickets() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const nowIso = new Date().toISOString();
      const db = getDbClient();
      let overdueTickets = [];

      if (db) {
        try {
          const { data, error } = await db
            .from('tickets')
            .select('id, ticket_number, title, priority, status, assigned_to, assigned_department_id, sla_due_at, is_overdue')
            .not('status', 'in', '("RESOLVED","CLOSED","REJECTED")')
            .lt('sla_due_at', nowIso)
            .eq('is_overdue', false);

          if (!error && data) {
            overdueTickets = data;
          }
        } catch (err) {
          logger.warn('[SlaWorker] Failed to query overdue tickets from database', { error: err.message });
        }
      }

      // Memory store fallback
      if (overdueTickets.length === 0 && inMemoryTickets.size > 0) {
        const nowTime = Date.now();
        for (const t of inMemoryTickets.values()) {
          if (
            !['RESOLVED', 'CLOSED', 'REJECTED'].includes(t.status) &&
            t.sla_due_at &&
            new Date(t.sla_due_at).getTime() < nowTime &&
            !t.is_overdue
          ) {
            overdueTickets.push(t);
          }
        }
      }

      if (overdueTickets.length > 0) {
        logger.warn(`[SlaWorker] Found ${overdueTickets.length} overdue ticket(s) breaching SLA deadlines.`);

        for (const t of overdueTickets) {
          // 1. Mark ticket as overdue
          if (db) {
            try {
              await db
                .from('tickets')
                .update({
                  is_overdue: true,
                  sla_breached_at: nowIso,
                  updated_at: nowIso,
                })
                .eq('id', t.id);

              // 2. Record SLA breach event
              await db.from('ticket_events').insert({
                ticket_id: t.id,
                event_type: 'STATUS_CHANGED',
                old_value: { is_overdue: false },
                new_value: { is_overdue: true, sla_breached_at: nowIso },
                note: `SLA resolution target elapsed. Ticket flagged as overdue for priority attention.`,
              });
            } catch (err) {
              logger.warn(`[SlaWorker] Failed to update ticket ${t.id} in database`, { error: err.message });
            }
          }

          // In-memory update
          const mem = inMemoryTickets.get(t.id);
          if (mem) {
            mem.is_overdue = true;
            mem.sla_breached_at = nowIso;
          }

          // 3. Dispatch in-app notification to assigned staff or department
          if (t.assigned_to) {
            await NotificationService.createInAppNotification({
              recipientId: t.assigned_to,
              ticketId: t.id,
              title: `SLA Target Breached: ${t.ticket_number}`,
              message: `Ticket "${t.title}" (${t.priority} priority) has exceeded its SLA resolution deadline.`,
              type: 'STATUS_CHANGED',
            }).catch(() => {});

            // 4. Queue transactional email notification
            await EmailService
              .queueTicketEmail({
                ticketId: t.id,
                eventType: 'STATUS_CHANGED',
                recipientId: t.assigned_to,
                subject: `[OVERDUE ALERT] SLA Breached for ${t.ticket_number}`,
                bodyHtml: `<p>Ticket <strong>${t.ticket_number}</strong> (${t.title}) has exceeded its target resolution deadline and requires immediate staff action.</p>`,
                bodyText: `Ticket ${t.ticket_number} (${t.title}) has exceeded its target resolution deadline and requires immediate staff action.`,
              })
              .catch(() => {});
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

    // Ensure interval doesn't block Node.js exit
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
