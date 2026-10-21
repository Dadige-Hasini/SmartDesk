import { Router } from 'express';
import { FaqController } from '../controllers/faq.controller.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

// 1. Public FAQ endpoints (open to all, no authentication required)
router.get('/', optionalAuth, FaqController.getPublicFaqs);

// 2. Staff / Admin Management List (must precede /:id)
router.get(
  '/admin/list',
  requireAuth,
  requireRole('STAFF', 'SUPER_ADMIN'),
  FaqController.listFaqsAdmin
);

// 3. Staff draft creation from resolved ticket
router.post(
  '/draft-from-ticket',
  requireAuth,
  requireRole('STAFF', 'SUPER_ADMIN'),
  FaqController.submitDraftFromTicket
);

// 4. Single FAQ view and voting (public)
router.get('/:id', optionalAuth, FaqController.getFaqById);
router.post('/:id/vote', optionalAuth, FaqController.voteFaq);

// 5. Super Admin review, approval, update, retirement
router.post(
  '/:id/approve',
  requireAuth,
  requireRole('SUPER_ADMIN', 'STAFF'),
  FaqController.approveFaq
);

router.patch(
  '/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'STAFF'),
  FaqController.updateFaq
);

router.post(
  '/:id/retire',
  requireAuth,
  requireRole('SUPER_ADMIN', 'STAFF'),
  FaqController.retireFaq
);

export default router;
