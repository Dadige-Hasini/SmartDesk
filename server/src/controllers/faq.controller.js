import { faqService } from '../services/faq.service.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

export class FaqController {
  /**
   * Public FAQ listing with keyword search and category filtering
   * GET /api/faqs
   */
  static async getPublicFaqs(req, res, next) {
    try {
      const { search, categoryId, limit, page } = req.query;
      const result = await faqService.getPublicFaqs({ search, categoryId, limit, page });
      return res.status(200).json({
        success: true,
        message: 'Public FAQs retrieved successfully',
        data: result.faqs,
        faqs: result.faqs,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
      });
    } catch (err) {
      logger.error('[FaqController.getPublicFaqs] Error retrieving FAQs', { error: err.message });
      next(err);
    }
  }

  /**
   * Single FAQ detail with view count increment
   * GET /api/faqs/:id
   */
  static async getFaqById(req, res, next) {
    try {
      const { id } = req.params;
      const faq = await faqService.getFaqById(id);
      return sendSuccess(res, 'FAQ details retrieved', faq);
    } catch (err) {
      if (err.message && err.message.includes('not found')) {
        return sendError(res, err.message, { code: 'NOT_FOUND' }, 404);
      }
      next(err);
    }
  }

  /**
   * Helpful / Unhelpful voting with abuse prevention
   * POST /api/faqs/:id/vote
   */
  static async voteFaq(req, res, next) {
    try {
      const { id } = req.params;
      const { isHelpful } = req.body;

      if (typeof isHelpful !== 'boolean') {
        return sendError(res, 'isHelpful boolean field is required.', { code: 'INVALID_FEEDBACK' }, 400);
      }

      const userId = req.profile?.id || req.user?.id || null;
      const ipAddress =
        req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        '127.0.0.1';

      const result = await faqService.voteFaq({
        faqId: id,
        isHelpful,
        userId,
        ipAddress,
      });

      return sendSuccess(res, 'Feedback submitted successfully', result, 200);
    } catch (err) {
      if (err.code === 'DUPLICATE_VOTE' || err.statusCode === 429) {
        return sendError(res, err.message, { code: 'DUPLICATE_VOTE' }, 429);
      }
      next(err);
    }
  }

  /**
   * Staff submission of FAQ draft from resolved ticket
   * POST /api/faqs/draft-from-ticket
   */
  static async submitDraftFromTicket(req, res, next) {
    try {
      const profile = req.profile || req.user;
      if (!profile || (profile.role !== 'STAFF' && profile.role !== 'SUPER_ADMIN')) {
        return sendError(res, 'FORBIDDEN: Only department staff and administrators can submit FAQ drafts.', { code: 'FORBIDDEN' }, 403);
      }

      const draft = await faqService.submitDraftFromTicket(req.body, profile);
      return sendSuccess(res, 'FAQ draft created successfully from resolved ticket', draft, 201);
    } catch (err) {
      if (err.statusCode === 403) {
        return sendError(res, err.message, { code: 'FORBIDDEN' }, 403);
      }
      if (err.statusCode === 400) {
        return sendError(res, err.message, { code: 'BAD_REQUEST' }, 400);
      }
      next(err);
    }
  }

  /**
   * Super Admin & Staff list FAQs
   * GET /api/faqs/admin/list
   */
  static async listFaqsAdmin(req, res, next) {
    try {
      const profile = req.profile || req.user;
      const { status, departmentId, search } = req.query;
      const items = await faqService.listFaqsAdmin({ status, departmentId, search }, profile);
      return sendSuccess(res, 'Administrative FAQs retrieved', items, 200);
    } catch (err) {
      if (err.statusCode === 403) {
        return sendError(res, err.message, { code: 'FORBIDDEN' }, 403);
      }
      next(err);
    }
  }

  /**
   * Super Admin Review, Approval & Publication
   * POST /api/faqs/:id/approve
   */
  static async approveFaq(req, res, next) {
    try {
      const profile = req.profile || req.user;
      const { id } = req.params;
      const faq = await faqService.approveAndPublishFaq(id, profile, req.body);
      return sendSuccess(res, 'FAQ approved and published to public knowledge base', faq, 200);
    } catch (err) {
      if (err.statusCode === 403) {
        return sendError(res, err.message, { code: 'FORBIDDEN' }, 403);
      }
      if (err.statusCode === 404) {
        return sendError(res, err.message, { code: 'NOT_FOUND' }, 404);
      }
      next(err);
    }
  }

  /**
   * Edit FAQ content and version bump
   * PATCH /api/faqs/:id
   */
  static async updateFaq(req, res, next) {
    try {
      const profile = req.profile || req.user;
      const { id } = req.params;
      const faq = await faqService.updateFaq(id, req.body, profile);
      return sendSuccess(res, 'FAQ updated and re-indexed', faq, 200);
    } catch (err) {
      if (err.statusCode === 403) {
        return sendError(res, err.message, { code: 'FORBIDDEN' }, 403);
      }
      if (err.statusCode === 404) {
        return sendError(res, err.message, { code: 'NOT_FOUND' }, 404);
      }
      next(err);
    }
  }

  /**
   * Retire FAQ (Invalidate from retrieval and public display)
   * POST /api/faqs/:id/retire
   */
  static async retireFaq(req, res, next) {
    try {
      const profile = req.profile || req.user;
      const { id } = req.params;
      const faq = await faqService.retireFaq(id, profile);
      return sendSuccess(res, 'FAQ retired and invalidated from public display and AI retrieval', faq, 200);
    } catch (err) {
      if (err.statusCode === 403) {
        return sendError(res, err.message, { code: 'FORBIDDEN' }, 403);
      }
      if (err.statusCode === 404) {
        return sendError(res, err.message, { code: 'NOT_FOUND' }, 404);
      }
      next(err);
    }
  }
}
