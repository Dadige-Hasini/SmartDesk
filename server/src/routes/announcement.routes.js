import { Router } from 'express';
import { adminService } from '../services/admin.service.js';
import { requireAuth, requireActiveUser } from '../middleware/auth.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(requireAuth);
router.use(requireActiveUser);

/**
 * @route   GET /api/announcements
 * @desc    Fetch active announcements visible to current student or staff user
 * @access  Private (Authenticated student/staff)
 */
router.get('/', async (req, res, next) => {
  try {
    const role = req.profile?.role || 'STUDENT';
    const announcements = await adminService.listAnnouncements(role);
    return sendSuccess(res, 'Active announcements retrieved successfully', announcements);
  } catch (err) {
    next(err);
  }
});

export default router;
