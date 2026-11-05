import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

// Resilient in-memory audit store for testing, offline environments, and query verification
export const inMemoryAuditEvents = [];

// Strict secret and sensitive credential redaction patterns
const SECRET_KEY_PATTERN = /password|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|otp|auth[_-]?header|bearer|private[_-]?key/i;

const SECRET_VALUE_PATTERNS = [
  /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
  /(?:sk|sb_secret|sb_publishable|api_key|token)[-_a-zA-Z0-9]{12,}/gi,
  /(?:password|passwd|pwd)\s*[:=]\s*\S+/gi,
  /\b(?:\d{4}[ -]){3}\d{4}\b/g, // 16-digit credit cards with 4x4 grouping
  /\b\d{15,16}\b/g, // 15-16 digit continuous card numbers
  /\b\d{4,8}\b(?=.*(?:otp|code|pin|verification))/gi, // OTP patterns
];

/**
 * Deeply scrub sensitive information, credentials, passwords, tokens, and OTPs
 * from any object, array, or string before audit recording.
 * 
 * @param {any} input
 * @returns {any} Sanitized clone
 */
export function sanitizeAuditData(input) {
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') {
    // Preserve valid UUIDs (do not false-positive as credit cards)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.trim());
    if (isUuid) return input;

    let sanitized = input;
    for (const pattern of SECRET_VALUE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
    }
    return sanitized;
  }


  if (Array.isArray(input)) {
    return input.map((item) => sanitizeAuditData(item));
  }

  if (typeof input === 'object') {
    const cleanObj = {};
    for (const [key, value] of Object.entries(input)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        cleanObj[key] = '[REDACTED_SECRET]';
      } else {
        cleanObj[key] = sanitizeAuditData(value);
      }
    }
    return cleanObj;
  }

  return input;
}

export const AUDIT_ACTIONS = {
  TICKET_CREATED: 'TICKET_CREATED',
  TICKET_ASSIGNED: 'TICKET_ASSIGNED',
  TICKET_REASSIGNED: 'TICKET_REASSIGNED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  COMMENT_ADDED: 'COMMENT_ADDED',
  AI_SUGGESTION: 'AI_SUGGESTION',
  ROUTING_SUGGESTION_ACCEPTED: 'ROUTING_SUGGESTION_ACCEPTED',
  ROUTING_SUGGESTION_REJECTED: 'ROUTING_SUGGESTION_REJECTED',
  SLA_WARNING: 'SLA_WARNING',
  TICKET_ESCALATED: 'TICKET_ESCALATED',
  KNOWLEDGE_APPROVED: 'KNOWLEDGE_APPROVED',
  TICKET_REOPENED: 'TICKET_REOPENED',
};

export class AuditService {
  /**
   * Append an audit event to the append-only audit log.
   * Guaranteed:
   * - Never exposes or records passwords, API keys, tokens, or OTPs
   * - Stores timestamps in canonical UTC ISO format
   * - Generates or preserves unique event_id and correlation_id
   * - Trusted server-only append operation
   * 
   * @param {Object} params
   * @param {string} params.actor - Actor name or email (e.g. 'student@smartdesk.edu' or 'SYSTEM')
   * @param {string} [params.actorId] - Actor UUID
   * @param {string} [params.role='SYSTEM'] - Actor role: 'STUDENT' | 'STAFF' | 'SUPER_ADMIN' | 'SYSTEM'
   * @param {string} params.action - One of AUDIT_ACTIONS
   * @param {string} params.entity - Target entity type (e.g. 'ticket', 'knowledge_document', 'routing_rule', 'comment')
   * @param {string} [params.entityId] - ID of target entity
   * @param {string} [params.correlationId] - Distributed tracing / request correlation ID
   * @param {Object} [params.metadata={}] - Minimal, non-sensitive audit metadata
   * @returns {Promise<Object>} The recorded audit record
   */
  async recordAuditEvent({
    actor = 'SYSTEM',
    actorId = null,
    role = 'SYSTEM',
    action,
    entity = 'ticket',
    entityId = null,
    correlationId = null,
    metadata = {},
  }) {
    // 1. Generate unique identifier and correlation ID
    const eventId = `EVT-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const effectiveCorrelationId =
      correlationId || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const utcTimestamp = new Date().toISOString();

    // 2. Strict sanitization of metadata (scrubs all credentials, tokens, OTPs, passwords)
    const sanitizedMetadata = sanitizeAuditData({
      ...metadata,
      entity_id: entityId || metadata.entity_id || null,
      correlation_id: effectiveCorrelationId,
    });

    const auditRecord = {
      event_id: eventId,
      actor: typeof actor === 'string' ? actor.slice(0, 150) : 'SYSTEM',
      actor_id: actorId,
      role: String(role).toUpperCase(),
      action: String(action),
      entity: String(entity),
      entity_id: entityId,
      entityId: entityId,
      timestamp: utcTimestamp,
      metadata: sanitizedMetadata,
      created_at: utcTimestamp,
    };

    // 3. Append-only memory record
    inMemoryAuditEvents.push(auditRecord);

    // 4. Append to PostgreSQL audit_events table via admin client (RLS enforces read-only for users)
    const db = supabaseAdmin || supabaseClient;
    if (db) {
      try {
        await db.from('audit_events').insert({
          event_id: auditRecord.event_id,
          actor: auditRecord.actor,
          actor_id: auditRecord.actor_id,
          role: auditRecord.role,
          action: auditRecord.action,
          entity: auditRecord.entity,
          timestamp: auditRecord.timestamp,
          metadata: auditRecord.metadata,
        });
      } catch (err) {
        logger.debug('[AuditService] Supabase insert fallback to memory', { error: err.message });
      }
    }

    logger.debug(`[AuditService] Audit event logged: ${auditRecord.action} on ${auditRecord.entity}`, {
      eventId: auditRecord.event_id,
      correlationId: effectiveCorrelationId,
    });

    return auditRecord;
  }

  /**
   * Query audit events for staff/admin inspection
   * Ordinary users cannot query audit records directly.
   * 
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
  async listAuditEvents({ action = null, entity = null, entityId = null, limit = 100 } = {}) {
    const db = supabaseAdmin || supabaseClient;
    if (db) {
      try {
        let q = db
          .from('audit_events')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(limit);

        if (action) q = q.eq('action', action);
        if (entity) q = q.eq('entity', entity);

        const { data, error } = await q;
        if (!error && Array.isArray(data) && data.length > 0) {
          return data;
        }
      } catch (err) {
        logger.debug('[AuditService] List query DB fallback to memory', { error: err.message });
      }
    }

    // Memory query fallback
    let results = [...inMemoryAuditEvents];
    if (action) results = results.filter((e) => e.action === action);
    if (entity) results = results.filter((e) => e.entity === entity);
    if (entityId) {
      results = results.filter(
        (e) => e.metadata?.entity_id === entityId || e.metadata?.ticket_id === entityId
      );
    }

    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results.slice(0, limit);
  }

  /**
   * Record user or staff feedback when accepting or rejecting an AI routing suggestion
   */
  async recordRoutingFeedback({
    ticketId,
    accepted = true,
    predictedCategory,
    chosenCategory,
    actor = 'user',
    actorId = null,
    role = 'STUDENT',
    correlationId = null,
  }) {
    const action = accepted
      ? AUDIT_ACTIONS.ROUTING_SUGGESTION_ACCEPTED
      : AUDIT_ACTIONS.ROUTING_SUGGESTION_REJECTED;

    return this.recordAuditEvent({
      actor: typeof actor === 'object' ? actor.email || actor.full_name : actor,
      actorId,
      role,
      action,
      entity: 'routing_rule',
      entityId: ticketId,
      correlationId,
      metadata: {
        ticketId,
        accepted: Boolean(accepted),
        predictedCategory,
        chosenCategory: chosenCategory || predictedCategory,
      },
    });
  }
}

export const auditService = new AuditService();

