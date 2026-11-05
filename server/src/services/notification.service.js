import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { EmailService } from './email.service.js';
import { logger } from '../utils/logger.js';

function getDbClient() {
  if (process.env.NODE_ENV === 'test') return null;
  return supabaseAdmin || supabaseClient;
}

// In-memory fallbacks for testing and mock data
export const inMemoryNotifications = [];
export const inMemoryPreferences = new Map();

export const DEFAULT_PREFERENCES = {
  email_on_ticket_created: true,
  email_on_ticket_assigned: true,
  email_on_comment_added: true,
  email_on_status_changed: true,
  email_on_ticket_resolved: true,
  email_on_ticket_reopened: true,
  in_app_notifications: true,
};

export class NotificationService {
  /**
   * Retrieves notification preferences for a user, creating defaults if not set.
   */
  static async getPreferences(userId) {
    if (!userId) return { ...DEFAULT_PREFERENCES };

    const db = getDbClient();
    if (db) {
      try {
        const { data, error } = await db
          .from('notification_preferences')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (data) return data;
      } catch (err) {
        logger.debug('[NotificationService] Error querying preferences from DB', { error: err.message });
      }
    }

    if (inMemoryPreferences.has(userId)) {
      return inMemoryPreferences.get(userId);
    }

    const defaultRecord = {
      id: `pref-${userId}`,
      user_id: userId,
      ...DEFAULT_PREFERENCES,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    inMemoryPreferences.set(userId, defaultRecord);
    return defaultRecord;
  }

  /**
   * Updates notification preferences for a user.
   */
  static async updatePreferences(userId, updateFields) {
    const current = await this.getPreferences(userId);
    const updated = {
      ...current,
      ...updateFields,
      updated_at: new Date().toISOString(),
    };

    const db = getDbClient();
    if (db) {
      try {
        await db
          .from('notification_preferences')
          .upsert({
            user_id: userId,
            ...updated,
          })
          .select();
      } catch (err) {
        logger.warn('[NotificationService] Error updating preferences in DB', { error: err.message });
      }
    }

    inMemoryPreferences.set(userId, updated);
    return updated;
  }

  /**
   * Dispatches both in-app notification and outbox email job based on user preferences.
   * A failure or mail server downtime will NEVER roll back the caller.
   */
  static async notifyUser({
    recipientId,
    recipientEmail,
    recipientName = '',
    ticket,
    eventType,
    title,
    message,
    actorName = 'System',
    note = '',
    dedupKeySuffix = '',
  }) {
    if (!recipientId && !recipientEmail) return;

    try {
      const prefs = recipientId ? await this.getPreferences(recipientId) : DEFAULT_PREFERENCES;

      // 1. In-App Notification (if recipient has an account and preference is enabled)
      if (recipientId && prefs.in_app_notifications) {
        await this.createInAppNotification({
          recipientId,
          ticketId: ticket?.id || null,
          title,
          message,
          type: eventType,
        });
      }

      // 2. Email Notification Check
      let emailAllowed = false;
      switch (eventType) {
        case 'TICKET_CREATED':
          emailAllowed = prefs.email_on_ticket_created;
          break;
        case 'ASSIGNED':
          emailAllowed = prefs.email_on_ticket_assigned;
          break;
        case 'NEW_COMMENT':
          emailAllowed = prefs.email_on_comment_added;
          break;
        case 'STATUS_CHANGED':
          emailAllowed = prefs.email_on_status_changed;
          break;
        case 'RESOLVED':
          emailAllowed = prefs.email_on_ticket_resolved;
          break;
        case 'REOPENED':
          emailAllowed = prefs.email_on_ticket_reopened;
          break;
        default:
          emailAllowed = true;
      }

      if (emailAllowed && recipientEmail) {
        const emailTemplate = EmailService.generateEmailTemplate(eventType, {
          ticketId: ticket?.id,
          ticketNumber: ticket?.ticket_number || 'TKT',
          title: ticket?.title || title,
          recipientName,
          note,
          status: ticket?.status,
          actorName,
          categoryName: ticket?.category?.name,
          priority: ticket?.priority,
        });

        const dedupKey = `${eventType}:${ticket?.id || 'sys'}:${recipientEmail}:${dedupKeySuffix || Date.now()}`;

        await EmailService.enqueueEmailJob({
          recipientEmail,
          recipientName,
          subject: emailTemplate.subject,
          bodyHtml: emailTemplate.bodyHtml,
          bodyText: emailTemplate.bodyText,
          eventType,
          ticketId: ticket?.id || null,
          dedupKey,
        });
      }
    } catch (err) {
      logger.error('[NotificationService] Failed to dispatch user notification', {
        eventType,
        recipientEmail,
        error: err.message,
      });
    }
  }

  /**
   * Creates an in-app notification record.
   */
  static async createInAppNotification({ recipientId, ticketId, title, message, type }) {
    const record = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      recipient_id: recipientId,
      ticket_id: ticketId,
      title,
      message,
      type,
      is_read: false,
      read_at: null,
      created_at: new Date().toISOString(),
    };

    const db = getDbClient();
    if (db) {
      try {
        const { data, error } = await db
          .from('notifications')
          .insert({
            recipient_id: recipientId,
            ticket_id: ticketId,
            title,
            message,
            type,
            is_read: false,
          })
          .select()
          .maybeSingle();

        if (data) {
          inMemoryNotifications.unshift(data);
          return data;
        }
      } catch (err) {
        logger.debug('[NotificationService] Fallback to memory notification', { error: err.message });
      }
    }

    inMemoryNotifications.unshift(record);
    return record;
  }

  /**
   * Retrieves paginated notifications for a recipient.
   */
  static async getNotifications(recipientId, { page = 1, limit = 20, unreadOnly = false } = {}) {
    const db = getDbClient();
    const offset = (page - 1) * limit;

    let items = [];
    let total = 0;
    let unreadCount = 0;

    if (db) {
      try {
        let query = db
          .from('notifications')
          .select('*', { count: 'exact' })
          .eq('recipient_id', recipientId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (unreadOnly) {
          query = query.eq('is_read', false);
        }

        const { data, count, error } = await query;
        if (!error && data && data.length > 0) {
          items = data;
          total = count || data.length;

          // Count unread
          const unreadRes = await db
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('recipient_id', recipientId)
            .eq('is_read', false);

          unreadCount = unreadRes.count || 0;
          return { items, total, unreadCount, page, limit };
        }
      } catch {
        // Fallback to memory
      }
    }

    // Memory filter
    const userNotifs = inMemoryNotifications.filter((n) => n.recipient_id === recipientId);
    unreadCount = userNotifs.filter((n) => !n.is_read).length;

    let filtered = userNotifs;
    if (unreadOnly) {
      filtered = filtered.filter((n) => !n.is_read);
    }
    total = filtered.length;
    items = filtered.slice(offset, offset + limit);

    return { items, total, unreadCount, page, limit };
  }

  /**
   * Marks a notification as read.
   */
  static async markAsRead(notificationId, recipientId) {
    const db = getDbClient();
    const readAt = new Date().toISOString();

    if (db) {
      try {
        await db
          .from('notifications')
          .update({ is_read: true, read_at: readAt })
          .eq('id', notificationId)
          .eq('recipient_id', recipientId);
      } catch (err) {
        logger.debug('[NotificationService] DB markAsRead failed', { error: err.message });
      }
    }

    const item = inMemoryNotifications.find(
      (n) => n.id === notificationId && n.recipient_id === recipientId
    );
    if (item) {
      item.is_read = true;
      item.read_at = readAt;
    }

    return { success: true };
  }

  /**
   * Marks all unread notifications for a user as read.
   */
  static async markAllAsRead(recipientId) {
    const db = getDbClient();
    const readAt = new Date().toISOString();

    if (db) {
      try {
        await db
          .from('notifications')
          .update({ is_read: true, read_at: readAt })
          .eq('recipient_id', recipientId)
          .eq('is_read', false);
      } catch (err) {
        logger.debug('[NotificationService] DB markAllAsRead failed', { error: err.message });
      }
    }

    inMemoryNotifications.forEach((n) => {
      if (n.recipient_id === recipientId && !n.is_read) {
        n.is_read = true;
        n.read_at = readAt;
      }
    });

    return { success: true };
  }
}
