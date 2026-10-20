import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { requireAuth, requireActiveUser, requireRole } from '../middleware/auth.js';

const router = Router();

// Strictly Super Admin Protected Barrier
router.use(requireAuth);
router.use(requireActiveUser);
router.use(requireRole('SUPER_ADMIN'));

// Global KPI & Department Performance Analytics
router.get('/stats', (req, res, next) => adminController.getGlobalStats(req, res, next));

// Staff Management
router.get('/staff', (req, res, next) => adminController.listStaff(req, res, next));
router.patch('/staff/:id/status', (req, res, next) => adminController.updateStaffStatus(req, res, next));
router.patch('/staff/:id/permissions', (req, res, next) => adminController.updateStaffPermissions(req, res, next));

// Departments
router.get('/departments', (req, res, next) => adminController.listDepartments(req, res, next));
router.post('/departments', (req, res, next) => adminController.createDepartment(req, res, next));
router.patch('/departments/:id', (req, res, next) => adminController.updateDepartment(req, res, next));

// Categories & Routing Rules
router.get('/categories', (req, res, next) => adminController.listCategories(req, res, next));
router.post('/categories', (req, res, next) => adminController.createCategory(req, res, next));
router.patch('/categories/:id', (req, res, next) => adminController.updateCategory(req, res, next));

// SLA Policies
router.get('/sla-policies', (req, res, next) => adminController.listSlaPolicies(req, res, next));
router.post('/sla-policies', (req, res, next) => adminController.createSlaPolicy(req, res, next));
router.patch('/sla-policies/:id', (req, res, next) => adminController.updateSlaPolicy(req, res, next));

// Announcements
router.get('/announcements', (req, res, next) => adminController.listAnnouncements(req, res, next));
router.post('/announcements', (req, res, next) => adminController.createAnnouncement(req, res, next));
router.patch('/announcements/:id', (req, res, next) => adminController.updateAnnouncement(req, res, next));
router.delete('/announcements/:id', (req, res, next) => adminController.deleteAnnouncement(req, res, next));

// System Audit Logs
router.get('/audit-logs', (req, res, next) => adminController.listAuditLogs(req, res, next));

export default router;
