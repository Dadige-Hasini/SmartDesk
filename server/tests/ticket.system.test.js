import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { ticketRepository, generateFallbackTicketNumber } from '../src/repositories/ticket.repository.js';
import { ticketService, ALLOWED_STATUS_TRANSITIONS } from '../src/services/ticket.service.js';

describe('SmartDesk Phase 2: Complete Ticket System', () => {
  // Test profiles
  const studentAlice = {
    id: '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    email: 'alice@college.edu',
    full_name: 'Alice Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: 'dept-cse-1111',
  };

  const studentBob = {
    id: '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    email: 'bob@college.edu',
    full_name: 'Bob Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: 'dept-ece-2222',
  };

  const staffFinance = {
    id: '33333333-cccc-cccc-cccc-cccccccccccc',
    email: 'staff.fin@college.edu',
    full_name: 'Carol Finance Staff',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: 'dept-fin-3333',
  };

  const staffLibrary = {
    id: '44444444-dddd-dddd-dddd-dddddddddddd',
    email: 'staff.lib@college.edu',
    full_name: 'David Library Staff',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: 'dept-lib-4444',
  };

  const superAdmin = {
    id: '55555555-eeee-eeee-eeee-eeeeeeeeeeee',
    email: 'admin@college.edu',
    full_name: 'Super Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    department_id: null,
  };

  const feeCategoryId = 'cat-fee-0001';
  const financeDeptId = 'dept-fin-3333';

  // 1. Ticket Number Generation & Uniqueness
  describe('Ticket Numbering & Sequences', () => {
    it('generates unique, collision-free human-readable ticket numbers', () => {
      const numbers = new Set();
      for (let i = 0; i < 50; i++) {
        const num = generateFallbackTicketNumber();
        expect(num).toMatch(/^TKT-\d{8}-\d{4}$/);
        expect(numbers.has(num)).toBe(false);
        numbers.add(num);
      }
      expect(numbers.size).toBe(50);
    });
  });

  // 2. Ticket Creation & Category-to-Department Routing
  describe('Ticket Creation & Category Routing', () => {
    it('creates ticket, separates student academic dept from assigned dept, and records CREATED event', async () => {
      // Mock category routing rule: Fee category routes to Finance department
      vi.spyOn(ticketRepository, 'findRoutingRuleByCategoryId').mockResolvedValueOnce({
        default_department_id: financeDeptId,
        default_priority: 'High',
      });

      const createdTicketMock = {
        id: 'tkt-uuid-001',
        ticket_number: 'TKT-20261020-0001',
        title: 'Tuition Fee Receipt Missing',
        description: 'Payment was debited from bank but portal shows fee unpaid.',
        category_id: feeCategoryId,
        priority: 'High',
        status: 'OPEN',
        created_by: studentAlice.id,
        student_department_id: studentAlice.department_id,
        assigned_department_id: financeDeptId,
        reopened_count: 0,
        tags: ['tuition', 'receipt'],
        is_confidential: false,
        sla_due_at: new Date(Date.now() + 24 * 3600000).toISOString(),
        created_at: new Date().toISOString(),
      };

      vi.spyOn(ticketRepository, 'createTicket').mockResolvedValueOnce(createdTicketMock);
      const recordEventSpy = vi.spyOn(ticketRepository, 'recordEvent').mockResolvedValueOnce({ id: 'evt-1' });

      const result = await ticketService.createTicket(
        {
          title: 'Tuition Fee Receipt Missing',
          description: 'Payment was debited from bank but portal shows fee unpaid.',
          categoryId: feeCategoryId,
          priority: 'High',
          tags: ['tuition', 'receipt'],
        },
        studentAlice
      );

      expect(result.id).toBe('tkt-uuid-001');
      expect(result.ticket_number).toBe('TKT-20261020-0001');
      expect(result.student_department_id).toBe('dept-cse-1111'); // Student is in CSE
      expect(result.assigned_department_id).toBe('dept-fin-3333'); // Assigned to Finance
      expect(recordEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'tkt-uuid-001',
          eventType: 'CREATED',
        })
      );
    });
  });

  // 3. Authorization & Scoping Restrictions
  describe('Role-Based Access Control on Tickets', () => {
    const aliceTicket = {
      id: 'tkt-alice-01',
      ticket_number: 'TKT-20261020-0010',
      title: 'Lab access request',
      description: 'Need access to CSE Lab 3',
      created_by: studentAlice.id,
      assigned_department_id: financeDeptId,
      status: 'OPEN',
      is_confidential: false,
    };

    it('denies Student Bob from reading Student Alice ticket', async () => {
      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(aliceTicket);

      await expect(ticketService.getTicket('tkt-alice-01', studentBob)).rejects.toThrow(
        /Access denied: You do not have permission to view tickets raised by other students/
      );
    });

    it('denies staff from Library from viewing tickets assigned to Finance', async () => {
      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(aliceTicket);

      await expect(ticketService.getTicket('tkt-alice-01', staffLibrary)).rejects.toThrow(
        /Access denied: This ticket belongs to a different department/
      );
    });

    it('allows staff in Finance to access tickets assigned to Finance', async () => {
      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(aliceTicket);
      vi.spyOn(ticketRepository, 'getEventsByTicketId').mockResolvedValueOnce([]);

      const ticket = await ticketService.getTicket('tkt-alice-01', staffFinance);
      expect(ticket.id).toBe('tkt-alice-01');
    });

    it('allows Super Admin full access across any department', async () => {
      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(aliceTicket);
      vi.spyOn(ticketRepository, 'getEventsByTicketId').mockResolvedValueOnce([]);

      const ticket = await ticketService.getTicket('tkt-alice-01', superAdmin);
      expect(ticket.id).toBe('tkt-alice-01');
    });
  });

  // 4. Status Machine & Transition Validation
  describe('Status Transition State Machine', () => {
    const baseTicket = {
      id: 'tkt-status-01',
      created_by: studentAlice.id,
      assigned_department_id: financeDeptId,
      status: 'OPEN',
      reopened_count: 0,
    };

    it('rejects illegal status transition (e.g. OPEN -> CLOSED directly)', async () => {
      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(baseTicket);

      await expect(
        ticketService.transitionStatus('tkt-status-01', { status: 'CLOSED' }, staffFinance)
      ).rejects.toThrow(/Invalid status transition from OPEN to CLOSED/);
    });

    it('requires resolutionSummary when transitioning to RESOLVED', async () => {
      const inProgressTicket = { ...baseTicket, status: 'IN_PROGRESS' };
      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(inProgressTicket);

      await expect(
        ticketService.transitionStatus('tkt-status-01', { status: 'RESOLVED', resolutionSummary: '' }, staffFinance)
      ).rejects.toThrow(/A detailed resolution summary .* is required to resolve a ticket/);
    });

    it('requires rejectionReason when transitioning to REJECTED', async () => {
      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(baseTicket);

      await expect(
        ticketService.transitionStatus('tkt-status-01', { status: 'REJECTED', rejectionReason: '' }, staffFinance)
      ).rejects.toThrow(/A documented rejection reason .* is required to reject a ticket/);
    });

    it('successfully transitions from IN_PROGRESS to RESOLVED with valid summary', async () => {
      const inProgressTicket = { ...baseTicket, status: 'IN_PROGRESS' };
      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(inProgressTicket);
      vi.spyOn(ticketRepository, 'updateTicket').mockResolvedValueOnce({
        ...inProgressTicket,
        status: 'RESOLVED',
        resolution_summary: 'Receipt regenerated and email confirmation dispatched to student.',
      });
      const recordEventSpy = vi.spyOn(ticketRepository, 'recordEvent').mockResolvedValueOnce({ id: 'evt-2' });

      const updated = await ticketService.transitionStatus(
        'tkt-status-01',
        {
          status: 'RESOLVED',
          resolutionSummary: 'Receipt regenerated and email confirmation dispatched to student.',
        },
        staffFinance
      );

      expect(updated.status).toBe('RESOLVED');
      expect(recordEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'RESOLVED' })
      );
    });
  });

  // 5. Staff Claiming and Assignment
  describe('Staff Claim & Assignment Actions', () => {
    const unassignedTicket = {
      id: 'tkt-claim-01',
      created_by: studentAlice.id,
      assigned_department_id: financeDeptId,
      assigned_to: null,
      status: 'OPEN',
    };

    it('claims ticket, sets assigned_to, and transitions OPEN to IN_PROGRESS', async () => {
      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(unassignedTicket);
      vi.spyOn(ticketRepository, 'updateTicket').mockResolvedValueOnce({
        ...unassignedTicket,
        assigned_to: staffFinance.id,
        status: 'IN_PROGRESS',
      });
      const recordEventSpy = vi.spyOn(ticketRepository, 'recordEvent').mockResolvedValueOnce({ id: 'evt-3' });

      const claimed = await ticketService.claimTicket('tkt-claim-01', staffFinance);

      expect(claimed.assigned_to).toBe(staffFinance.id);
      expect(claimed.status).toBe('IN_PROGRESS');
      expect(recordEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'ASSIGNED' })
      );
    });

    it('rejects student attempting to claim a ticket', async () => {
      await expect(ticketService.claimTicket('tkt-claim-01', studentAlice)).rejects.toThrow(
        /Students cannot claim tickets/
      );
    });
  });

  // 6. Student Reopening Policy: One reopening within 7 days
  describe('Student Reopening Policy (1 reopen within 7 days)', () => {
    it('allows student to reopen resolved ticket within 7 days', async () => {
      const resolvedTicket = {
        id: 'tkt-reopen-01',
        created_by: studentAlice.id,
        assigned_department_id: financeDeptId,
        status: 'RESOLVED',
        reopened_count: 0,
        resolved_at: new Date(Date.now() - 2 * 24 * 3600000).toISOString(), // 2 days ago
      };

      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(resolvedTicket);
      vi.spyOn(ticketRepository, 'updateTicket').mockResolvedValueOnce({
        ...resolvedTicket,
        status: 'IN_PROGRESS',
        reopened_count: 1,
      });
      const recordEventSpy = vi.spyOn(ticketRepository, 'recordEvent').mockResolvedValueOnce({ id: 'evt-4' });

      const reopened = await ticketService.reopenTicket(
        'tkt-reopen-01',
        { reason: 'Receipt amount still does not match portal ledger' },
        studentAlice
      );

      expect(reopened.status).toBe('IN_PROGRESS');
      expect(reopened.reopened_count).toBe(1);
      expect(recordEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'REOPENED' })
      );
    });

    it('rejects reopening if ticket was already reopened once (single reopen rule)', async () => {
      const alreadyReopenedTicket = {
        id: 'tkt-reopen-02',
        created_by: studentAlice.id,
        assigned_department_id: financeDeptId,
        status: 'RESOLVED',
        reopened_count: 1, // Already reopened!
        resolved_at: new Date(Date.now() - 1 * 24 * 3600000).toISOString(),
      };

      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(alreadyReopenedTicket);

      await expect(
        ticketService.reopenTicket(
          'tkt-reopen-02',
          { reason: 'Reopening for a second time' },
          studentAlice
        )
      ).rejects.toThrow(/College policy permits only a single reopening per ticket/);
    });

    it('rejects reopening if 7-day window has elapsed', async () => {
      const expiredTicket = {
        id: 'tkt-reopen-03',
        created_by: studentAlice.id,
        assigned_department_id: financeDeptId,
        status: 'RESOLVED',
        reopened_count: 0,
        resolved_at: new Date(Date.now() - 10 * 24 * 3600000).toISOString(), // 10 days ago (> 7 days)
      };

      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(expiredTicket);

      await expect(
        ticketService.reopenTicket(
          'tkt-reopen-03',
          { reason: 'Trying to reopen after 10 days' },
          studentAlice
        )
      ).rejects.toThrow(/The 7-day reopening window for this ticket has elapsed/);
    });
  });

  // 7. Student Ratings (1-5 stars)
  describe('Ticket Satisfaction Ratings', () => {
    it('allows student to submit 1-5 star rating on resolved ticket', async () => {
      const resolvedTicket = {
        id: 'tkt-rate-01',
        created_by: studentAlice.id,
        assigned_department_id: financeDeptId,
        status: 'RESOLVED',
      };

      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(resolvedTicket);
      vi.spyOn(ticketRepository, 'createRating').mockResolvedValueOnce({
        id: 'rat-1',
        ticket_id: 'tkt-rate-01',
        student_id: studentAlice.id,
        rating: 5,
        feedback: 'Very quick resolution, thank you!',
      });
      const recordEventSpy = vi.spyOn(ticketRepository, 'recordEvent').mockResolvedValueOnce({ id: 'evt-5' });

      const rating = await ticketService.rateTicket(
        'tkt-rate-01',
        { rating: 5, feedback: 'Very quick resolution, thank you!' },
        studentAlice
      );

      expect(rating.rating).toBe(5);
      expect(recordEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'RATED' })
      );
    });

    it('rejects rating an OPEN ticket that has not yet been resolved', async () => {
      const openTicket = {
        id: 'tkt-rate-02',
        created_by: studentAlice.id,
        status: 'OPEN',
      };

      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(openTicket);

      await expect(
        ticketService.rateTicket('tkt-rate-02', { rating: 4 }, studentAlice)
      ).rejects.toThrow(/Ratings can only be submitted for RESOLVED or CLOSED tickets/);
    });
  });

  // 8. Bulk Operations & CSV Export
  describe('Bulk Actions & CSV Export', () => {
    it('executes bulk close action for authorized staff', async () => {
      vi.spyOn(ticketRepository, 'bulkClose').mockResolvedValueOnce([
        { id: 'tkt-1', status: 'CLOSED' },
        { id: 'tkt-2', status: 'CLOSED' },
      ]);

      const result = await ticketService.bulkClose(
        {
          ticketIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
          resolutionSummary: 'Bulk resolved following university holiday update',
        },
        staffFinance
      );

      expect(result.length).toBe(2);
    });

    it('generates valid CSV export containing authorized tickets', async () => {
      vi.spyOn(ticketRepository, 'listTickets').mockResolvedValueOnce({
        tickets: [
          {
            ticket_number: 'TKT-20261020-0001',
            title: 'Sample CSV Ticket',
            status: 'OPEN',
            priority: 'Medium',
            category: { name: 'Fee & Payments' },
            assigned_department: { name: 'Finance & Accounts' },
            student_department: { name: 'Computer Science' },
            creator: { full_name: 'Alice Student' },
            assignee: null,
            created_at: '2026-10-20T10:00:00Z',
            resolved_at: null,
            sla_due_at: '2026-10-22T10:00:00Z',
            resolution_summary: null,
          },
        ],
        total: 1,
      });

      const csv = await ticketService.exportTicketsCsv({}, staffFinance);

      expect(csv).toContain('Ticket Number,Title,Status,Priority');
      expect(csv).toContain('"TKT-20261020-0001"');
      expect(csv).toContain('"Sample CSV Ticket"');
      expect(csv).toContain('"Finance & Accounts"');
    });
  });
});
