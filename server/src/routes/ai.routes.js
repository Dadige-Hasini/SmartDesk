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

// Phase 7: ML Query Classification & Advisory Routing Suggestions
router.post('/classify-query', requireAuth, AiController.classifyQuery);

// Phase 7: Semantic Search for FAQs & Ticket Deflection
router.post('/similar-faqs', requireAuth, AiController.getSimilarFaqs);
router.post('/deflection-event', requireAuth, AiController.recordDeflection);

// Phase 7: AI Usage, Retrieval Quality & ML Evaluation Analytics
router.get(
  '/analytics',
  requireAuth,
  requireRole('STAFF', 'SUPER_ADMIN'),
  AiController.getAiAnalytics
);

// Staff-facing Ticket Summarization (Department permission checked inside controller)
router.post(
  '/summarize-ticket',
  requireAuth,
  requireRole('STAFF', 'SUPER_ADMIN'),
  AiController.summarizeTicket
);

// Document Ingestion, Lifecycle & Approval (Staff / Super Admin only)
router.get(
  '/documents',
  requireAuth,
  requireRole('STAFF', 'SUPER_ADMIN'),
  AiController.listDocuments
);

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

router.post(
  '/documents/:id/retire',
  requireAuth,
  requireRole('STAFF', 'SUPER_ADMIN'),
  AiController.retireDocument
);

router.post(
  '/documents/:id/reindex',
  requireAuth,
  requireRole('STAFF', 'SUPER_ADMIN'),
  upload.single('file'),
  AiController.reindexDocument
);

export default router;
