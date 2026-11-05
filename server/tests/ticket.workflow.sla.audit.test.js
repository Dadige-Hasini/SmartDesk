import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ticketService, ALLOWED_STATUS_TRANSITIONS } from '../src/services/ticket.service.js';
import { ticketRepository, inMemoryProfiles, inMemoryTickets } from '../src/repositories/ticket.repository.js';
import { slaService, DEMO_POLICY_LABEL, IS_DEMO_TARGET } from '../src/services/sla.service.js';
import { auditService, inMemoryAuditEvents, AUDIT_ACTIONS, sanitizeAuditData } from '../src/services/audit.service.js';
import { slaWorker, slaAlertsSent } from '../src/workers/sla.worker.js';
import { CommentService, inMemoryComments } from '../src/services/comment.service.js';
import { formatToIST, toIstIsoString } from '../src/utils/date.js';

describe('Prompt 5: Ticket Workflow, SLA and Audit Engine', () => {
  const DEPT_CSE = '11111111-1111-1111-1111-111111111111';
  const DEPT_FINANCE = '22222222-2222-2222-2222-222222222222';
  const DEPT_STUDENT_AFFAIRS = '33333333-3333-3333-3333-333333333333';
  const CAT_FEES = 'c1000000-0000-0000-0000-000000000002';
  const CAT_GRIEVANCE = 'c1000000-0000-0000-0000-000000000008';

  const studentAlice = {
    id: 'usr-student-alice',
    email: 'alice@student.college.edu',
    full_name: 'Alice Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
  };

  const studentBob = {
    id: 'usr-student-bob',
    email: 'bob@student.college.edu',
    full_name: 'Bob Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
  };

  const staffCarol = {
    id: 'usr-staff-carol',
    email: 'carol@staff.college.edu',
    full_name: 'Carol Finance Staff',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_FINANCE,
    department_code: 'FIN',
    can_review_grievances: false,
  };

  const staffGrievanceOfficer = {
    id: 'usr-staff-grievance',
    email: 'officer@affairs.college.edu',
    full_name: 'Grievance Officer',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_STUDENT_AFFAIRS,
    department_code: 'AFFAIRS',
    can_review_grievances: true,
  };

  const superAdmin = {
    id: 'usr-admin-root',
    email: 'admin@smartdesk.edu',
    full_name: 'Super Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    department_id: null,
  };

  beforeEach(() => {
    inMemoryProfiles.clear();
    inMemoryTickets.clear();
    inMemoryAuditEvents.length = 0;
    inMemoryComments.length = 0;
    slaAlertsSent.clear();

    inMemoryProfiles.set(studentAlice.id, studentAlice);
    inMemoryProfiles.set(studentBob.id, studentBob);
    inMemoryProfiles.set(staffCarol.id, staffCarol);
    inMemoryProfiles.set(staffGrievanceOfficer.id, staffGrievanceOfficer);
    inMemoryProfiles.set(superAdmin.id, superAdmin);

    ticketRepository.registerProfile(studentAlice);
    ticketRepository.registerProfile(studentBob);
    ticketRepository.registerProfile(staffCarol);
    ticketRepository.registerProfile(staffGrievanceOfficer);
    ticketRepository.registerProfile(superAdmin);
  });

  // =========================================================================
  // Requirement 1 & 2: Supported Statuses and State Machine Validation
  // =========================================================================
  describe('Status Transitions & State Machine Enforcement', () => {
    it('supports all 6 standard ticket statuses in the state machine', () => {
      const statuses = ['OPEN', 'IN_PROGRESS', 'AWAITING_INFO', 'RESOLVED', 'CLOSED', 'REJECTED'];
      for (const s of statuses) {
        expect(ALLOWED_STATUS_TRANSITIONS[s]).toBeDefined();
        expect(Array.isArray(ALLOWED_STATUS_TRANSITIONS[s])).toBe(true);
      }
    });

    it('allows valid transition OPEN -> IN_PROGRESS when staff claims ticket', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Fee Payment Receipt Missing',
          description: 'Payment was debited from bank account but receipt was not generated.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
          priority: 'Urgent',
        },
        studentAlice
      );

      expect(ticket.status).toBe('OPEN');

      const claimed = await ticketService.claimTicket(ticket.id, staffCarol);
      expect(claimed.status).toBe('IN_PROGRESS');
      expect(claimed.assigned_to).toBe(staffCarol.id);
    });

    it('rejects invalid direct transition OPEN -> CLOSED with HTTP 400', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Hostel Maintenance Request',
          description: 'Water leak in room 302 needs repair.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      await expect(
        ticketService.transitionStatus(ticket.id, { status: 'CLOSED' }, staffCarol)
      ).rejects.toThrow(/Invalid status transition from OPEN to CLOSED/i);
    });

    it('rejects invalid direct transition OPEN -> RESOLVED with HTTP 400', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Hostel Room Swap',
          description: 'Requesting room swap with classmate.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      await expect(
        ticketService.transitionStatus(
          ticket.id,
          { status: 'RESOLVED', resolutionSummary: 'Handled directly' },
          staffCarol
        )
      ).rejects.toThrow(/Invalid status transition from OPEN to RESOLVED/i);
    });

    it('mandates a detailed resolution summary (>= 5 chars) to resolve a ticket', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Fee Structure Clarification',
          description: 'Need breakdown of miscellaneous charges for 3rd semester.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      await ticketService.claimTicket(ticket.id, staffCarol);

      await expect(
        ticketService.transitionStatus(
          ticket.id,
          { status: 'RESOLVED', resolutionSummary: 'ok' },
          staffCarol
        )
      ).rejects.toThrow(/detailed resolution summary.*at least 5 characters/i);

      const resolved = await ticketService.transitionStatus(
        ticket.id,
        {
          status: 'RESOLVED',
          resolutionSummary: 'Fee breakdown document sent to student email with full semester ledger.',
        },
        staffCarol
      );

      expect(resolved.status).toBe('RESOLVED');
      expect(resolved.resolution_summary).toContain('Fee breakdown document');
      expect(resolved.resolved_at).toBeDefined();
    });

    it('mandates a documented rejection reason (>= 5 chars) to reject a ticket', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Duplicate Fee Query',
          description: 'Duplicate submission regarding exam fee receipt.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      await expect(
        ticketService.transitionStatus(ticket.id, { status: 'REJECTED', rejectionReason: 'no' }, staffCarol)
      ).rejects.toThrow(/documented rejection reason.*at least 5 characters/i);

      const rejected = await ticketService.transitionStatus(
        ticket.id,
        {
          status: 'REJECTED',
          rejectionReason: 'Duplicate ticket; resolved under master reference #TKT-2026-0001.',
        },
        staffCarol
      );

      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejection_reason).toContain('Duplicate ticket');
    });

    it('prevents students from executing staff-only transitions', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Student Status Check',
          description: 'Testing unauthorized student status change.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      await expect(
        ticketService.transitionStatus(
          ticket.id,
          { status: 'RESOLVED', resolutionSummary: 'Student attempted resolve' },
          studentAlice
        )
      ).rejects.toThrow(/Students may not directly modify staff resolution statuses/i);
    });
  });

  // =========================================================================
  // Requirement 3: Database-Safe Sequence Identifier
  // =========================================================================
  describe('Database-Safe Sequence Identifier', () => {
    it('generates unique ticket numbers adhering to TKT-YYYYMMDD-XXXX format', async () => {
      const t1 = await ticketService.createTicket(
        {
          title: 'Sequence Test Ticket 1',
          description: 'Verifying sequence identifier formatting.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      const t2 = await ticketService.createTicket(
        {
          title: 'Sequence Test Ticket 2',
          description: 'Verifying unique non-collision of sequential IDs.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      const ticketPattern = /^TKT-\d{8}-\d{4}$/;
      expect(t1.ticket_number).toMatch(ticketPattern);
      expect(t2.ticket_number).toMatch(ticketPattern);
      expect(t1.ticket_number).not.toBe(t2.ticket_number);
    });
  });

  // =========================================================================
  // Requirement 4 & 5: Submission Persistence, Deterministic Routing & Reassignment
  // =========================================================================
  describe('Ticket Submission, Deterministic Routing & Department Reassignment', () => {
    it('saves student confirmed description, category, department, priority, and ownership', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Scholarship Disbursal Delay',
          description: 'State government merit scholarship was approved but not credited to account.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
          priority: 'High',
          tags: ['scholarship', 'finance'],
          isConfidential: false,
        },
        studentAlice
      );

      expect(ticket.title).toBe('Scholarship Disbursal Delay');
      expect(ticket.description).toContain('State government merit scholarship');
      expect(ticket.category_id).toBe(CAT_FEES);
      expect(ticket.priority).toBe('High');
      expect(ticket.created_by).toBe(studentAlice.id);
      expect(ticket.student_department_id).toBe(DEPT_CSE);
      expect(ticket.assigned_department_id).toBe(DEPT_FINANCE);
      expect(ticket.status).toBe('OPEN');
    });

    it('allows authorized staff to reassign a ticket to a new department with recorded reason', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Hostel Room Electricity Issue',
          description: 'Misrouted to finance department by error.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      const reassigned = await ticketService.reassignDepartment(
        ticket.id,
        {
          departmentId: DEPT_CSE,
          reason: 'Electricity and infrastructure issues are handled by Facilities / Academic block.',
        },
        staffCarol
      );

      expect(reassigned.assigned_department_id).toBe(DEPT_CSE);
      expect(reassigned.assigned_to).toBeNull();

      // Verify audit event recorded
      const auditEvent = inMemoryAuditEvents.find(
        (e) => e.action === AUDIT_ACTIONS.TICKET_REASSIGNED && e.metadata?.toDepartmentId === DEPT_CSE
      );
      expect(auditEvent).toBeDefined();
      expect(auditEvent.metadata.reason).toContain('Electricity and infrastructure');
      expect(auditEvent.metadata.fromDepartmentId).toBe(DEPT_FINANCE);
    });

    it('rejects department reassignment with insufficient reason (< 5 chars)', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Misrouted Ticket',
          description: 'Testing validation on reassignment reason.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      await expect(
        ticketService.reassignDepartment(
          ticket.id,
          { departmentId: DEPT_CSE, reason: 'none' },
          staffCarol
        )
      ).rejects.toThrow(/reassignment reason.*at least 5 characters/i);
    });

    it('prohibits outside department staff from reassigning tickets', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Finance Ticket',
          description: 'Belongs to finance department.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      // Outside staff trying to reassign finance ticket
      await expect(
        ticketService.reassignDepartment(
          ticket.id,
          { departmentId: DEPT_CSE, reason: 'Unauthorized transfer attempt' },
          staffGrievanceOfficer // From DEPT_STUDENT_AFFAIRS
        )
      ).rejects.toThrow(/Access denied/i);
    });
  });

  // =========================================================================
  // Requirement 6 & 7: Demonstration SLA Policy Deadlines & Asia/Kolkata Display
  // =========================================================================
  describe('Demonstration SLA Policy Deadlines & Timezone Handling', () => {
    it('uses sla_policies.json demo policies clearly labeled as demonstration targets', () => {
      const policies = slaService.getPolicies();
      expect(policies.length).toBeGreaterThanOrEqual(4);

      for (const p of policies) {
        expect(p.is_demo_target).toBe(true);
        expect(p.policy_label).toBe(DEMO_POLICY_LABEL);
        expect(p.first_response_minutes).toBeGreaterThan(0);
        expect(p.resolution_hours).toBeGreaterThan(0);
        expect(p.escalate_hours).toBeGreaterThan(0);
      }
    });

    it('calculates first-response, resolution and escalation deadlines in UTC for P1 Urgent', () => {
      const baseDate = new Date('2026-10-24T10:00:00.000Z');
      const deadlines = slaService.calculateDeadlines('Urgent', baseDate);

      expect(deadlines.priority_tier).toBe('P1');
      expect(deadlines.first_response_minutes).toBe(60);
      expect(deadlines.resolution_hours).toBe(8);
      expect(deadlines.escalate_hours).toBe(2);

      // Timestamps must be in canonical UTC ISO strings
      expect(deadlines.first_response_due_at).toBe('2026-10-24T11:00:00.000Z');
      expect(deadlines.resolution_due_at).toBe('2026-10-24T18:00:00.000Z');
      expect(deadlines.escalation_due_at).toBe('2026-10-24T12:00:00.000Z');
      expect(deadlines.sla_due_at).toBe(deadlines.resolution_due_at);

      // Explicit demo labeling
      expect(deadlines.is_demo_target).toBe(true);
      expect(deadlines.policy_label).toBe(DEMO_POLICY_LABEL);
    });

    it('correctly formats display times in Asia/Kolkata (IST, UTC+05:30)', () => {
      // 2026-10-24 10:00:00 UTC is 2026-10-24 15:30:00 IST (3:30 PM)
      const utcIso = '2026-10-24T10:00:00.000Z';
      const formattedIst = formatToIST(utcIso);

      expect(formattedIst).toContain('2026');
      expect(formattedIst).toContain('Oct');
      expect(formattedIst).toMatch(/(3:30\s*pm|03:30\s*pm)/i);

      // Explicit offset ISO string check
      const istIso = toIstIsoString(utcIso);
      expect(istIso).toBe('2026-10-24T15:30:00+05:30');
    });
  });

  // =========================================================================
  // Requirement 8: SLA Approaching Warnings, Overdue Breaches & Escalations
  // =========================================================================
  describe('SLA Watchdog, Approaching Warnings, Escalations & Deduplication', () => {
    it('detects ticket approaching SLA target (80% threshold) and emits SLA_WARNING without duplicates', async () => {
      const now = Date.now();
      // Ticket created 7 hours ago with 8 hours resolution target (87.5% elapsed -> approaching)
      const ticket = {
        id: 'tkt-approaching-1',
        ticket_number: 'TKT-2026-WARN1',
        title: 'Approaching SLA Ticket',
        priority: 'Urgent',
        status: 'OPEN',
        created_at: new Date(now - 7 * 3600000).toISOString(),
        resolution_due_at: new Date(now + 1 * 3600000).toISOString(),
        sla_due_at: new Date(now + 1 * 3600000).toISOString(),
        escalation_due_at: new Date(now + 2 * 3600000).toISOString(),
        assigned_to: staffCarol.id,
        is_overdue: false,
        sla_warning_sent: false,
      };

      inMemoryTickets.set(ticket.id, ticket);

      // Run 1st pass of SLA worker
      await slaWorker.checkOverdueTickets();

      // Check SLA warning emitted
      const warnEvents = inMemoryAuditEvents.filter(
        (e) => e.action === AUDIT_ACTIONS.SLA_WARNING && e.entityId === ticket.id
      );
      expect(warnEvents.length).toBe(1);
      expect(warnEvents[0].metadata.ticketNumber).toBe(ticket.ticket_number);

      // Run 2nd pass of SLA worker (deduplication check)
      await slaWorker.checkOverdueTickets();

      const warnEventsAfterSecondPass = inMemoryAuditEvents.filter(
        (e) => e.action === AUDIT_ACTIONS.SLA_WARNING && e.entityId === ticket.id
      );
      // Must NOT send repeated duplicate alerts
      expect(warnEventsAfterSecondPass.length).toBe(1);
    });

    it('detects ticket exceeding SLA target, marks overdue, and creates escalation without duplicates', async () => {
      const now = Date.now();
      // Ticket created 10 hours ago with 8 hours resolution and 2 hours escalation target
      const ticket = {
        id: 'tkt-overdue-1',
        ticket_number: 'TKT-2026-OVERDUE1',
        title: 'Overdue Breached Ticket',
        priority: 'Urgent',
        status: 'OPEN',
        created_at: new Date(now - 10 * 3600000).toISOString(),
        resolution_due_at: new Date(now - 2 * 3600000).toISOString(),
        sla_due_at: new Date(now - 2 * 3600000).toISOString(),
        escalation_due_at: new Date(now - 8 * 3600000).toISOString(),
        assigned_to: staffCarol.id,
        is_overdue: false,
        is_escalated: false,
      };

      inMemoryTickets.set(ticket.id, ticket);

      // Run pass 1
      await slaWorker.checkOverdueTickets();

      expect(ticket.is_overdue).toBe(true);
      expect(ticket.is_escalated).toBe(true);

      const overdueAudit = inMemoryAuditEvents.filter(
        (e) => e.action === AUDIT_ACTIONS.STATUS_CHANGED && e.entityId === ticket.id
      );
      expect(overdueAudit.length).toBe(1);

      const escAudit = inMemoryAuditEvents.filter(
        (e) => e.action === AUDIT_ACTIONS.TICKET_ESCALATED && e.entityId === ticket.id
      );
      expect(escAudit.length).toBe(1);

      // Run pass 2: deduplication test
      await slaWorker.checkOverdueTickets();

      const overdueAuditPass2 = inMemoryAuditEvents.filter(
        (e) => e.action === AUDIT_ACTIONS.STATUS_CHANGED && e.entityId === ticket.id
      );
      expect(overdueAuditPass2.length).toBe(1); // Still exactly 1 alert
    });
  });

  // =========================================================================
  // Requirement 9: Asynchronous Notification Resilience
  // =========================================================================
  describe('Asynchronous Notification Resilience', () => {
    it('ensures ticket transition succeeds even if notification or email dispatch fails', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Exam Hall Ticket Issue',
          description: 'Exam center code mismatch on admit card.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      await ticketService.claimTicket(ticket.id, staffCarol);

      // Mock notification service to throw an error
      const notifySpy = vi
        .spyOn((await import('../src/services/notification.service.js')).NotificationService, 'notifyUser')
        .mockRejectedValue(new Error('SMTP Connection Refused / Timeout'));

      try {
        // Transition should STILL succeed and commit state
        const resolved = await ticketService.transitionStatus(
          ticket.id,
          {
            status: 'RESOLVED',
            resolutionSummary: 'Updated hall ticket generated and uploaded to student portal.',
          },
          staffCarol
        );

        expect(resolved.status).toBe('RESOLVED');
        expect(resolved.resolution_summary).toContain('hall ticket generated');
      } finally {
        notifySpy.mockRestore();
      }
    });
  });

  // =========================================================================
  // Requirement 10, 11 & 12: Append-Only Audit Engine & Secret Redaction
  // =========================================================================
  describe('Append-Only Audit Engine & Secret Scrubbing', () => {
    it('records audit events with actor, action, entity, timestamp, correlation ID and minimal metadata', async () => {
      const record = await auditService.recordAuditEvent({
        actor: 'staff@smartdesk.edu',
        actorId: staffCarol.id,
        role: 'STAFF',
        action: AUDIT_ACTIONS.TICKET_ASSIGNED,
        entity: 'ticket',
        entityId: 'tkt-audit-test-1',
        correlationId: 'corr-req-12345',
        metadata: {
          ticketNumber: 'TKT-2026-9999',
          priority: 'Urgent',
        },
      });

      expect(record.event_id).toMatch(/^EVT-\d+-[A-Z0-9]+$/);
      expect(record.actor).toBe('staff@smartdesk.edu');
      expect(record.role).toBe('STAFF');
      expect(record.action).toBe('TICKET_ASSIGNED');
      expect(record.entity).toBe('ticket');
      expect(record.timestamp).toBeDefined();
      expect(record.metadata.correlation_id).toBe('corr-req-12345');
      expect(record.metadata.ticketNumber).toBe('TKT-2026-9999');
    });

    it('strictly sanitizes and redacts passwords, tokens, API keys and OTPs from audit logs', async () => {
      const rawMetadata = {
        student_id: studentAlice.id,
        password: 'PlaintextSuperSecretPassword123!',
        api_key: 'sk_live_9999999999999999999999',
        access_token: 'bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        otp_code: '839201',
        auth_header: 'Bearer 1234567890abcdef',
        normal_field: 'Harassment report filed in confidence',
      };

      const record = await auditService.recordAuditEvent({
        actor: 'alice@student.college.edu',
        role: 'STUDENT',
        action: AUDIT_ACTIONS.COMMENT_ADDED,
        entity: 'comment',
        entityId: 'cmt-secret-test-1',
        metadata: rawMetadata,
      });

      const meta = record.metadata;
      expect(meta.password).toBe('[REDACTED_SECRET]');
      expect(meta.api_key).toBe('[REDACTED_SECRET]');
      expect(meta.access_token).toBe('[REDACTED_SECRET]');
      expect(meta.otp_code).toBe('[REDACTED_SECRET]');
      expect(meta.auth_header).toBe('[REDACTED_SECRET]');
      expect(meta.normal_field).toBe('Harassment report filed in confidence');

      // Check string pattern scrubbing
      const scrubbed = sanitizeAuditData('User sent Authorization: Bearer secret_token_xyz12345678 and password=MyPass123!');
      expect(scrubbed).not.toContain('secret_token');
      expect(scrubbed).not.toContain('MyPass123!');
      expect(scrubbed).toContain('[REDACTED_SECRET]');
    });

    it('records routing suggestion acceptance and rejection audit events', async () => {
      const acceptedEvent = await auditService.recordRoutingFeedback({
        ticketId: 'tkt-ml-1',
        accepted: true,
        predictedCategory: 'Scholarships',
        actor: studentAlice,
        role: 'STUDENT',
      });

      expect(acceptedEvent.action).toBe(AUDIT_ACTIONS.ROUTING_SUGGESTION_ACCEPTED);
      expect(acceptedEvent.metadata.accepted).toBe(true);

      const rejectedEvent = await auditService.recordRoutingFeedback({
        ticketId: 'tkt-ml-2',
        accepted: false,
        predictedCategory: 'Hostel',
        chosenCategory: 'Examinations',
        actor: studentAlice,
        role: 'STUDENT',
      });

      expect(rejectedEvent.action).toBe(AUDIT_ACTIONS.ROUTING_SUGGESTION_REJECTED);
      expect(rejectedEvent.metadata.accepted).toBe(false);
      expect(rejectedEvent.metadata.chosenCategory).toBe('Examinations');
    });
  });

  // =========================================================================
  // Requirement 13: Private Internal Note Isolation
  // =========================================================================
  describe('Private Internal Note Isolation from Students', () => {
    it('hides internal staff comments from students in comment queries and ticket detail', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Document Verification',
          description: 'Original 10th marksheet verification for admission.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      await ticketService.claimTicket(ticket.id, staffCarol);

      // 1. Staff adds a public comment
      await CommentService.addComment({
        ticketId: ticket.id,
        content: 'Please visit window 3 with your original certificates tomorrow morning.',
        isInternal: false,
        user: staffCarol,
        role: 'STAFF',
        departmentId: DEPT_FINANCE,
      });

      // 2. Staff adds a confidential internal staff note
      await CommentService.addComment({
        ticketId: ticket.id,
        content: 'INTERNAL NOTE: Student submitted provisional certificate; pending board verification.',
        isInternal: true,
        user: staffCarol,
        role: 'STAFF',
        departmentId: DEPT_FINANCE,
      });

      // Student views comments
      const studentComments = await CommentService.getTicketComments(
        ticket.id,
        studentAlice,
        'STUDENT',
        DEPT_CSE
      );

      expect(studentComments.length).toBe(1);
      expect(studentComments[0].content).toContain('Please visit window 3');
      expect(studentComments.some((c) => c.is_internal)).toBe(false);

      // Student views ticket detail and timeline events
      const studentTicketView = await ticketService.getTicket(ticket.id, studentAlice);
      expect(studentTicketView.events).toBeDefined();
      for (const evt of studentTicketView.events) {
        expect(evt.event_type).not.toBe('INTERNAL_NOTE_ADDED');
        expect(evt.note).not.toContain('INTERNAL NOTE');
      }

      // Staff views comments: sees both public and internal notes
      const staffComments = await CommentService.getTicketComments(
        ticket.id,
        staffCarol,
        'STAFF',
        DEPT_FINANCE
      );
      expect(staffComments.length).toBe(2);
      expect(staffComments.some((c) => c.is_internal)).toBe(true);
    });
  });

  // =========================================================================
  // Requirement 14: Confidential Grievance Access Restrictions
  // =========================================================================
  describe('Confidential Grievance Record Access Restrictions', () => {
    it('restricts confidential grievances to creator, super admin, and authorized grievance officers', async () => {
      const grievanceTicket = await ticketService.createTicket(
        {
          title: 'Confidential Harassment Complaint',
          description: 'Sensitive complaint submitted in strict confidence.',
          categoryId: CAT_GRIEVANCE,
          assignedDepartmentId: DEPT_STUDENT_AFFAIRS,
          isConfidential: true,
        },
        studentAlice
      );

      expect(grievanceTicket.is_confidential).toBe(true);

      // 1. Student creator CAN access
      const creatorView = await ticketService.getTicket(grievanceTicket.id, studentAlice);
      expect(creatorView.id).toBe(grievanceTicket.id);

      // 2. Super Admin CAN access
      const adminView = await ticketService.getTicket(grievanceTicket.id, superAdmin);
      expect(adminView.id).toBe(grievanceTicket.id);

      // 3. Authorized Grievance Officer CAN access
      const officerView = await ticketService.getTicket(grievanceTicket.id, staffGrievanceOfficer);
      expect(officerView.id).toBe(grievanceTicket.id);

      // 4. Regular department staff CANNOT access (403 Forbidden)
      await expect(
        ticketService.getTicket(grievanceTicket.id, staffCarol)
      ).rejects.toThrow(/Confidential grievances require specific grievance officer authorization/i);

      // 5. Unrelated student CANNOT access (403 Forbidden)
      await expect(
        ticketService.getTicket(grievanceTicket.id, studentBob)
      ).rejects.toThrow(/Access denied: You do not have permission to view tickets raised by other students/i);
    });
  });

  // =========================================================================
  // Requirement 15: Student Single Reopening Within 7 Calendar Days
  // =========================================================================
  describe('Student Single Reopening Within 7 Calendar Days', () => {
    it('permits student creator to reopen a resolved ticket once within 7 calendar days', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'WiFi Login Certificate Expiry',
          description: 'Cannot access campus network.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      await ticketService.claimTicket(ticket.id, staffCarol);

      await ticketService.transitionStatus(
        ticket.id,
        {
          status: 'RESOLVED',
          resolutionSummary: 'Fresh RADIUS certificate issued to student username.',
        },
        staffCarol
      );

      // 1st reopen within 7 days -> Allowed
      const reopened = await ticketService.reopenTicket(
        ticket.id,
        { reason: 'Still unable to authenticate on 5GHz access point in library.' },
        studentAlice
      );

      expect(reopened.status).toBe('IN_PROGRESS');
      expect(reopened.reopened_count).toBe(1);
      expect(reopened.last_reopened_at).toBeDefined();

      // Audit event recorded
      const reopenAudit = inMemoryAuditEvents.find(
        (e) => e.action === AUDIT_ACTIONS.TICKET_REOPENED && e.entityId === ticket.id
      );
      expect(reopenAudit).toBeDefined();
      expect(reopenAudit.metadata.reopenedCount).toBe(1);

      // Resolve again
      await ticketService.transitionStatus(
        ticket.id,
        {
          status: 'RESOLVED',
          resolutionSummary: '5GHz AP profile cleared and re-provisioned.',
        },
        staffCarol
      );

      // 2nd reopen attempt -> Must be rejected with 400
      await expect(
        ticketService.reopenTicket(
          ticket.id,
          { reason: 'Second reopening attempt should be disallowed by policy.' },
          studentAlice
        )
      ).rejects.toThrow(/already been reopened once.*single reopening per ticket/i);
    });

    it('rejects reopening attempt after the 7-day calendar window has expired', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Expired Reopen Test',
          description: 'Testing expiry of 7-day reopening window.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      await ticketService.claimTicket(ticket.id, staffCarol);

      await ticketService.transitionStatus(
        ticket.id,
        {
          status: 'RESOLVED',
          resolutionSummary: 'Issue resolved previously.',
        },
        staffCarol
      );

      // Artificially age the resolved_at timestamp to 8 days ago
      const eightDaysAgoIso = new Date(Date.now() - 8 * 24 * 3600000).toISOString();
      await ticketRepository.updateTicket(ticket.id, {
        resolved_at: eightDaysAgoIso,
        updated_at: eightDaysAgoIso,
      });

      await expect(
        ticketService.reopenTicket(
          ticket.id,
          { reason: 'Attempting reopen after 8 days.' },
          studentAlice
        )
      ).rejects.toThrow(/7-day reopening window for this ticket has elapsed/i);
    });

    it('prevents non-creators from reopening another student ticket', async () => {
      const ticket = await ticketService.createTicket(
        {
          title: 'Alice Private Ticket',
          description: 'Testing unauthorized student reopen.',
          categoryId: CAT_FEES,
          assignedDepartmentId: DEPT_FINANCE,
        },
        studentAlice
      );

      await ticketService.claimTicket(ticket.id, staffCarol);
      await ticketService.transitionStatus(
        ticket.id,
        { status: 'RESOLVED', resolutionSummary: 'Resolution completed' },
        staffCarol
      );

      await expect(
        ticketService.reopenTicket(ticket.id, { reason: 'Bob attempting reopen' }, studentBob)
      ).rejects.toThrow(/You may only reopen tickets that you created/i);
    });
  });
});
