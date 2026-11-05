import { staffService } from '../services/staff.service.js';
import { adminService } from '../services/admin.service.js';
import { sendSuccess } from '../utils/response.js';

export class StaffController {
  async getDepartmentQueue(req, res, next) {
    try {
      const queue = await staffService.getDepartmentQueue(req.query, req.profile);
      return sendSuccess(res, 'Department ticket queue retrieved successfully', queue);
    } catch (err) {
      next(err);
    }
  }

  async getDepartmentStats(req, res, next) {
    try {
      const stats = await staffService.getDepartmentStats(req.profile, req.query);
      return sendSuccess(res, 'Department metrics and chart data retrieved successfully', stats);
    } catch (err) {
      next(err);
    }
  }

  async getDepartmentMembers(req, res, next) {
    try {
      const isSuperAdmin = req.profile.role === 'SUPER_ADMIN';
      let deptId = null;
      if (req.query.all === 'true' || req.query.all === true || req.query.departmentId === 'all') {
        deptId = null;
      } else if (req.query.departmentId) {
        deptId = req.query.departmentId;
      } else if (!isSuperAdmin) {
        deptId = req.profile.department_id;
      }

      const staffList = await adminService.listStaff({ departmentId: deptId, status: 'ACTIVE' });
      return sendSuccess(res, 'Department staff members retrieved successfully', staffList);
    } catch (err) {
      next(err);
    }
  }

  async getDepartments(req, res, next) {
    try {
      const departments = await adminService.listDepartments(false);
      return sendSuccess(res, 'Active departments retrieved successfully', departments);
    } catch (err) {
      next(err);
    }
  }
}

export const staffController = new StaffController();
