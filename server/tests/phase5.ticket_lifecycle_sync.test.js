import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ticketService } from '../src/services/ticket.service.js';
import { staffService } from '../src/services/staff.service.js';
import { CommentService } from '../src/services/comment.service.js';
import { inMemoryTickets, inMemoryProfiles, inMemoryEvents, ticketRepository } from '../src/repositories/ticket.repository.js';
import { inMemoryAuditEvents } from '../src/services/audit.service.js';
import { inMemoryNotifications } from '../src/services/notification.service.js';
import { inMemoryComments } from '../src/services/comment.service.js';

describe('Phase 5: Connect Student Tickets to Staff Queues — Full Lifecycle Integration', () => {
  const DEPT_FINANCE = '44444444-4444-4444-4444-444444444444';
  const DEPT_CSE = '11111111-1111-1111-1111-111111111111';
  const DEPT_EXAM = '66666666-6666-6666-6666-666666666666';
  const DEPT_TRIAGE_AFFAIRS = '77777777-7777-7777-7777-777777777777';

  const studentAlice = {
    id: 'usr-student-alice',
    email: 'alice@student.college.edu',
    full_name: 'Alice Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
    roll_number: '2024BCSE001',
  };

  const studentBob = {
    id: 'usr-student-bob',
    email: 'bob@student.college.edu',
    full_name: 'Bob Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
    roll_number: '2024BCSE002',
  };

  const staffFinanceCarol = {
    id: 'usr-staff-carol',
    email: 'carol@staff.college.edu',
    full_name: 'Carol Finance Staff',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_FINANCE,
    department_code: 'FIN',
  };

  const staffCseProf = {
    id: 'usr-staff-cse',
    email: 'prof.cse@college.edu',
    full_name: 'Prof. CSE Staff',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
    department_code: 'CSE',
  };

  const triageOfficer = {
    id: 'usr-staff-triage',
    email: 'triage@college.edu',
    full_name: 'Student Affairs Triage Officer',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_TRIAGE_AFFAIRS,
    department_code: 'AFFAIRS',
    can_review_grievances: true,
  };

  beforeEach(() => {
    inMemoryTickets.clear();
    inMemoryProfiles.clear();
    inMemoryEvents.clear();
    inMemoryAuditEvents.length = 0;
    inMemoryNotifications.length = 0;
    inMemoryComments.length = 0;

    inMemoryProfiles.set(studentAlice.id, studentAlice);
    inMemoryProfiles.set(studentBob.id, studentBob);
    inMemoryProfiles.set(staffFinanceCarol.id, staffFinanceCarol);
    inMemoryProfiles.set(staffCseProf.id, staffCseProf);
    inMemoryProfiles.set(triageOfficer.id, triageOfficer);
  });

  describe('1. Student Submission & End-to-End Creation Lifecycle', () => {
    it('creates a ticket with unique tracking number, SLA deadlines, audit logs, and permitted notification', async () => {
      const input = {
        title: 'Tuition Fee Payment Deducted but Pending in ERP',
        description: 'Semester 4 tuition was debited from bank via UPI Ref 998811, but ERP portal still displays fees unpaid.',
        categoryId: 'c1000000-0000-0000-0000-000000000002', // TUITION_FEES
        priority: 'High',
        tags: ['tuition', 'fee-receipt', 'upi'],
        isConfidential: false,
      };

      const ticket = await ticketService.createTicket(input, studentAlice);

      // 1. Validated and persisted
      expect(ticket).toBeDefined();
      expect(ticket.id).toBeDefined();
      expect(ticket.title).toBe(input.title);
      expect(ticket.status).toBe('OPEN');
      expect(ticket.created_by).toBe(studentAlice.id);

      // 2. Unique ticket number assigned
      expect(ticket.ticket_number).toMatch(/^TKT-/);

      // 3. Routed to Finance department using canonical taxonomy / routing rules
      expect(ticket.assigned_department_id).toBe(DEPT_FINANCE);

      // 4. SLA policy applied
      expect(ticket.first_response_due_at).toBeDefined();
      expect(ticket.resolution_due_at).toBeDefined();
      expect(ticket.sla_due_at).toBeDefined();
      expect(new Date(ticket.resolution_due_at).getTime()).toBeGreaterThan(Date.now());

      // 5. Append-only audit event recorded
      const auditEvent = inMemoryAuditEvents.find(
        (a) => a.action === 'TICKET_CREATED' && a.entityId === ticket.id
      );
      expect(auditEvent).toBeDefined();
      expect(auditEvent.actor_id).toBe(studentAlice.id);
      expect(auditEvent.metadata.ticket_number).toBe(ticket.ticket_number);

      // 6. Ticket events recorded
      const events = await ticketRepository.getEventsByTicketId(ticket.id);
      expect(events.some((e) => e.event_type === 'CREATED')).toBe(true);

      // 7. Permitted student notification triggered
      const notif = inMemoryNotifications.find(
        (n) => (n.recipient_id || n.recipientId) === studentAlice.id
      );
      expect(notif).toBeDefined();
      expect(notif.type || notif.eventType).toBe('TICKET_CREATED');
      expect(notif.title).toContain(ticket.ticket_number);

      // 8. Unassigned by default
      expect(ticket.assigned_to ?? null).toBeNull();
    });

    it('routes low-confidence or unmatched categories to authorized Central Triage Desk rather than arbitrary department', async () => {
      const input = {
        title: 'Unusual query about campus vendor policy',
        description: 'General inquiry about non-academic food vendors outside campus gates.',
        categoryId: 'cat-unmatched-999', // Unknown/unmapped category
        priority: 'Medium',
      };

      const ticket = await ticketService.createTicket(input, studentAlice);

      expect(ticket).toBeDefined();
      // Routed to Student Affairs & Grievances authorized triage desk
      expect(ticket.assigned_department_id).toBe(DEPT_TRIAGE_AFFAIRS);
      expect(ticket.requires_triage).toBe(true);
      expect(ticket.routing_rationale).toMatch(/triage/i);

      // Audit log captures authorized triage routing
      const audit = inMemoryAuditEvents.find((a) => a.entityId === ticket.id && a.action === 'TICKET_CREATED');
      expect(audit.metadata.requires_triage).toBe(true);
      expect(audit.metadata.routing_rationale).toMatch(/triage/i);
    });
  });

  describe('2. Student My Tickets vs. Staff Department Queue Synchronization', () => {
    it('synchronizes ticket appearance in student list and responsible staff queue, while keeping unassigned visible', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Hostel Wi-Fi access credentials not working',
          description: 'Cannot connect to college hostel wireless network in Block B.',
          categoryId: 'c1000000-0000-0000-0000-000000000006', // CAMPUS_IT
          priority: 'Medium',
        },
        studentAlice
      );

      // 1. Appears in Student Alice My Tickets
      const studentTickets = await ticketService.listTickets({ page: 1, limit: 10 }, studentAlice);
      expect(studentTickets.tickets.some((t) => t.id === ticket.id)).toBe(true);

      // 2. Strictly NOT visible to Student Bob (RLS & role scoping)
      const bobTickets = await ticketService.listTickets({ page: 1, limit: 10 }, studentBob);
      expect(bobTickets.tickets.some((t) => t.id === ticket.id)).toBe(false);

      // 3. Appears in responsible department staff queue (CSE / IT)
      const cseQueue = await staffService.getDepartmentQueue(
        { view: 'department_queue' },
        staffCseProf
      );
      const inQueue = cseQueue.tickets.find((t) => t.id === ticket.id);
      expect(inQueue).toBeDefined();
      // Verify unassigned tickets remain visible in the queue
      expect(inQueue.assigned_to ?? null).toBeNull();

      // 4. Isolated from another department (Finance Staff cannot see CSE IT tickets)
      const finQueue = await staffService.getDepartmentQueue(
        { view: 'department_queue' },
        staffFinanceCarol
      );
      expect(finQueue.tickets.some((t) => t.id === ticket.id)).toBe(false);
    });
  });

  describe('3. Staff Triage, Claiming, and Status Transitions', () => {
    it('allows authorized staff to claim, request information, and resolve tickets with real-time audit trail', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Duplicate fee debit on payment portal',
          description: 'Payment was charged twice during semester registration.',
          categoryId: 'c1000000-0000-0000-0000-000000000002',
          priority: 'High',
        },
        studentAlice
      );

      // Initial state: OPEN and unassigned
      expect(ticket.status).toBe('OPEN');
      expect(ticket.assigned_to ?? null).toBeNull();

      // Staff Carol claims the ticket
      const claimed = await ticketService.claimTicket(ticket.id, staffFinanceCarol);
      expect(claimed.assigned_to).toBe(staffFinanceCarol.id);
      expect(claimed.status).toBe('IN_PROGRESS');

      // Verify audit event for assignment
      const assignAudit = inMemoryAuditEvents.find(
        (a) => a.action === 'TICKET_ASSIGNED' && a.entityId === ticket.id
      );
      expect(assignAudit).toBeDefined();
      expect(assignAudit.metadata.assignedTo).toBe(staffFinanceCarol.id);

      // Staff Carol transitions ticket to AWAITING_INFO to request transaction UTR
      const awaiting = await ticketService.transitionStatus(
        ticket.id,
        {
          status: 'AWAITING_INFO',
          note: 'Please provide the 12-digit bank UTR reference number.',
        },
        staffFinanceCarol
      );
      expect(awaiting.status).toBe('AWAITING_INFO');

      // Staff Carol moves ticket to IN_PROGRESS upon student reply
      const inProgress = await ticketService.transitionStatus(
        ticket.id,
        {
          status: 'IN_PROGRESS',
          note: 'UTR received and verified with payment gateway.',
        },
        staffFinanceCarol
      );
      expect(inProgress.status).toBe('IN_PROGRESS');

      // Staff Carol resolves ticket
      const resolved = await ticketService.transitionStatus(
        ticket.id,
        {
          status: 'RESOLVED',
          resolutionSummary: 'Duplicate transaction was reversed. Refund credited to original payment source.',
        },
        staffFinanceCarol
      );
      expect(resolved.status).toBe('RESOLVED');
      expect(resolved.resolution_summary).toMatch(/refund credited/i);

      // Verify student notification for resolution
      const resolveNotif = inMemoryNotifications.find(
        (n) =>
          (n.recipient_id === studentAlice.id || n.recipientId === studentAlice.id) &&
          (n.type === 'RESOLVED' || n.type === 'STATUS_CHANGED' || n.eventType === 'RESOLVED')
      );
      expect(resolveNotif).toBeDefined();

      // Verify resolved ticket appears in student list with updated status
      const studentUpdatedList = await ticketService.listTickets({ page: 1, limit: 10 }, studentAlice);
      const studentTicketView = studentUpdatedList.tickets.find((t) => t.id === ticket.id);
      expect(studentTicketView.status).toBe('RESOLVED');
    });

    it('rejects unauthorized status transitions and role boundary violations', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Exam grade query',
          description: 'Query regarding CS101 final grading.',
          categoryId: 'c1000000-0000-0000-0000-000000000004',
          priority: 'Medium',
        },
        studentAlice
      );

      // Student is prohibited from directly transitioning staff resolution status
      await expect(
        ticketService.transitionStatus(
          ticket.id,
          { status: 'RESOLVED', resolutionSummary: 'Self resolving' },
          studentAlice
        )
      ).rejects.toThrow(/Students may not directly modify staff resolution statuses/i);

      // Staff from another department (Finance) cannot modify CSE ticket
      await expect(
        ticketService.claimTicket(ticket.id, staffFinanceCarol)
      ).rejects.toThrow(/Access denied.*department/i);
    });
  });

  describe('4. Ticket Conversation & Privacy Boundary Enforcement', () => {
    it('displays public staff replies to student while strictly hiding staff internal notes', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Scholarship renewal verification',
          description: 'Need verification of previous year marks for state merit scholarship.',
          categoryId: 'c1000000-0000-0000-0000-000000000003',
          priority: 'Medium',
        },
        studentAlice
      );

      // 1. Staff posts public reply to student
      await CommentService.addComment({
        ticketId: ticket.id,
        content: 'Your marks verification has been submitted to the scholarship portal.',
        isInternal: false,
        user: staffFinanceCarol,
        role: 'STAFF',
        departmentId: DEPT_FINANCE,
      });

      // 2. Staff posts internal deliberation note (confidential review)
      await CommentService.addComment({
        ticketId: ticket.id,
        content: 'INTERNAL NOTE: Verified against exam ledger folio 412. Attendance meets 75% cutoff.',
        isInternal: true,
        user: staffFinanceCarol,
        role: 'STAFF',
        departmentId: DEPT_FINANCE,
      });

      // 3. When student Alice views comments, ONLY public comments are returned
      const studentComments = await CommentService.getTicketComments(
        ticket.id,
        studentAlice,
        'STUDENT',
        studentAlice.department_id
      );

      expect(studentComments.length).toBe(1);
      expect(studentComments[0].content).toContain('scholarship portal');
      expect(studentComments[0].is_internal).toBe(false);
      // Strict privacy check: internal note is never exposed
      expect(studentComments.some((c) => c.content.includes('INTERNAL NOTE'))).toBe(false);

      // 4. When staff Carol views comments, BOTH public reply and internal note are visible
      const staffComments = await CommentService.getTicketComments(
        ticket.id,
        staffFinanceCarol,
        'STAFF',
        DEPT_FINANCE
      );
      expect(staffComments.length).toBe(2);
      expect(staffComments.some((c) => c.is_internal === true)).toBe(true);
    });
  });
});
