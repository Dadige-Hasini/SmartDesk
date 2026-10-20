import { Router } from 'express';
import { sendSuccess } from '../utils/response.js';
import { supabaseClient } from '../config/supabase.js';

const router = Router();

/**
 * @route   GET /api/health
 * @desc    Liveness probe to confirm API server is responsive
 */
router.get('/health', (req, res) => {
  return sendSuccess(res, 'SmartDesk API service is healthy', {
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * @route   GET /api/ready
 * @desc    Readiness probe to confirm downstream dependencies without secret exposure
 */
router.get('/ready', async (req, res) => {
  let dbStatus = 'unconfigured';

  if (supabaseClient) {
    try {
      // Light query to verify database liveness
      const { error } = await supabaseClient
        .from('departments')
        .select('id')
        .limit(1);

      // If table doesn't exist yet (Phase 0), check if client initialized
      if (!error || error.code === '42P01') {
        dbStatus = 'connected';
      } else {
        dbStatus = 'degraded';
      }
    } catch {
      dbStatus = 'degraded';
    }
  }

  const isReady = true;

  return sendSuccess(res, 'SmartDesk API readiness check completed', {
    status: isReady ? 'ready' : 'not_ready',
    services: {
      api: 'operational',
      database: dbStatus,
      storage: supabaseClient ? 'configured' : 'unconfigured',
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
