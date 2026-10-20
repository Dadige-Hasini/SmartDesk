import { NotificationService } from '../services/notification.service.js';
import { responseHandler } from '../utils/response.js';

export class NotificationController {
  /**
   * GET /api/notifications
   */
  static async list(req, res, next) {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '20', 10);
      const unreadOnly = req.query.unreadOnly === 'true';

      const result = await NotificationService.getNotifications(req.user.id, {
        page,
        limit,
        unreadOnly,
      });

      return responseHandler.success(res, result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/notifications/unread-count
   */
  static async unreadCount(req, res, next) {
    try {
      const result = await NotificationService.getNotifications(req.user.id, {
        page: 1,
        limit: 1,
      });

      return responseHandler.success(res, { unreadCount: result.unreadCount });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/notifications/:id/read
   */
  static async markRead(req, res, next) {
    try {
      await NotificationService.markAsRead(req.params.id, req.user.id);
      return responseHandler.success(res, null, 'Notification marked as read');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/notifications/read-all
   */
  static async markAllRead(req, res, next) {
    try {
      await NotificationService.markAllAsRead(req.user.id);
      return responseHandler.success(res, null, 'All notifications marked as read');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/notifications/preferences
   */
  static async getPreferences(req, res, next) {
    try {
      const preferences = await NotificationService.getPreferences(req.user.id);
      return responseHandler.success(res, { preferences });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/notifications/preferences
   */
  static async updatePreferences(req, res, next) {
    try {
      const updated = await NotificationService.updatePreferences(req.user.id, req.body);
      return responseHandler.success(res, { preferences: updated }, 'Notification preferences updated');
    } catch (err) {
      next(err);
    }
  }
}
