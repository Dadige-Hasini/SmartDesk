import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import ticketRoutes from './ticket.routes.js';
import notificationRoutes from './notification.routes.js';
import adminRoutes from './admin.routes.js';
import staffRoutes from './staff.routes.js';
import announcementRoutes from './announcement.routes.js';
import aiRoutes from './ai.routes.js';
import faqRoutes from './faq.routes.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

// Health and Readiness probes
router.use('/', healthRoutes);

// Supabase Authentication & Profile routes
router.use('/auth', authRoutes);

// Core Ticket Management routes
router.use('/tickets', ticketRoutes);

// Notifications and User Preferences routes
router.use('/notifications', notificationRoutes);

// Phase 5: Super Admin Management routes
router.use('/admin', adminRoutes);

// Phase 5: Staff Department Portal routes
router.use('/staff', staffRoutes);

// Phase 5: Public/User Announcements
router.use('/announcements', announcementRoutes);

// Phase 6 & 7: Production-Oriented AI Assistant & RAG routes
router.use('/ai', aiRoutes);

// Phase 8: Public & Managed Knowledge Base / FAQs
router.use('/faqs', faqRoutes);

// Root API information
router.get('/', (req, res) => {
  return sendSuccess(res, 'SmartDesk API is running', {
    version: '1.0.0',
    phase: 'Phase 3 — Comments, Attachments & Notifications',
    endpoints: {
      health: '/api/health',
      ready: '/api/ready',
      authMe: '/api/auth/me',
      departments: '/api/auth/departments',
      tickets: '/api/tickets',
      ticketCategories: '/api/tickets/meta/categories',
      notifications: '/api/notifications',
      notificationPreferences: '/api/notifications/preferences',
    },
  });
});

export default router;
