import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';
import { requireAuth, requireActiveUser } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.use(requireActiveUser);

// Notifications endpoints
router.get('/', NotificationController.list);
router.get('/unread-count', NotificationController.unreadCount);
router.patch('/:id/read', NotificationController.markRead);
router.post('/read-all', NotificationController.markAllRead);

// Preferences endpoints
router.get('/preferences', NotificationController.getPreferences);
router.put('/preferences', NotificationController.updatePreferences);

export default router;
