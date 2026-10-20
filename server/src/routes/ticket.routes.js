import { Router } from 'express';
import { ticketController } from '../controllers/ticket.controller.js';
import { CommentController } from '../controllers/comment.controller.js';
import { AttachmentController } from '../controllers/attachment.controller.js';
import { uploadAttachmentsMiddleware } from '../middlewares/upload.middleware.js';
import { requireAuth, requireActiveUser, requireRole } from '../middleware/auth.js';

const router = Router();

// All ticket routes require an authenticated and active user
router.use(requireAuth);
router.use(requireActiveUser);

// Metadata & Utilities
router.get('/meta/categories', (req, res, next) => ticketController.getCategories(req, res, next));
router.get('/stats/dashboard', (req, res, next) => ticketController.getDashboardStats(req, res, next));
router.get('/export/csv', requireRole('STAFF', 'SUPER_ADMIN'), (req, res, next) =>
  ticketController.exportCsv(req, res, next)
);

// Bulk Actions (Staff and Admin only)
router.post('/bulk/assign', requireRole('STAFF', 'SUPER_ADMIN'), (req, res, next) =>
  ticketController.bulkAssign(req, res, next)
);
router.post('/bulk/close', requireRole('STAFF', 'SUPER_ADMIN'), (req, res, next) =>
  ticketController.bulkClose(req, res, next)
);

// Core CRUD and Query
router.post('/', (req, res, next) => ticketController.createTicket(req, res, next));
router.get('/', (req, res, next) => ticketController.listTickets(req, res, next));
router.get('/:id', (req, res, next) => ticketController.getTicket(req, res, next));
router.patch('/:id', (req, res, next) => ticketController.updateTicket(req, res, next));

// State Transitions & Lifecycle Actions
router.patch('/:id/status', (req, res, next) => ticketController.transitionStatus(req, res, next));
router.post('/:id/claim', requireRole('STAFF', 'SUPER_ADMIN'), (req, res, next) =>
  ticketController.claimTicket(req, res, next)
);
router.post('/:id/assign', requireRole('STAFF', 'SUPER_ADMIN'), (req, res, next) =>
  ticketController.assignTicket(req, res, next)
);
router.post('/:id/reopen', (req, res, next) => ticketController.reopenTicket(req, res, next));
router.post('/:id/rate', (req, res, next) => ticketController.rateTicket(req, res, next));

// Phase 3: Comments & Internal Notes
router.get('/:id/comments', (req, res, next) => CommentController.listComments(req, res, next));
router.post('/:id/comments', uploadAttachmentsMiddleware, (req, res, next) =>
  CommentController.createComment(req, res, next)
);

// Phase 3: Attachments & Secure Downloads
router.get('/:id/attachments', (req, res, next) => AttachmentController.list(req, res, next));
router.post('/:id/attachments', uploadAttachmentsMiddleware, (req, res, next) =>
  AttachmentController.upload(req, res, next)
);
router.get('/:id/attachments/:attachmentId/download', (req, res, next) =>
  AttachmentController.download(req, res, next)
);

export default router;
