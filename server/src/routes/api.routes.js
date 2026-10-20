import { Router } from 'express';
import healthRoutes from './health.routes.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

// Health and Readiness probes
router.use('/', healthRoutes);

// Root API information
router.get('/', (req, res) => {
  return sendSuccess(res, 'SmartDesk API is running', {
    version: '1.0.0',
    phase: 'Phase 0 - Foundation and Architecture',
    endpoints: {
      health: '/api/health',
      ready: '/api/ready',
    },
  });
});

export default router;
