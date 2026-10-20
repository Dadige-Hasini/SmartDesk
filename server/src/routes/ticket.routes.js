import { Router } from 'express';
import { ticketController } from '../controllers/ticket.controller.js';
import { requireAuth, requireActiveUser, requireRole } from '../middleware/auth.js';

const router = Router();

// All ticket routes require an authenticated and active user
router.use(requireAuth);
router.use(requireActiveUser);

// Metadata & Utilities
router.get('/meta/categories', (req, res, next) => ticketController.getCategories(req, res, next));
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

export default router;
