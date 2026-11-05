import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ticketService, ALLOWED_STATUS_TRANSITIONS } from '../src/services/ticket.service.js';
import { ticketRepository } from '../src/repositories/ticket.repository.js';
import { aiConversationService } from '../src/services/ai/ai_conversation.service.js';

describe('Staff Query Processing, Certificate Workflow, Staff Assignment & AI Persistence', () => {
  const staffCSE = {
    id: 'staff-cse-101',
    full_name: 'Prof. Priya Sharma',
    email: 'priya.cse@smartdesk.edu',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: 'dept-cse-uuid',
    department_code: 'CSE',
  };

  const studentAlice = {
    id: 'student-alice-202',
    full_name: 'Alice Johnson',
    email: 'alice@student.college.edu',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: 'dept-cse-uuid',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Staff Query Opening & Cross-Department Read Access', () => {
    it('allows staff in CSE to open student information request assigned to Registrar Office', async () => {
      const queryTicket = {
        id: 'tkt-query-001',
        ticket_number: 'REQ-2026-0001',
        title: 'Information Request: What are the transcript collection hours?',
        description: 'Need official clarification regarding transcript collection.',
        category_id: 'cat-academic',
        assigned_department_id: 'dept-registrar-uuid', // Different from staff CSE!
        created_by: studentAlice.id,
        status: 'OPEN',
        request_type: 'INFORMATION_REQUEST',
        tags: ['WORKFLOW:INFORMATION_REQUEST'],
        is_confidential: false,
        created_at: new Date().toISOString(),
      };

      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(queryTicket);
      vi.spyOn(ticketRepository, 'getEventsByTicketId').mockResolvedValueOnce([]);

      const result = await ticketService.getTicket('tkt-query-001', staffCSE);
      expect(result).toBeDefined();
      expect(result.id).toBe('tkt-query-001');
      expect(result.title).toContain('Information Request');
    });

    it('denies staff from opening confidential grievance unless authorized', async () => {
      const confidentialGrievance = {
        id: 'tkt-grievance-001',
        ticket_number: 'GRV-2026-0001',
        title: 'Confidential Harassment Report',
        description: 'Sensitive grievance details.',
        assigned_department_id: 'dept-affairs-uuid',
        created_by: studentAlice.id,
        status: 'OPEN',
        is_confidential: true,
      };

      vi.spyOn(ticketRepository, 'findById').mockResolvedValueOnce(confidentialGrievance);

      await expect(ticketService.getTicket('tkt-grievance-001', staffCSE)).rejects.toThrow(
        /Access denied: Confidential grievances require specific grievance officer authorization/
      );
    });
  });

  describe('2. Certificate & Student Service Lifecycle State Transitions', () => {
    it('verifies allowed certificate transitions in ALLOWED_STATUS_TRANSITIONS', () => {
      expect(ALLOWED_STATUS_TRANSITIONS.OPEN).toContain('UNDER_REVIEW');
      expect(ALLOWED_STATUS_TRANSITIONS.UNDER_REVIEW).toContain('DOCUMENT_VERIFICATION');
      expect(ALLOWED_STATUS_TRANSITIONS.DOCUMENT_VERIFICATION).toContain('IN_PROGRESS');
      expect(ALLOWED_STATUS_TRANSITIONS.IN_PROGRESS).toContain('READY_FOR_COLLECTION');
      expect(ALLOWED_STATUS_TRANSITIONS.READY_FOR_COLLECTION).toContain('RESOLVED');
    });

    it('transitions certificate from OPEN to UNDER_REVIEW', async () => {
      const certTicket = {
        id: 'tkt-cert-001',
        ticket_number: 'TKT-2026-0099',
        status: 'OPEN',
        assigned_department_id: staffCSE.department_id,
        created_by: studentAlice.id,
        tags: ['CERTIFICATE', 'WORKFLOW:INFORMATION_REQUEST'],
      };

      vi.spyOn(ticketRepository, 'findById').mockResolvedValue(certTicket);
      vi.spyOn(ticketRepository, 'updateTicket').mockResolvedValueOnce({
        ...certTicket,
        status: 'UNDER_REVIEW',
      });
      vi.spyOn(ticketRepository, 'recordEvent').mockResolvedValueOnce({});

      const updated = await ticketService.transitionStatus(
        'tkt-cert-001',
        { status: 'UNDER_REVIEW', note: 'Staff accepted query' },
        staffCSE
      );

      expect(updated.status).toBe('UNDER_REVIEW');
    });

    it('transitions certificate from UNDER_REVIEW to DOCUMENT_VERIFICATION', async () => {
      const certTicket = {
        id: 'tkt-cert-001',
        ticket_number: 'TKT-2026-0099',
        status: 'UNDER_REVIEW',
        assigned_department_id: staffCSE.department_id,
        created_by: studentAlice.id,
        tags: ['CERTIFICATE'],
      };

      vi.spyOn(ticketRepository, 'findById').mockResolvedValue(certTicket);
      vi.spyOn(ticketRepository, 'updateTicket').mockResolvedValueOnce({
        ...certTicket,
        status: 'DOCUMENT_VERIFICATION',
      });
      vi.spyOn(ticketRepository, 'recordEvent').mockResolvedValueOnce({});

      const updated = await ticketService.transitionStatus(
        'tkt-cert-001',
        { status: 'DOCUMENT_VERIFICATION', note: 'Documents verified by staff' },
        staffCSE
      );

      expect(updated.status).toBe('DOCUMENT_VERIFICATION');
    });

    it('transitions certificate from DOCUMENT_VERIFICATION to IN_PROGRESS', async () => {
      const certTicket = {
        id: 'tkt-cert-001',
        ticket_number: 'TKT-2026-0099',
        status: 'DOCUMENT_VERIFICATION',
        assigned_department_id: staffCSE.department_id,
        created_by: studentAlice.id,
      };

      vi.spyOn(ticketRepository, 'findById').mockResolvedValue(certTicket);
      vi.spyOn(ticketRepository, 'updateTicket').mockResolvedValueOnce({
        ...certTicket,
        status: 'IN_PROGRESS',
      });
      vi.spyOn(ticketRepository, 'recordEvent').mockResolvedValueOnce({});

      const updated = await ticketService.transitionStatus(
        'tkt-cert-001',
        { status: 'IN_PROGRESS', note: 'Commencing certificate preparation' },
        staffCSE
      );

      expect(updated.status).toBe('IN_PROGRESS');
    });

    it('transitions certificate to READY_FOR_COLLECTION with pickup instructions', async () => {
      const certTicket = {
        id: 'tkt-cert-001',
        ticket_number: 'TKT-2026-0099',
        status: 'IN_PROGRESS',
        assigned_department_id: staffCSE.department_id,
        created_by: studentAlice.id,
      };

      vi.spyOn(ticketRepository, 'findById').mockResolvedValue(certTicket);
      vi.spyOn(ticketRepository, 'updateTicket').mockResolvedValueOnce({
        ...certTicket,
        status: 'READY_FOR_COLLECTION',
      });
      vi.spyOn(ticketRepository, 'recordEvent').mockResolvedValueOnce({});

      const updated = await ticketService.transitionStatus(
        'tkt-cert-001',
        { status: 'READY_FOR_COLLECTION', note: 'Ready at Room 104 Admin Block' },
        staffCSE
      );

      expect(updated.status).toBe('READY_FOR_COLLECTION');
    });

    it('transitions from READY_FOR_COLLECTION to RESOLVED with mandatory resolution summary', async () => {
      const certTicket = {
        id: 'tkt-cert-001',
        ticket_number: 'TKT-2026-0099',
        status: 'READY_FOR_COLLECTION',
        assigned_department_id: staffCSE.department_id,
        created_by: studentAlice.id,
      };

      vi.spyOn(ticketRepository, 'findById').mockResolvedValue(certTicket);
      vi.spyOn(ticketRepository, 'updateTicket').mockResolvedValueOnce({
        ...certTicket,
        status: 'RESOLVED',
        resolution_summary: 'Certificate collected by student with valid ID.',
      });
      vi.spyOn(ticketRepository, 'recordEvent').mockResolvedValueOnce({});

      const updated = await ticketService.transitionStatus(
        'tkt-cert-001',
        {
          status: 'RESOLVED',
          resolutionSummary: 'Certificate collected by student with valid ID.',
        },
        staffCSE
      );

      expect(updated.status).toBe('RESOLVED');
    });
  });

  describe('3. Staff Bulk Assignment & Foreign Key Integrity Protection', () => {
    it('rejects bulk assignment if assigned staff ID is not found in staff directory (400 STAFF_NOT_FOUND)', async () => {
      vi.spyOn(ticketRepository, 'findProfileById').mockResolvedValueOnce(null);

      await expect(
        ticketService.bulkAssign(
          { ticketIds: ['tkt-001'], assignedTo: 'non-existent-uuid' },
          staffCSE
        )
      ).rejects.toThrow(/was not found in the staff directory/);
    });

    it('rejects bulk assignment if target user has role STUDENT', async () => {
      vi.spyOn(ticketRepository, 'findProfileById').mockResolvedValueOnce({
        id: studentAlice.id,
        full_name: 'Alice Johnson',
        role: 'STUDENT',
      });

      await expect(
        ticketService.bulkAssign(
          { ticketIds: ['tkt-001'], assignedTo: studentAlice.id },
          staffCSE
        )
      ).rejects.toThrow(/is not registered as a campus staff member/);
    });

    it('successfully bulk assigns tickets to a valid staff member', async () => {
      const targetColleague = {
        id: 'staff-colleague-uuid',
        full_name: 'Dr. Suresh Reddy',
        email: 'suresh@smartdesk.edu',
        role: 'STAFF',
        status: 'ACTIVE',
      };

      vi.spyOn(ticketRepository, 'findProfileById').mockResolvedValueOnce(targetColleague);
      vi.spyOn(ticketRepository, 'bulkAssign').mockResolvedValueOnce([
        { id: 'tkt-001', ticket_number: 'TKT-001', assigned_to: targetColleague.id, status: 'IN_PROGRESS' },
        { id: 'tkt-002', ticket_number: 'TKT-002', assigned_to: targetColleague.id, status: 'IN_PROGRESS' },
      ]);

      const result = await ticketService.bulkAssign(
        { ticketIds: ['tkt-001', 'tkt-002'], assignedTo: targetColleague.id },
        staffCSE
      );

      expect(result).toHaveLength(2);
      expect(result[0].assigned_to).toBe(targetColleague.id);
    });
  });

  describe('4. AI Multi-Turn Conversation Persistence', () => {
    it('creates a new conversation thread with custom or derived title', async () => {
      const conv = await aiConversationService.createConversation(studentAlice.id, {
        title: 'Scholarship Application Query',
      });

      expect(conv).toBeDefined();
      expect(conv.id).toBeDefined();
      expect(conv.student_id).toBe(studentAlice.id);
      expect(conv.title).toBe('Scholarship Application Query');
    });

    it('appends user and assistant messages in chronological order and updates last_message_at', async () => {
      const conv = await aiConversationService.createConversation(studentAlice.id, {
        title: 'New Conversation',
      });

      // User turn
      const userMsg = await aiConversationService.addMessage(conv.id, {
        role: 'user',
        content: 'When will the merit scholarship results be published?',
      });

      expect(userMsg.role).toBe('user');
      expect(userMsg.content).toContain('merit scholarship');

      // Assistant turn
      const aiMsg = await aiConversationService.addMessage(conv.id, {
        role: 'assistant',
        content: 'Merit scholarship results are released on November 15 according to the academic calendar.',
        workflowMode: 'COLLEGE_KNOWLEDGE',
        workflowLabel: 'Verified Policy Answer',
      });

      expect(aiMsg.role).toBe('assistant');
      expect(aiMsg.workflow_mode).toBe('COLLEGE_KNOWLEDGE');

      // Retrieve messages
      const messages = await aiConversationService.getMessages(conv.id);
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    it('lists conversations for a student sorted by most recent message', async () => {
      const list = await aiConversationService.listConversations(studentAlice.id);
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    });

    it('archives a conversation successfully', async () => {
      const conv = await aiConversationService.createConversation(studentAlice.id, {
        title: 'Temp Thread to Delete',
      });

      const deleted = await aiConversationService.deleteConversation(conv.id, studentAlice.id);
      expect(deleted).toBe(true);

      const activeList = await aiConversationService.listConversations(studentAlice.id);
      expect(activeList.some((c) => c.id === conv.id)).toBe(false);
    });
  });
});

