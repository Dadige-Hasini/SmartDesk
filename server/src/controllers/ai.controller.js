import { ragService } from '../services/ai/rag.service.js';
import { llmService } from '../services/ai/llm.service.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

export class AiController {
  /**
   * Status and configuration health probe
   */
  static async getStatus(req, res) {
    const status = llmService.getStatus();
    return sendSuccess(res, 'AI service status retrieved', status);
  }

  /**
   * Grounded conversational Q&A endpoint
   * POST /api/ai/chat
   */
  static async chat(req, res, next) {
    try {
      const { query, conversationHistory = [] } = req.body;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return sendError(res, 'Query string is required and cannot be empty.', { code: 'INVALID_QUERY' }, 400);
      }

      if (query.trim().length > 1000) {
        return sendError(res, 'Query exceeds maximum limit of 1000 characters.', { code: 'QUERY_TOO_LONG' }, 400);
      }

      const result = await ragService.generateGroundedAnswer({
        query: query.trim(),
        conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
        userProfile: req.profile || req.user,
      });

      return sendSuccess(res, 'AI response generated successfully', result);
    } catch (err) {
      logger.error('[AiController.chat] Failed to generate AI response', { error: err.message });
      next(err);
    }
  }

  /**
   * AI Ticket suggestion assistant
   * POST /api/ai/suggest-ticket
   */
  static async suggestTicket(req, res, next) {
    try {
      const { query, conversationHistory = [] } = req.body;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return sendError(res, 'Query string is required for ticket suggestion.', { code: 'INVALID_QUERY' }, 400);
      }

      const suggestion = await ragService.suggestTicketDraft({
        query: query.trim(),
        conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
        userProfile: req.profile || req.user,
      });

      return sendSuccess(res, 'Ticket draft suggestion generated', suggestion);
    } catch (err) {
      logger.error('[AiController.suggestTicket] Error generating ticket draft', { error: err.message });
      next(err);
    }
  }

  /**
   * Record user feedback on AI responses
   * POST /api/ai/feedback
   */
  static async recordFeedback(req, res, next) {
    try {
      const { query, answer, isHelpful, feedbackText, citations, hasSufficientEvidence, confidenceScore } = req.body;

      if (typeof isHelpful !== 'boolean') {
        return sendError(res, 'isHelpful boolean flag is required.', { code: 'INVALID_FEEDBACK' }, 400);
      }

      const feedback = await ragService.recordFeedback({
        userProfile: req.profile || req.user,
        query,
        answer,
        isHelpful,
        feedbackText,
        citations,
        hasSufficientEvidence,
        confidenceScore,
      });

      return sendSuccess(res, 'Thank you for your feedback.', feedback, 201);
    } catch (err) {
      logger.error('[AiController.recordFeedback] Error recording feedback', { error: err.message });
      next(err);
    }
  }

  /**
   * Staff-facing ticket summary
   * POST /api/ai/summarize-ticket
   */
  static async summarizeTicket(req, res, next) {
    try {
      const { ticketId } = req.body;

      if (!ticketId) {
        return sendError(res, 'ticketId is required for summarization.', { code: 'MISSING_TICKET_ID' }, 400);
      }

      const summary = await ragService.summarizeTicket({
        ticketId,
        userProfile: req.profile || req.user,
      });

      return sendSuccess(res, 'Ticket summary generated successfully', summary);
    } catch (err) {
      logger.warn('[AiController.summarizeTicket] Access denied or error during ticket summarization', { error: err.message });
      if (err.message && err.message.includes('FORBIDDEN')) {
        return sendError(res, err.message, { code: 'FORBIDDEN_DEPARTMENT_MISMATCH' }, 403);
      }
      next(err);
    }
  }

  /**
   * Admin Document Upload & Chunk Ingestion
   * POST /api/ai/documents/upload
   */
  static async uploadDocument(req, res, next) {
    try {
      const file = req.file;
      const { title, description, departmentId, categoryId, autoApprove } = req.body;

      if (!file) {
        return sendError(res, 'A document file is required.', { code: 'MISSING_FILE' }, 400);
      }

      if (!title || title.trim().length < 3) {
        return sendError(res, 'Document title is required (min 3 characters).', { code: 'INVALID_TITLE' }, 400);
      }

      const ext = file.originalname?.split('.').pop()?.toUpperCase() || 'TXT';
      if (!['PDF', 'DOCX', 'TXT', 'MD'].includes(ext)) {
        return sendError(res, 'Unsupported file type. Only PDF, DOCX, TXT, and MD are supported.', { code: 'UNSUPPORTED_FORMAT' }, 400);
      }

      const result = await ragService.ingestDocument({
        title,
        description,
        buffer: file.buffer,
        fileType: ext,
        departmentId: departmentId || null,
        categoryId: categoryId || null,
        adminProfile: req.profile || req.user,
        ipAddress: req.ip,
        autoApprove: autoApprove === 'true' || autoApprove === true,
      });

      return sendSuccess(res, 'Document successfully ingested and indexed.', result, 201);
    } catch (err) {
      logger.error('[AiController.uploadDocument] Error ingesting document', { error: err.message });
      next(err);
    }
  }

  /**
   * Approve a knowledge document
   * PUT /api/ai/documents/:id/approve
   */
  static async approveDocument(req, res, next) {
    try {
      const { id } = req.params;
      const doc = await ragService.approveDocument({
        documentId: id,
        adminProfile: req.profile || req.user,
        ipAddress: req.ip,
      });

      return sendSuccess(res, 'Document approved for AI retrieval.', doc);
    } catch (err) {
      if (err.message && err.message.includes('FORBIDDEN')) {
        return sendError(res, err.message, { code: 'FORBIDDEN_INSUFFICIENT_PERMISSIONS' }, 403);
      }
      next(err);
    }
  }
}
