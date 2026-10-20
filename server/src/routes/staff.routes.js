import { Router } from 'express';
import { staffController } from '../controllers/staff.controller.js';
import { requireAuth, requireActiveUser, requireRole } from '../middleware/auth.js';

const router = Router();

// Staff and Super Admin Protected Barrier
router.use(requireAuth);
router.use(requireActiveUser);
router.use(requireRole('STAFF', 'SUPER_ADMIN'));

// Department Queue & Sorting
router.get('/queue', (req, res, next) => staffController.getDepartmentQueue(req, res, next));

// Department Analytics & Charts Time Series
router.get('/stats', (req, res, next) => staffController.getDepartmentStats(req, res, next));

// Colleague Lookup for Ticket Assignments
router.get('/members', (req, res, next) => staffController.getDepartmentMembers(req, res, next));

export default router;
