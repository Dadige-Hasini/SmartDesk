import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

// Health and Readiness probes
router.use('/', healthRoutes);

// Supabase Authentication & Profile routes
router.use('/auth', authRoutes);

// Root API information
router.get('/', (req, res) => {
  return sendSuccess(res, 'SmartDesk API is running', {
    version: '1.0.0',
    phase: 'Supabase Integration Phase',
    endpoints: {
      health: '/api/health',
      ready: '/api/ready',
      authMe: '/api/auth/me',
      departments: '/api/auth/departments',
    },
  });
});

export default router;
