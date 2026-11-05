import { adminService } from '../services/admin.service.js';
import { sendSuccess, sendError } from '../utils/response.js';

export class AdminController {
  // Staff
  async listStaff(req, res, next) {
    try {
      const staff = await adminService.listStaff(req.query);
      return sendSuccess(res, 'Staff members retrieved successfully', staff);
    } catch (err) {
      next(err);
    }
  }

  async updateStaffStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const updated = await adminService.updateStaffStatus(id, { status, reason }, req.profile, ipAddress);
      return sendSuccess(res, `Staff member status updated to ${status}`, updated);
    } catch (err) {
      next(err);
    }
  }

  async updateStaffPermissions(req, res, next) {
    try {
      const { id } = req.params;
      const { canApproveDocuments } = req.body;
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const updated = await adminService.updateStaffPermissions(id, { canApproveDocuments }, req.profile, ipAddress);
      return sendSuccess(res, 'Staff permissions updated successfully', updated);
    } catch (err) {
      next(err);
    }
  }

  async updateStaffDepartment(req, res, next) {
    try {
      const { id } = req.params;
      const { departmentId } = req.body;
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const updated = await adminService.updateStaffDepartment(id, { departmentId }, req.profile, ipAddress);
      return sendSuccess(res, 'Staff department updated successfully', updated);
    } catch (err) {
      next(err);
    }
  }

  // Global Statistics
  async getGlobalStats(req, res, next) {
    try {
      const stats = await adminService.getGlobalStats();
      return sendSuccess(res, 'Global administrative metrics retrieved successfully', stats);
    } catch (err) {
      next(err);
    }
  }

  // Departments
  async listDepartments(req, res, next) {
    try {
      const depts = await adminService.listDepartments(true);
      return sendSuccess(res, 'Departments retrieved successfully', depts);
    } catch (err) {
      next(err);
    }
  }

  async createDepartment(req, res, next) {
    try {
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const dept = await adminService.createDepartment(req.body, req.profile, ipAddress);
      return sendSuccess(res, 'Department created successfully', dept, 201);
    } catch (err) {
      next(err);
    }
  }

  async updateDepartment(req, res, next) {
    try {
      const { id } = req.params;
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const updated = await adminService.updateDepartment(id, req.body, req.profile, ipAddress);
      return sendSuccess(res, 'Department updated successfully', updated);
    } catch (err) {
      next(err);
    }
  }

  // Categories & Routing
  async listCategories(req, res, next) {
    try {
      const categories = await adminService.listCategories();
      return sendSuccess(res, 'Categories retrieved successfully', categories);
    } catch (err) {
      next(err);
    }
  }

  async createCategory(req, res, next) {
    try {
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const cat = await adminService.createCategory(req.body, req.profile, ipAddress);
      return sendSuccess(res, 'Category created successfully', cat, 201);
    } catch (err) {
      next(err);
    }
  }

  async updateCategory(req, res, next) {
    try {
      const { id } = req.params;
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const updated = await adminService.updateCategory(id, req.body, req.profile, ipAddress);
      return sendSuccess(res, 'Category updated successfully', updated);
    } catch (err) {
      next(err);
    }
  }

  // SLA Policies
  async listSlaPolicies(req, res, next) {
    try {
      const policies = await adminService.listSlaPolicies();
      return sendSuccess(res, 'SLA policies retrieved successfully', policies);
    } catch (err) {
      next(err);
    }
  }

  async createSlaPolicy(req, res, next) {
    try {
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const policy = await adminService.createSlaPolicy(req.body, req.profile, ipAddress);
      return sendSuccess(res, 'SLA policy created successfully', policy, 201);
    } catch (err) {
      next(err);
    }
  }

  async updateSlaPolicy(req, res, next) {
    try {
      const { id } = req.params;
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const updated = await adminService.updateSlaPolicy(id, req.body, req.profile, ipAddress);
      return sendSuccess(res, 'SLA policy updated successfully', updated);
    } catch (err) {
      next(err);
    }
  }

  // Announcements
  async listAnnouncements(req, res, next) {
    try {
      const items = await adminService.listAnnouncements('SUPER_ADMIN');
      return sendSuccess(res, 'Announcements retrieved successfully', items);
    } catch (err) {
      next(err);
    }
  }

  async createAnnouncement(req, res, next) {
    try {
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const item = await adminService.createAnnouncement(req.body, req.profile, ipAddress);
      return sendSuccess(res, 'Announcement published successfully', item, 201);
    } catch (err) {
      next(err);
    }
  }

  async updateAnnouncement(req, res, next) {
    try {
      const { id } = req.params;
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const updated = await adminService.updateAnnouncement(id, req.body, req.profile, ipAddress);
      return sendSuccess(res, 'Announcement updated successfully', updated);
    } catch (err) {
      next(err);
    }
  }

  async deleteAnnouncement(req, res, next) {
    try {
      const { id } = req.params;
      const ipAddress = req.ip || req.connection?.remoteAddress;
      await adminService.deleteAnnouncement(id, req.profile, ipAddress);
      return sendSuccess(res, 'Announcement deleted successfully', { id });
    } catch (err) {
      next(err);
    }
  }

  // Audit Logs
  async listAuditLogs(req, res, next) {
    try {
      const logs = await adminService.listAuditLogs(req.query);
      return sendSuccess(res, 'Administrative audit logs retrieved successfully', logs);
    } catch (err) {
      next(err);
    }
  }
}

export const adminController = new AdminController();
