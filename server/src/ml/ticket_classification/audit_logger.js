import { supabaseAdmin, supabaseClient } from '../../config/supabase.js';
import { logger } from '../../utils/logger.js';

// In-memory resilient fallback when Supabase is running offline
export const inMemoryAuditEvents = [];
export const inMemoryAiInteractions = [];

// Secret & PII Scrubbing patterns
const SECRET_PATTERNS = [
  /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
  /(?:sk|sb_secret|sb_publishable|api_key|token)[-_a-zA-Z0-9]{12,}/gi,
  /password\s*[:=]\s*\S+/gi,
  /\b(?:\d[ -]*?){13,16}\b/g, // Credit / Debit cards
  /cvv\s*[:=]\s*\d{3,4}/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g, // Personal emails
];

/**
 * Scrub secrets, tokens, card numbers, and PII from text before logging
 * 
 * @param {string} text
 * @returns {string}
 */
export function scrubSecrets(text) {
  if (!text || typeof text !== 'string') return '';
  let scrubbed = text;
  for (const pattern of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, '[REDACTED_SECRET]');
  }
  return scrubbed;
}

export class ClassificationAuditLogger {
  /**
   * Save AI suggestion and routing outcome to audit and AI interaction logs.
   * Strictly avoids storing secrets, credentials, or unnecessary sensitive text (Requirement 10).
   * 
   * @param {Object} params
   * @param {{ title: string, description?: string }} params.ticketContext
   * @param {Object} params.routingOutcome
   * @param {Object} [params.userProfile]
   * @param {string} [params.sessionId]
   * @param {string} [params.ticketId]
   */
  static async logClassificationInteraction(params) {
    const { ticketContext, routingOutcome, userProfile, sessionId, ticketId } = params;

    // 1. Sanitize text: Scrub secrets and truncate to safe snippet (never store full confidential body)
    const rawTitle = (ticketContext?.title || '').trim();
    const safeTitleSnippet = scrubSecrets(rawTitle).slice(0, 100);

    const actorId = userProfile?.id || null;
    const actorEmail = userProfile?.email || 'student@smartdesk.edu';
    const actorRole = userProfile?.role || 'STUDENT';

    // 2. Prepare structured metadata (zero secret exposure)
    const auditMetadata = {
      model_name: routingOutcome.model_name,
      predicted_category: routingOutcome.category,
      confidence: routingOutcome.confidence,
      assigned_department: routingOutcome.department,
      priority: routingOutcome.priority,
      rule_applied: routingOutcome.rule_applied,
      human_review_required: routingOutcome.human_review_required,
      human_review_reason: routingOutcome.human_review_reason,
      is_fallback: routingOutcome.is_fallback,
      fallback_reason: routingOutcome.fallback_reason,
      ticket_id: ticketId || null,
      logged_at: new Date().toISOString(),
    };

    const eventId = `EVT-AI-CLASS-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // 3. Record in memory fallback
    inMemoryAiInteractions.push({
      session_id: sessionId || null,
      user_id: actorId,
      query_snippet: safeTitleSnippet,
      model: routingOutcome.model_name,
      matched_category: routingOutcome.category,
      confidence_score: routingOutcome.confidence,
      metadata: auditMetadata,
      created_at: new Date().toISOString(),
    });

    inMemoryAuditEvents.push({
      event_id: eventId,
      actor: actorEmail,
      actorId: actorId,
      role: actorRole,
      action: 'AI_SUGGESTION',
      entity: 'ticket',
      metadata: auditMetadata,
      created_at: new Date().toISOString(),
    });

    try {
      const { auditService, AUDIT_ACTIONS } = await import('../../services/audit.service.js');
      await auditService.recordAuditEvent({
        actor: actorEmail,
        actorId,
        role: actorRole,
        action: AUDIT_ACTIONS.AI_SUGGESTION,
        entity: 'ticket',
        entityId: ticketId,
        metadata: auditMetadata,
      });
    } catch {
      // Non-fatal if circular or offline
    }


    // 4. Record to live Supabase if available
    const db = supabaseAdmin || supabaseClient;
    if (db) {
      try {
        await Promise.allSettled([
          db.from('ai_interactions').insert({
            session_id: sessionId || null,
            user_id: actorId,
            query: safeTitleSnippet,
            response: `Category: ${routingOutcome.category}, Dept: ${routingOutcome.department}, Confidence: ${routingOutcome.confidence}`,
            model: routingOutcome.model_name,
            confidence_score: routingOutcome.confidence,
            metadata: auditMetadata,
          }),
          db.from('audit_events').insert({
            event_id: eventId,
            actor: actorEmail,
            actor_id: actorId,
            role: actorRole,
            action: 'TICKET_CLASSIFICATION_AND_ROUTING',
            entity: 'ticket',
            metadata: auditMetadata,
          }),
        ]);
      } catch (err) {
        logger.debug('Failed to write to remote audit_events, in-memory copy preserved', { error: err.message });
      }
    }

    return {
      logged: true,
      eventId,
      metadata: auditMetadata,
    };
  }
}
