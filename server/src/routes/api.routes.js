import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import ticketRoutes from './ticket.routes.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

// Health and Readiness probes
router.use('/', healthRoutes);

// Supabase Authentication & Profile routes
router.use('/auth', authRoutes);

// Core Ticket Management routes
router.use('/tickets', ticketRoutes);

// Root API information
router.get('/', (req, res) => {
  return sendSuccess(res, 'SmartDesk API is running', {
    version: '1.0.0',
    phase: 'Phase 2 — Complete Ticket System',
    endpoints: {
      health: '/api/health',
      ready: '/api/ready',
      authMe: '/api/auth/me',
      departments: '/api/auth/departments',
      tickets: '/api/tickets',
      ticketCategories: '/api/tickets/meta/categories',
    },
  });
});

export default router;
