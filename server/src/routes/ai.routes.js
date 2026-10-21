import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { AiController } from '../controllers/ai.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Memory storage for document ingestion
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max document size
  },
});

// Dedicated rate limiter for AI generation endpoints
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE || '30', 10),
  message: {
    success: false,
    message: 'AI assistant rate limit reached. Please wait a moment before sending another message.',
    error: { code: 'RATE_LIMIT_EXCEEDED' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public status probe
router.get('/status', AiController.getStatus);

// Authenticated AI Chat & Ticket Assistance
router.post('/chat', requireAuth, aiRateLimiter, AiController.chat);
router.post('/suggest-ticket', requireAuth, aiRateLimiter, AiController.suggestTicket);
router.post('/feedback', requireAuth, AiController.recordFeedback);

// Staff-facing Ticket Summarization (Department permission checked inside controller)
router.post(
  '/summarize-ticket',
  requireAuth,
  requireRole('STAFF', 'SUPER_ADMIN'),
  AiController.summarizeTicket
);

// Document Ingestion & Approval (Staff / Super Admin only)
router.post(
  '/documents/upload',
  requireAuth,
  requireRole('STAFF', 'SUPER_ADMIN'),
  upload.single('file'),
  AiController.uploadDocument
);

router.put(
  '/documents/:id/approve',
  requireAuth,
  requireRole('STAFF', 'SUPER_ADMIN'),
  AiController.approveDocument
);

export default router;
