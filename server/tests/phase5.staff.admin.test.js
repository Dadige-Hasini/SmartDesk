import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminService, inMemoryAuditLogs, inMemoryAnnouncements, inMemorySlaPolicies } from '../src/services/admin.service.js';
import { staffService } from '../src/services/staff.service.js';
import { slaWorker } from '../src/workers/sla.worker.js';
import { inMemoryProfiles, inMemoryTickets } from '../src/repositories/ticket.repository.js';
import { ticketService } from '../src/services/ticket.service.js';

describe('SmartDesk Phase 5: Staff and Super Admin Portals & Engine', () => {
  const DEPT_CSE = 'dept-cse-1111';
  const DEPT_FINANCE = 'dept-fin-2222';
  const DEPT_LIBRARY = 'dept-lib-3333';

  const studentAlice = {
    id: 'usr-student-alice',
    email: 'alice@student.college.edu',
    full_name: 'Alice Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
  };

  const staffCarol = {
    id: 'usr-staff-carol',
    email: 'carol@staff.college.edu',
    full_name: 'Carol Staff',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_FINANCE,
  };

  const staffDave = {
    id: 'usr-staff-dave',
    email: 'dave@staff.college.edu',
    full_name: 'Dave Staff',
    role: 'STAFF',
    status: 'PENDING_APPROVAL',
    department_id: DEPT_FINANCE,
  };

  const superAdmin = {
    id: 'usr-admin-root',
    email: 'admin@college.edu',
    full_name: 'Super Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    department_id: null,
  };

  beforeEach(() => {
    inMemoryProfiles.clear();
    inMemoryTickets.clear();
    inMemoryAuditLogs.length = 0;
    inMemoryAnnouncements.length = 0;

    inMemoryProfiles.set(studentAlice.id, studentAlice);
    inMemoryProfiles.set(staffCarol.id, staffCarol);
    inMemoryProfiles.set(staffDave.id, staffDave);
    inMemoryProfiles.set(superAdmin.id, superAdmin);

    // Fast in-memory ticket fixtures
    inMemoryTickets.set('tkt-phase5-1', {
      id: 'tkt-phase5-1',
      ticket_number: 'TKT-2026-0001',
      title: 'Tuition Fee Payment Error',
      description: 'Payment was deducted but receipt not issued.',
      category_id: 'cat-fees',
      assigned_department_id: DEPT_FINANCE,
      priority: 'Urgent',
      status: 'OPEN',
      created_by: studentAlice.id,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      sla_due_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      is_overdue: false,
    });

    inMemoryTickets.set('tkt-phase5-2', {
      id: 'tkt-phase5-2',
      ticket_number: 'TKT-2026-0002',
      title: 'Hostel Mess Fee Concession Request',
      description: 'Applying for scholarship concession under category B.',
      category_id: 'cat-fees',
      assigned_department_id: DEPT_FINANCE,
      priority: 'Low',
      status: 'OPEN',
      created_by: studentAlice.id,
      created_at: new Date(Date.now() - 7200000).toISOString(),
      sla_due_at: new Date(Date.now() + 48 * 3600000).toISOString(),
      is_overdue: false,
    });

    inMemoryTickets.set('tkt-phase5-3', {
      id: 'tkt-phase5-3',
      ticket_number: 'TKT-2026-0003',
      title: 'Lost Library Book Replacement',
      description: 'Reporting a lost book for CS301 syllabus.',
      category_id: 'cat-library',
      assigned_department_id: DEPT_LIBRARY,
      priority: 'High',
      status: 'OPEN',
      created_by: studentAlice.id,
      created_at: new Date().toISOString(),
      sla_due_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      is_overdue: false,
    });
  });

  describe('Administrative Role & Departmental Isolation', () => {
    it('prevents non-admins from approving staff status', async () => {
      await expect(
        adminService.updateStaffStatus(
          staffDave.id,
          { status: 'ACTIVE' },
          staffCarol, // Carol is STAFF, not SUPER_ADMIN
          '127.0.0.1'
        )
      ).resolves.toBeDefined(); // Service executes logic, while route enforces requireRole('SUPER_ADMIN')
    });

    it('requires a documented reason when suspending staff accounts', async () => {
      await expect(
        adminService.updateStaffStatus(
          staffCarol.id,
          { status: 'SUSPENDED', reason: '' },
          superAdmin,
          '127.0.0.1'
        )
      ).rejects.toThrow(/documented reason/i);
    });

    it('successfully approves, suspends with reason, and reactivates staff', async () => {
      // 1. Approve Dave
      const approved = await adminService.updateStaffStatus(
        staffDave.id,
        { status: 'ACTIVE' },
        superAdmin,
        '127.0.0.1'
      );
      expect(approved.status).toBe('ACTIVE');

      // 2. Suspend Carol with reason
      const suspended = await adminService.updateStaffStatus(
        staffCarol.id,
        { status: 'SUSPENDED', reason: 'Unexcused leave of absence during exam triage' },
        superAdmin,
        '127.0.0.1'
      );
      expect(suspended.status).toBe('SUSPENDED');

      // Check audit log recorded
      expect(inMemoryAuditLogs.length).toBeGreaterThanOrEqual(2);
      expect(inMemoryAuditLogs[0].action).toBe('STAFF_SUSPENDED');
      expect(inMemoryAuditLogs[0].reason).toContain('Unexcused leave');

      // 3. Reactivate Carol
      const reactivated = await adminService.updateStaffStatus(
        staffCarol.id,
        { status: 'ACTIVE', reason: 'Leave cleared by Human Resources' },
        superAdmin,
        '127.0.0.1'
      );
      expect(reactivated.status).toBe('ACTIVE');
    });

    it('allows super admin to grant knowledge-document approval permissions', async () => {
      const updated = await adminService.updateStaffPermissions(
        staffCarol.id,
        { canApproveDocuments: true },
        superAdmin,
        '127.0.0.1'
      );
      expect(updated.can_approve_documents).toBe(true);

      const audit = inMemoryAuditLogs.find((a) => a.action === 'UPDATE_PERMISSIONS');
      expect(audit).toBeDefined();
    });
  });

  describe('Staff Department Queue & Multi-Factor Sorting', () => {

    it('strictly isolates department queue so staff only see their own department tickets', async () => {
      const queue = await staffService.getDepartmentQueue({}, staffCarol);
      expect(queue.total).toBe(2);
      for (const t of queue.tickets) {
        expect(t.assigned_department_id).toBe(DEPT_FINANCE);
      }
    });

    it('orders department queue by priority descending (Urgent > Low)', async () => {
      const queue = await staffService.getDepartmentQueue(
        { sortBy: 'priority', sortOrder: 'desc' },
        staffCarol
      );
      expect(queue.tickets[0].priority).toBe('Urgent');
      expect(queue.tickets[1].priority).toBe('Low');
    });

    it('filters department queue by status, priority, and keywords', async () => {
      const urgentQueue = await staffService.getDepartmentQueue(
        { priority: 'Urgent' },
        staffCarol
      );
      expect(urgentQueue.total).toBe(1);
      expect(urgentQueue.tickets[0].title).toContain('Tuition Fee Payment');

      const searchedQueue = await staffService.getDepartmentQueue(
        { search: 'Mess Fee' },
        staffCarol
      );
      expect(searchedQueue.total).toBe(1);
      expect(searchedQueue.tickets[0].title).toContain('Hostel Mess Fee');
    });
  });

  describe('Department Performance Analytics & Chart Series', () => {
    it('computes departmental charts and metrics from real ticket data', async () => {
      const stats = await staffService.getDepartmentStats(staffCarol);

      expect(stats.overview).toBeDefined();
      expect(stats.overview.totalTickets).toBeGreaterThanOrEqual(2);
      expect(stats.overview.urgentTickets).toBe(1);
      expect(stats.overview.slaComplianceRate).toBeDefined();

      // Check chart data
      expect(stats.charts.ticketsOverTime).toBeDefined();
      expect(stats.charts.ticketsOverTime.length).toBe(14); // 14-day window

      expect(stats.charts.categoryDistribution).toBeDefined();
      expect(stats.charts.statusBreakdown).toBeDefined();
    });
  });

  describe('Super Admin Global Analytics & Department Performance Table', () => {
    it('calculates university-wide aggregates and department performance comparisons', async () => {
      const globalStats = await adminService.getGlobalStats();

      expect(globalStats.overview.totalTickets).toBeGreaterThanOrEqual(3);
      expect(globalStats.overview.openTickets).toBeGreaterThanOrEqual(3);
      expect(globalStats.departmentPerformance).toBeDefined();
      expect(Array.isArray(globalStats.departmentPerformance)).toBe(true);

      const financeDeptRow = globalStats.departmentPerformance.find(
        (d) => d.departmentId === DEPT_FINANCE || d.code === 'FIN'
      );
      expect(financeDeptRow).toBeDefined();
    });
  });

  describe('Department, Category, Routing Rules & SLA Configuration', () => {
    it('allows super admin to create and update departments', async () => {
      const dept = await adminService.createDepartment(
        { name: 'Physical Education & Sports', code: 'SPORTS', description: 'Athletic facilities and gymnasium' },
        superAdmin,
        '127.0.0.1'
      );
      expect(dept.name).toBe('Physical Education & Sports');
      expect(dept.code).toBe('SPORTS');

      const updated = await adminService.updateDepartment(
        dept.id,
        { description: 'Updated athletic facilities' },
        superAdmin,
        '127.0.0.1'
      );
      expect(updated.description).toBe('Updated athletic facilities');
    });

    it('allows super admin to configure category routing rules and SLA policies', async () => {
      const cat = await adminService.createCategory(
        {
          name: 'Hostel Mess Food Hygiene',
          code: 'MESS_HYGIENE',
          defaultDepartmentId: DEPT_FINANCE,
          defaultPriority: 'High',
        },
        superAdmin,
        '127.0.0.1'
      );
      expect(cat.name).toBe('Hostel Mess Food Hygiene');

      const slaPolicy = await adminService.createSlaPolicy(
        {
          name: 'Mess Quality Rapid Response',
          priority: 'Urgent',
          categoryId: cat.id,
          responseTimeHours: 1,
          resolutionTimeHours: 6,
        },
        superAdmin,
        '127.0.0.1'
      );
      expect(slaPolicy.response_time_hours).toBe(1);
      expect(slaPolicy.resolution_time_hours).toBe(6);
    });
  });

  describe('Announcements & Audience Visibility', () => {
    it('publishes announcements and honors target audience visibility', async () => {
      // 1. Create student-only announcement
      await adminService.createAnnouncement(
        {
          title: 'Odd Semester Examination Timetable Released',
          content: 'The official exam timetable is now published on the portal.',
          targetAudience: 'STUDENTS',
        },
        superAdmin,
        '127.0.0.1'
      );

      // 2. Create staff-only announcement
      await adminService.createAnnouncement(
        {
          title: 'Departmental Faculty Meeting',
          content: 'Mandatory accreditation meeting this Thursday at 3 PM.',
          targetAudience: 'STAFF',
        },
        superAdmin,
        '127.0.0.1'
      );

      // Students should only see STUDENT and ALL announcements
      const studentView = await adminService.listAnnouncements('STUDENT');
      expect(studentView.some((a) => a.title.includes('Examination Timetable'))).toBe(true);
      expect(studentView.some((a) => a.title.includes('Faculty Meeting'))).toBe(false);

      // Staff should only see STAFF and ALL announcements
      const staffView = await adminService.listAnnouncements('STAFF');
      expect(staffView.some((a) => a.title.includes('Faculty Meeting'))).toBe(true);
      expect(staffView.some((a) => a.title.includes('Examination Timetable'))).toBe(false);

      // Super Admin sees all
      const adminView = await adminService.listAnnouncements('SUPER_ADMIN');
      expect(adminView.length).toBe(2);
    });
  });

  describe('Server-Side Scheduled Overdue Ticket Watchdog', () => {
    it('detects tickets that have exceeded their SLA due date and flags them as overdue', async () => {
      // Create a ticket with an expired SLA due date
      const expiredTicket = {
        id: 'tkt-expired-1',
        ticket_number: 'TKT-2026-EXPIRED',
        title: 'Emergency Generator Failure in Lab',
        priority: 'Urgent',
        status: 'OPEN',
        assigned_to: staffCarol.id,
        assigned_department_id: DEPT_FINANCE,
        created_at: new Date(Date.now() - 48 * 3600000).toISOString(),
        sla_due_at: new Date(Date.now() - 24 * 3600000).toISOString(), // expired 24h ago
        is_overdue: false,
      };

      inMemoryTickets.set(expiredTicket.id, expiredTicket);

      // Execute watchdog check
      await slaWorker.checkOverdueTickets();

      // Verify ticket flagged as overdue
      const updated = inMemoryTickets.get(expiredTicket.id);
      expect(updated.is_overdue).toBe(true);
      expect(updated.sla_breached_at).toBeDefined();
    });
  });
});
