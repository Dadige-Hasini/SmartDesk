import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { ticketRepository, inMemoryProfiles, inMemoryTickets } from '../repositories/ticket.repository.js';

function getDbClient() {
  if (process.env.NODE_ENV === 'test') return null;
  return supabaseAdmin || supabaseClient;
}

// In-memory fallback stores for test and offline environments
export const inMemoryAuditLogs = [];
export const inMemoryAnnouncements = [];
export const inMemorySlaPolicies = [
  { id: 'sla-1', name: 'Urgent Priority SLA', priority: 'Urgent', category_id: null, response_time_hours: 2, resolution_time_hours: 8, is_active: true },
  { id: 'sla-2', name: 'High Priority SLA', priority: 'High', category_id: null, response_time_hours: 4, resolution_time_hours: 24, is_active: true },
  { id: 'sla-3', name: 'Medium Priority SLA', priority: 'Medium', category_id: null, response_time_hours: 8, resolution_time_hours: 48, is_active: true },
  { id: 'sla-4', name: 'Low Priority SLA', priority: 'Low', category_id: null, response_time_hours: 24, resolution_time_hours: 96, is_active: true },
];

export class AdminService {
  // --- Admin Audit Logging Helper ---
  async logAdminAction({ adminId, action, targetType, targetId, reason = null, oldValue = null, newValue = null, ipAddress = null }) {
    const entry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: String(targetId),
      reason,
      old_value: oldValue,
      new_value: newValue,
      ip_address: ipAddress,
      created_at: new Date().toISOString(),
    };

    const db = getDbClient();
    if (db) {
      try {
        await db.from('admin_audit_logs').insert(entry);
      } catch (err) {
        logger.warn('Failed to insert into admin_audit_logs in database, saving to memory', { error: err.message });
      }
    }
    inMemoryAuditLogs.unshift(entry);
    return entry;
  }

  // --- Staff Management ---

  async listStaff(query = {}) {
    const db = getDbClient();
    const { status, departmentId, search } = query;

    if (db) {
      try {
        let q = db
          .from('profiles')
          .select('id, full_name, role, status, email, phone_number, department_id, designation, can_approve_documents, created_at, updated_at, department:departments(id, name, code)')
          .in('role', ['STAFF', 'SUPER_ADMIN'])
          .order('created_at', { ascending: false });

        if (status) q = q.eq('status', status);
        if (departmentId && departmentId !== 'all') {
          q = q.or(`department_id.eq.${departmentId},role.eq.SUPER_ADMIN`);
        }

        const { data, error } = await q;
        if (!error && data) {
          let list = data;
          if (search) {
            const s = search.toLowerCase();
            list = list.filter(
              (p) =>
                p.full_name?.toLowerCase().includes(s) ||
                p.email?.toLowerCase().includes(s) ||
                p.designation?.toLowerCase().includes(s)
            );
          }
          return list;
        }
      } catch (err) {
        logger.warn('Failed to fetch staff from database, falling back', { error: err.message });
      }
    }

    // Memory fallback
    let staffList = Array.from(inMemoryProfiles.values()).filter(
      (p) => p.role === 'STAFF' || p.role === 'SUPER_ADMIN'
    );
    if (status) staffList = staffList.filter((s) => s.status === status);
    if (departmentId && departmentId !== 'all') {
      staffList = staffList.filter((s) => s.department_id === departmentId || s.role === 'SUPER_ADMIN');
    }
    if (search) {
      const s = search.toLowerCase();
      staffList = staffList.filter(
        (p) =>
          p.full_name?.toLowerCase().includes(s) ||
          p.email?.toLowerCase().includes(s)
      );
    }
    return staffList;
  }

  async updateStaffStatus(staffId, { status, reason }, adminProfile, ipAddress) {
    const validStatuses = ['ACTIVE', 'SUSPENDED', 'PENDING_APPROVAL'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    if (status === 'SUSPENDED' && (!reason || reason.trim().length < 5)) {
      throw new Error('A documented reason (minimum 5 characters) is required to suspend staff members.');
    }

    const db = getDbClient();
    let oldProfile = null;

    if (db && !inMemoryProfiles.has(staffId)) {
      try {
        const { data: current } = await db.from('profiles').select('*').eq('id', staffId).maybeSingle();
        oldProfile = current;

        const { data, error } = await db
          .from('profiles')
          .update({
            status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', staffId)
          .select('*, department:departments(id, name, code)')
          .maybeSingle();

        if (!error && data) {
          await this.logAdminAction({
            adminId: adminProfile.id,
            action: `STAFF_${status}`,
            targetType: 'STAFF',
            targetId: staffId,
            reason: reason || `Staff status updated to ${status}`,
            oldValue: { status: oldProfile?.status },
            newValue: { status },
            ipAddress,
          });
          return data;
        }
      } catch (err) {
        logger.warn('Database error updating staff status, using memory', { error: err.message });
      }
    }

    // Memory fallback
    const memStaff = inMemoryProfiles.get(staffId);
    if (!memStaff) {
      throw new Error('Staff member not found.');
    }
    const oldStatus = memStaff.status;
    memStaff.status = status;
    memStaff.updated_at = new Date().toISOString();

    await this.logAdminAction({
      adminId: adminProfile.id,
      action: `STAFF_${status}`,
      targetType: 'STAFF',
      targetId: staffId,
      reason: reason || `Staff status updated to ${status}`,
      oldValue: { status: oldStatus },
      newValue: { status },
      ipAddress,
    });

    return memStaff;
  }

  async updateStaffDepartment(staffId, { departmentId }, adminProfile, ipAddress) {
    const db = getDbClient();
    let oldProfile = null;

    if (db) {
      try {
        const { data: current } = await db.from('profiles').select('*').eq('id', staffId).maybeSingle();
        oldProfile = current;

        const { data, error } = await db
          .from('profiles')
          .update({
            department_id: departmentId || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', staffId)
          .select('*, department:departments(id, name, code)')
          .maybeSingle();

        if (error) throw new Error(error.message);

        if (data) {
          await this.logAdminAction({
            adminId: adminProfile.id,
            action: 'STAFF_DEPARTMENT_UPDATED',
            targetType: 'STAFF',
            targetId: staffId,
            reason: `Staff department updated to ${data.department?.name || 'Unassigned'}`,
            oldValue: { department_id: oldProfile?.department_id },
            newValue: { department_id: departmentId },
            ipAddress,
          });
          return data;
        }
      } catch (err) {
        logger.error('Failed to update staff department in database', { error: err.message });
        throw err;
      }
    }

    const mem = inMemoryProfiles.get(staffId);
    if (!mem) throw new Error('Staff member not found');
    mem.department_id = departmentId;
    inMemoryProfiles.set(staffId, mem);
    return mem;
  }

  async updateStaffPermissions(staffId, { canApproveDocuments }, adminProfile, ipAddress) {
    const db = getDbClient();
    const canApprove = Boolean(canApproveDocuments);

    if (db && !inMemoryProfiles.has(staffId)) {
      try {
        const { data, error } = await db
          .from('profiles')
          .update({
            can_approve_documents: canApprove,
            updated_at: new Date().toISOString(),
          })
          .eq('id', staffId)
          .select('*, department:departments(id, name, code)')
          .maybeSingle();

        if (!error && data) {
          await this.logAdminAction({
            adminId: adminProfile.id,
            action: 'UPDATE_PERMISSIONS',
            targetType: 'STAFF',
            targetId: staffId,
            reason: `Knowledge document approval permission set to ${canApprove}`,
            oldValue: null,
            newValue: { can_approve_documents: canApprove },
            ipAddress,
          });
          return data;
        }
      } catch (err) {
        logger.warn('Failed to update staff permissions in database', { error: err.message });
      }
    }

    const memStaff = inMemoryProfiles.get(staffId);
    if (memStaff) {
      memStaff.can_approve_documents = canApprove;
    }
    await this.logAdminAction({
      adminId: adminProfile.id,
      action: 'UPDATE_PERMISSIONS',
      targetType: 'STAFF',
      targetId: staffId,
      reason: `Knowledge document approval permission set to ${canApprove}`,
      oldValue: null,
      newValue: { can_approve_documents: canApprove },
      ipAddress,
    });
    return memStaff || { id: staffId, can_approve_documents: canApprove };
  }

  // --- Global System Statistics & Department Performance ---

  async getGlobalStats() {
    const db = getDbClient();

    // 1. Fetch tickets and profiles
    let allTickets = [];
    let allDepartments = [];
    let staffCount = 0;
    let pendingStaffCount = 0;
    let studentCount = 0;

    if (db) {
      try {
        const [ticketsRes, deptsRes, profilesRes] = await Promise.all([
          db.from('tickets').select('*, ratings(*)'),
          db.from('departments').select('*').eq('is_active', true),
          db.from('profiles').select('id, role, status'),
        ]);

        if (ticketsRes.data && ticketsRes.data.length > 0) allTickets = ticketsRes.data;
        if (deptsRes.data && deptsRes.data.length > 0) allDepartments = deptsRes.data;
        if (profilesRes.data) {
          for (const p of profilesRes.data) {
            if (p.role === 'STAFF') {
              staffCount += 1;
              if (p.status === 'PENDING_APPROVAL') pendingStaffCount += 1;
            } else if (p.role === 'STUDENT') {
              studentCount += 1;
            }
          }
        }
      } catch (err) {
        logger.warn('Failed to query global statistics from database, checking memory', { error: err.message });
      }
    }

    // If database query was empty or offline, use memory
    if (allTickets.length === 0) {
      allTickets = Array.from(inMemoryTickets.values());
    }
    if (allDepartments.length === 0) {
      allDepartments = [
        { id: '11111111-1111-1111-1111-111111111111', name: 'Computer Science & Engineering', code: 'CSE' },
        { id: '22222222-2222-2222-2222-222222222222', name: 'Electronics & Communication', code: 'ECE' },
        { id: '33333333-3333-3333-3333-333333333333', name: 'Hostel & Student Housing', code: 'HOSTEL' },
        { id: '44444444-4444-4444-4444-444444444444', name: 'Finance & Accounts Office', code: 'FIN' },
        { id: '55555555-5555-5555-5555-555555555555', name: 'Central Library', code: 'LIB' },
        { id: '66666666-6666-6666-6666-666666666666', name: 'Examination & Evaluation Cell', code: 'EXAM' },
      ];
    }

    // 2. Compute Global Aggregates
    const totalTickets = allTickets.length;
    let openTickets = 0;
    let resolvedTickets = 0;
    let compliantCount = 0;
    let totalResolutionHours = 0;
    let resolvedCount = 0;
    let totalRatings = 0;
    let ratedTicketsCount = 0;

    for (const t of allTickets) {
      if (['OPEN', 'IN_PROGRESS', 'AWAITING_INFO'].includes(t.status)) {
        openTickets += 1;
      } else if (['RESOLVED', 'CLOSED'].includes(t.status)) {
        resolvedTickets += 1;
        resolvedCount += 1;

        // SLA Compliance
        if (t.sla_due_at) {
          const resolvedTime = new Date(t.resolved_at || t.closed_at || t.updated_at).getTime();
          const dueTime = new Date(t.sla_due_at).getTime();
          if (resolvedTime <= dueTime) {
            compliantCount += 1;
          }
        } else {
          compliantCount += 1;
        }

        // Resolution Time
        const createdTime = new Date(t.created_at).getTime();
        const resolvedTime = new Date(t.resolved_at || t.closed_at || t.updated_at).getTime();
        const diffHours = (resolvedTime - createdTime) / 3600000;
        if (diffHours > 0) totalResolutionHours += diffHours;
      }

      // Ratings
      const r = t.ratings?.[0] || t.rating;
      if (r?.rating) {
        totalRatings += r.rating;
        ratedTicketsCount += 1;
      }
    }

    const slaComplianceRate =
      resolvedCount > 0 ? parseFloat(((compliantCount / resolvedCount) * 100).toFixed(1)) : 100;

    const avgResolutionHours =
      resolvedCount > 0 ? parseFloat((totalResolutionHours / resolvedCount).toFixed(1)) : null;

    let averageResolutionTime = 'N/A';
    if (avgResolutionHours !== null) {
      if (avgResolutionHours < 1) averageResolutionTime = `${Math.round(avgResolutionHours * 60)} mins`;
      else if (avgResolutionHours < 24) averageResolutionTime = `${avgResolutionHours} hrs`;
      else averageResolutionTime = `${(avgResolutionHours / 24).toFixed(1)} days`;
    }

    const averageSatisfaction =
      ratedTicketsCount > 0 ? parseFloat((totalRatings / ratedTicketsCount).toFixed(1)) : null;

    // 3. Department-wise Performance Breakdown
    const departmentPerformance = allDepartments.map((dept) => {
      const deptTickets = allTickets.filter((t) => t.assigned_department_id === dept.id);
      let deptOpen = 0;
      let deptResolved = 0;
      let deptCompliant = 0;
      let deptResolutionHours = 0;
      let deptRatingsSum = 0;
      let deptRatingsCount = 0;

      for (const t of deptTickets) {
        if (['OPEN', 'IN_PROGRESS', 'AWAITING_INFO'].includes(t.status)) {
          deptOpen += 1;
        } else if (['RESOLVED', 'CLOSED'].includes(t.status)) {
          deptResolved += 1;
          if (t.sla_due_at) {
            const resTime = new Date(t.resolved_at || t.closed_at || t.updated_at).getTime();
            const dueTime = new Date(t.sla_due_at).getTime();
            if (resTime <= dueTime) deptCompliant += 1;
          } else {
            deptCompliant += 1;
          }

          const cTime = new Date(t.created_at).getTime();
          const rTime = new Date(t.resolved_at || t.closed_at || t.updated_at).getTime();
          const dHours = (rTime - cTime) / 3600000;
          if (dHours > 0) deptResolutionHours += dHours;
        }

        const r = t.ratings?.[0] || t.rating;
        if (r?.rating) {
          deptRatingsSum += r.rating;
          deptRatingsCount += 1;
        }
      }

      const compliance =
        deptResolved > 0 ? parseFloat(((deptCompliant / deptResolved) * 100).toFixed(1)) : 100;
      const avgRes =
        deptResolved > 0 ? parseFloat((deptResolutionHours / deptResolved).toFixed(1)) : null;
      const avgRating =
        deptRatingsCount > 0 ? parseFloat((deptRatingsSum / deptRatingsCount).toFixed(1)) : null;

      return {
        departmentId: dept.id,
        name: dept.name,
        code: dept.code,
        totalTickets: deptTickets.length,
        openTickets: deptOpen,
        resolvedTickets: deptResolved,
        slaComplianceRate: compliance,
        averageResolutionHours: avgRes,
        averageSatisfaction: avgRating,
      };
    });

    return {
      overview: {
        totalTickets,
        openTickets,
        resolvedTickets,
        slaComplianceRate,
        averageResolutionTime,
        averageResolutionHours: avgResolutionHours,
        averageSatisfaction,
        staffCount,
        pendingStaffCount,
        studentCount,
      },
      departmentPerformance,
    };
  }

  // --- Department Management ---

  async listDepartments(includeInactive = false) {
    const db = getDbClient();
    if (db) {
      try {
        let q = db.from('departments').select('*').order('name');
        if (!includeInactive) q = q.eq('is_active', true);
        const { data, error } = await q;
        if (!error && data) return data;
      } catch (err) {
        logger.warn('Failed to query departments from database', { error: err.message });
      }
    }
    return [
      { id: '11111111-1111-1111-1111-111111111111', name: 'Information Technology (IT Services)', code: 'IT', is_active: true },
      { id: '22222222-2222-2222-2222-222222222222', name: 'Electronics & Communication', code: 'ECE', is_active: true },
      { id: '33333333-3333-3333-3333-333333333333', name: 'Hostel & Student Housing', code: 'HOSTEL', is_active: true },
      { id: '44444444-4444-4444-4444-444444444444', name: 'Finance & Accounts Office', code: 'FIN', is_active: true },
      { id: '55555555-5555-5555-5555-555555555555', name: 'Central Library', code: 'LIB', is_active: true },
      { id: '66666666-6666-6666-6666-666666666666', name: 'Examination & Evaluation Cell', code: 'EXAM', is_active: true },
      { id: '77777777-7777-7777-7777-777777777777', name: 'Student Affairs & Grievance Cell', code: 'STU', is_active: true },
    ];
  }

  async createDepartment(input, adminProfile, ipAddress) {
    if (!input.name || input.name.trim().length < 3) {
      throw new Error('Department name must be at least 3 characters.');
    }
    if (!input.code || input.code.trim().length < 2) {
      throw new Error('Department code must be at least 2 characters.');
    }

    const deptData = {
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      description: input.description?.trim() || null,
      is_active: input.is_active !== undefined ? Boolean(input.is_active) : true,
    };

    const db = getDbClient();
    if (db) {
      try {
        const { data, error } = await db.from('departments').insert(deptData).select().single();
        if (!error && data) {
          await this.logAdminAction({
            adminId: adminProfile.id,
            action: 'CREATE_DEPARTMENT',
            targetType: 'DEPARTMENT',
            targetId: data.id,
            reason: 'New department established',
            newValue: data,
            ipAddress,
          });
          return data;
        }
      } catch (err) {
        logger.warn('Failed to insert department in database, using memory', { error: err.message });
      }
    }

    const mockDept = { id: `dept-${Date.now()}`, ...deptData };
    await this.logAdminAction({
      adminId: adminProfile.id,
      action: 'CREATE_DEPARTMENT',
      targetType: 'DEPARTMENT',
      targetId: mockDept.id,
      reason: 'New department established',
      newValue: mockDept,
      ipAddress,
    });
    return mockDept;
  }

  async updateDepartment(id, input, adminProfile, ipAddress) {
    const db = getDbClient();
    const updates = { updated_at: new Date().toISOString() };
    if (input.name) updates.name = input.name.trim();
    if (input.code) updates.code = input.code.trim().toUpperCase();
    if (input.description !== undefined) updates.description = input.description?.trim() || null;
    if (input.is_active !== undefined) updates.is_active = Boolean(input.is_active);

    if (db) {
      try {
        const { data, error } = await db.from('departments').update(updates).eq('id', id).select().single();
        if (!error && data) {
          await this.logAdminAction({
            adminId: adminProfile.id,
            action: 'UPDATE_DEPARTMENT',
            targetType: 'DEPARTMENT',
            targetId: id,
            newValue: data,
            ipAddress,
          });
          return data;
        }
      } catch (err) {
        logger.warn('Failed to update department in database, using memory', { error: err.message });
      }
    }

    await this.logAdminAction({
      adminId: adminProfile.id,
      action: 'UPDATE_DEPARTMENT',
      targetType: 'DEPARTMENT',
      targetId: id,
      newValue: updates,
      ipAddress,
    });
    return { id, ...updates };
  }

  // --- Categories & Routing Rules Management ---

  async listCategories() {
    const db = getDbClient();
    if (db) {
      try {
        const { data, error } = await db
          .from('categories')
          .select('*, routing_rules:category_routing_rules(*, department:departments(id, name, code))')
          .order('name');
        if (!error && data) return data;
      } catch (err) {
        logger.warn('Failed to query categories with routing rules', { error: err.message });
      }
    }
    return [
      { id: 'cat-wifi', name: 'Hostel WiFi & Network', code: 'HOSTEL_WIFI', is_active: true },
      { id: 'cat-fee', name: 'Fee Receipts & Dues', code: 'FIN_FEES', is_active: true },
      { id: 'cat-exam', name: 'Exam Grades & Transcripts', code: 'EXAM_GRADES', is_active: true },
      { id: 'cat-grievance', name: 'Sensitive Grievance & Student Welfare', code: 'GRIEVANCE', is_active: true },
    ];
  }

  async createCategory(input, adminProfile, ipAddress) {
    if (!input.name || input.name.trim().length < 3) throw new Error('Category name must be at least 3 characters.');
    if (!input.code || input.code.trim().length < 2) throw new Error('Category code must be at least 2 characters.');
    if (!input.defaultDepartmentId) throw new Error('Default resolving department is required.');

    const catData = {
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      description: input.description?.trim() || null,
      is_active: input.is_active !== undefined ? Boolean(input.is_active) : true,
    };

    const db = getDbClient();
    if (db) {
      try {
        const { data: cat, error: catError } = await db.from('categories').insert(catData).select().single();
        if (!catError && cat) {
          // Create routing rule
          const ruleData = {
            category_id: cat.id,
            default_department_id: input.defaultDepartmentId,
            default_priority: input.defaultPriority || 'Medium',
            is_active: true,
          };
          await db.from('category_routing_rules').insert(ruleData).catch(() => {});

          await this.logAdminAction({
            adminId: adminProfile.id,
            action: 'CREATE_CATEGORY',
            targetType: 'CATEGORY',
            targetId: cat.id,
            newValue: { ...cat, rule: ruleData },
            ipAddress,
          });

          return cat;
        }
      } catch (err) {
        logger.warn('Failed to insert category in database, using memory fallback', { error: err.message });
      }
    }

    const mockCat = { id: `cat-${Date.now()}`, ...catData };
    await this.logAdminAction({
      adminId: adminProfile.id,
      action: 'CREATE_CATEGORY',
      targetType: 'CATEGORY',
      targetId: mockCat.id,
      newValue: mockCat,
      ipAddress,
    });
    return mockCat;
  }

  async updateCategory(id, input, adminProfile, ipAddress) {
    const db = getDbClient();
    const updates = { updated_at: new Date().toISOString() };
    if (input.name) updates.name = input.name.trim();
    if (input.code) updates.code = input.code.trim().toUpperCase();
    if (input.description !== undefined) updates.description = input.description?.trim() || null;
    if (input.is_active !== undefined) updates.is_active = Boolean(input.is_active);

    if (db) {
      const { data: cat, error } = await db.from('categories').update(updates).eq('id', id).select().single();
      if (error) throw new Error(error.message);

      // Update routing rule if provided
      if (input.defaultDepartmentId || input.defaultPriority) {
        const ruleUpdates = { updated_at: new Date().toISOString() };
        if (input.defaultDepartmentId) ruleUpdates.default_department_id = input.defaultDepartmentId;
        if (input.defaultPriority) ruleUpdates.default_priority = input.defaultPriority;

        await db
          .from('category_routing_rules')
          .update(ruleUpdates)
          .eq('category_id', id);
      }

      await this.logAdminAction({
        adminId: adminProfile.id,
        action: 'UPDATE_CATEGORY',
        targetType: 'CATEGORY',
        targetId: id,
        newValue: cat,
        ipAddress,
      });
      return cat;
    }

    return { id, ...updates };
  }

  // --- SLA Policies Management ---

  async listSlaPolicies() {
    const db = getDbClient();
    if (db) {
      try {
        const { data, error } = await db
          .from('sla_policies')
          .select('*, category:categories(id, name, code)')
          .order('resolution_time_hours', { ascending: true });
        if (!error && data) return data;
      } catch (err) {
        logger.warn('Failed to query SLA policies from database', { error: err.message });
      }
    }
    return inMemorySlaPolicies;
  }

  async createSlaPolicy(input, adminProfile, ipAddress) {
    if (!input.name || input.name.trim().length < 3) throw new Error('Policy name is required.');
    if (!['Low', 'Medium', 'High', 'Urgent'].includes(input.priority)) {
      throw new Error('Priority must be Low, Medium, High, or Urgent.');
    }
    const responseHours = parseInt(input.responseTimeHours, 10);
    const resolutionHours = parseInt(input.resolutionTimeHours, 10);
    if (isNaN(responseHours) || responseHours <= 0) throw new Error('Response time hours must be positive.');
    if (isNaN(resolutionHours) || resolutionHours <= 0) throw new Error('Resolution time hours must be positive.');

    const policyData = {
      name: input.name.trim(),
      priority: input.priority,
      category_id: input.categoryId || null,
      response_time_hours: responseHours,
      resolution_time_hours: resolutionHours,
      is_active: input.is_active !== undefined ? Boolean(input.is_active) : true,
    };

    const db = getDbClient();
    if (db) {
      try {
        const { data, error } = await db.from('sla_policies').insert(policyData).select().single();
        if (!error && data) {
          await this.logAdminAction({
            adminId: adminProfile.id,
            action: 'CREATE_SLA_POLICY',
            targetType: 'SLA_POLICY',
            targetId: data.id,
            newValue: data,
            ipAddress,
          });
          return data;
        }
      } catch (err) {
        logger.warn('Failed to insert SLA policy into database, using memory fallback', { error: err.message });
      }
    }

    const mock = { id: `sla-${Date.now()}`, ...policyData };
    inMemorySlaPolicies.push(mock);
    await this.logAdminAction({
      adminId: adminProfile.id,
      action: 'CREATE_SLA_POLICY',
      targetType: 'SLA_POLICY',
      targetId: mock.id,
      newValue: mock,
      ipAddress,
    });
    return mock;
  }

  async updateSlaPolicy(id, input, adminProfile, ipAddress) {
    const db = getDbClient();
    const updates = { updated_at: new Date().toISOString() };
    if (input.name) updates.name = input.name.trim();
    if (input.responseTimeHours) updates.response_time_hours = parseInt(input.responseTimeHours, 10);
    if (input.resolutionTimeHours) updates.resolution_time_hours = parseInt(input.resolutionTimeHours, 10);
    if (input.is_active !== undefined) updates.is_active = Boolean(input.is_active);

    if (db) {
      const { data, error } = await db.from('sla_policies').update(updates).eq('id', id).select().single();
      if (error) throw new Error(error.message);

      await this.logAdminAction({
        adminId: adminProfile.id,
        action: 'UPDATE_SLA_POLICY',
        targetType: 'SLA_POLICY',
        targetId: id,
        newValue: data,
        ipAddress,
      });
      return data;
    }

    const idx = inMemorySlaPolicies.findIndex((s) => s.id === id);
    if (idx !== -1) {
      inMemorySlaPolicies[idx] = { ...inMemorySlaPolicies[idx], ...updates };
      return inMemorySlaPolicies[idx];
    }
    return { id, ...updates };
  }

  // --- Announcements Management ---

  async listAnnouncements(userRole = 'STUDENT') {
    const db = getDbClient();
    if (db) {
      try {
        let q = db
          .from('announcements')
          .select('*, author:profiles(id, full_name, role)')
          .order('published_at', { ascending: false });

        if (userRole === 'STUDENT') {
          q = q.eq('is_active', true).in('target_audience', ['ALL', 'STUDENTS']);
        } else if (userRole === 'STAFF') {
          q = q.eq('is_active', true).in('target_audience', ['ALL', 'STAFF']);
        }
        // Super Admin sees all

        const { data, error } = await q;
        if (!error && data) return data;
      } catch (err) {
        logger.warn('Failed to query announcements from database', { error: err.message });
      }
    }

    let filtered = [...inMemoryAnnouncements];
    if (userRole === 'STUDENT') {
      filtered = filtered.filter((a) => a.is_active && ['ALL', 'STUDENTS'].includes(a.target_audience));
    } else if (userRole === 'STAFF') {
      filtered = filtered.filter((a) => a.is_active && ['ALL', 'STAFF'].includes(a.target_audience));
    }
    return filtered;
  }

  async createAnnouncement(input, adminProfile, ipAddress) {
    if (!input.title || input.title.trim().length < 3) throw new Error('Announcement title is required.');
    if (!input.content || input.content.trim().length < 5) throw new Error('Announcement content is required.');

    const annData = {
      title: input.title.trim(),
      content: input.content.trim(),
      target_audience: input.targetAudience || 'ALL',
      is_active: input.is_active !== undefined ? Boolean(input.is_active) : true,
      author_id: adminProfile.id,
      published_at: input.publishedAt || new Date().toISOString(),
      expires_at: input.expiresAt || null,
    };

    const db = getDbClient();
    if (db) {
      try {
        const { data, error } = await db.from('announcements').insert(annData).select().single();
        if (!error && data) {
          await this.logAdminAction({
            adminId: adminProfile.id,
            action: 'CREATE_ANNOUNCEMENT',
            targetType: 'ANNOUNCEMENT',
            targetId: data.id,
            newValue: data,
            ipAddress,
          });
          return data;
        }
      } catch (err) {
        logger.warn('Failed to insert announcement into database, using memory fallback', { error: err.message });
      }
    }

    const mock = { id: `ann-${Date.now()}`, ...annData, author: adminProfile };
    inMemoryAnnouncements.unshift(mock);
    await this.logAdminAction({
      adminId: adminProfile.id,
      action: 'CREATE_ANNOUNCEMENT',
      targetType: 'ANNOUNCEMENT',
      targetId: mock.id,
      newValue: mock,
      ipAddress,
    });
    return mock;
  }

  async updateAnnouncement(id, input, adminProfile, ipAddress) {
    const db = getDbClient();
    const updates = { updated_at: new Date().toISOString() };
    if (input.title) updates.title = input.title.trim();
    if (input.content) updates.content = input.content.trim();
    if (input.targetAudience) updates.target_audience = input.targetAudience;
    if (input.is_active !== undefined) updates.is_active = Boolean(input.is_active);
    if (input.expiresAt !== undefined) updates.expires_at = input.expiresAt;

    if (db) {
      const { data, error } = await db.from('announcements').update(updates).eq('id', id).select().single();
      if (error) throw new Error(error.message);

      await this.logAdminAction({
        adminId: adminProfile.id,
        action: 'UPDATE_ANNOUNCEMENT',
        targetType: 'ANNOUNCEMENT',
        targetId: id,
        newValue: data,
        ipAddress,
      });
      return data;
    }

    const idx = inMemoryAnnouncements.findIndex((a) => a.id === id);
    if (idx !== -1) {
      inMemoryAnnouncements[idx] = { ...inMemoryAnnouncements[idx], ...updates };
      return inMemoryAnnouncements[idx];
    }
    return { id, ...updates };
  }

  async deleteAnnouncement(id, adminProfile, ipAddress) {
    const db = getDbClient();
    if (db) {
      await db.from('announcements').delete().eq('id', id);
    }
    const idx = inMemoryAnnouncements.findIndex((a) => a.id === id);
    if (idx !== -1) inMemoryAnnouncements.splice(idx, 1);

    await this.logAdminAction({
      adminId: adminProfile.id,
      action: 'DELETE_ANNOUNCEMENT',
      targetType: 'ANNOUNCEMENT',
      targetId: id,
      reason: 'Announcement removed by Super Admin',
      ipAddress,
    });
    return { id, deleted: true };
  }

  // --- Audit Logs Review ---

  async listAuditLogs(query = {}) {
    const db = getDbClient();
    const { targetType, adminId, page = 1, limit = 50 } = query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    if (db) {
      try {
        let q = db
          .from('admin_audit_logs')
          .select('*, admin:profiles(id, full_name, email, role)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + parseInt(limit, 10) - 1);

        if (targetType) q = q.eq('target_type', targetType);
        if (adminId) q = q.eq('admin_id', adminId);

        const { data, count, error } = await q;
        if (!error && data) {
          return {
            items: data,
            total: count || data.length,
            page: parseInt(page, 10),
            totalPages: Math.ceil((count || data.length) / parseInt(limit, 10)) || 1,
          };
        }
      } catch (err) {
        logger.warn('Failed to query admin_audit_logs from database', { error: err.message });
      }
    }

    let logs = [...inMemoryAuditLogs];
    if (targetType) logs = logs.filter((l) => l.target_type === targetType);
    if (adminId) logs = logs.filter((l) => l.admin_id === adminId);

    const paginated = logs.slice(offset, offset + parseInt(limit, 10));
    return {
      items: paginated,
      total: logs.length,
      page: parseInt(page, 10),
      totalPages: Math.ceil(logs.length / parseInt(limit, 10)) || 1,
    };
  }
}

export const adminService = new AdminService();
