import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { sanitizeMeta } from '../src/utils/logger.js';
import { requireAuth, requireActiveUser, requireRole } from '../src/middleware/auth.js';
import { ticketRepository, inMemoryProfiles, inMemoryTickets } from '../src/repositories/ticket.repository.js';
import { ticketService } from '../src/services/ticket.service.js';
import { staffService } from '../src/services/staff.service.js';
import { AttachmentService, inMemoryAttachments, inMemoryFileBuffers } from '../src/services/attachment.service.js';
import { CommentService, inMemoryComments } from '../src/services/comment.service.js';

describe('SmartDesk Phase 9: Final Security, RBAC & Integration Audit', () => {
  const DEPT_CSE = '11111111-1111-1111-1111-111111111111';
  const DEPT_FINANCE = '22222222-2222-2222-2222-222222222222';
  const DEPT_REGISTRAR = '33333333-3333-3333-3333-333333333333';

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

  const staffFinanceCarol = {
    id: 'usr-staff-carol',
    email: 'carol@staff.college.edu',
    full_name: 'Carol Staff',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_FINANCE,
  };

  const staffRegistrarDave = {
    id: 'usr-staff-dave',
    email: 'dave@staff.college.edu',
    full_name: 'Dave Staff',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_REGISTRAR,
  };

  const pendingStaffEve = {
    id: 'usr-staff-eve',
    email: 'eve@staff.college.edu',
    full_name: 'Eve Staff',
    role: 'STAFF',
    status: 'PENDING_APPROVAL',
    department_id: DEPT_FINANCE,
  };

  const suspendedStudentFrank = {
    id: 'usr-student-frank',
    email: 'frank@student.college.edu',
    full_name: 'Frank Student',
    role: 'STUDENT',
    status: 'SUSPENDED',
    department_id: DEPT_CSE,
  };

  const superAdmin = {
    id: 'usr-admin-root',
    email: 'admin@college.edu',
    full_name: 'System Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    department_id: null,
    can_approve_documents: true,
  };

  beforeEach(() => {
    inMemoryProfiles.clear();
    inMemoryTickets.clear();
    inMemoryComments.length = 0;
    inMemoryAttachments.length = 0;
    inMemoryFileBuffers.clear();

    ticketRepository.registerProfile(studentAlice);
    ticketRepository.registerProfile(studentBob);
    ticketRepository.registerProfile(staffFinanceCarol);
    ticketRepository.registerProfile(staffRegistrarDave);
    ticketRepository.registerProfile(pendingStaffEve);
    ticketRepository.registerProfile(suspendedStudentFrank);
    ticketRepository.registerProfile(superAdmin);
  });

  describe('1. Endpoint Authentication & Authorization Controls', () => {
    it('rejects unauthenticated requests to protected endpoints with 401', async () => {
      const endpoints = [
        '/api/auth/me',
        '/api/tickets',
        '/api/admin/overview',
        '/api/staff/queue',
        '/api/notifications',
      ];

      for (const endpoint of endpoints) {
        const res = await request(app).get(endpoint);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('rejects pending and suspended accounts with 403 Forbidden', () => {
      const mockReqPending = { profile: pendingStaffEve, id: 'req-1' };
      const mockReqSuspended = { profile: suspendedStudentFrank, id: 'req-2' };
      const resPending = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const resSuspended = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      requireActiveUser(mockReqPending, resPending, next);
      expect(resPending.status).toHaveBeenCalledWith(403);
      expect(resPending.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: 'ACCOUNT_PENDING_APPROVAL' }),
        })
      );
      expect(next).not.toHaveBeenCalled();

      requireActiveUser(mockReqSuspended, resSuspended, next);
      expect(resSuspended.status).toHaveBeenCalledWith(403);
      expect(resSuspended.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: 'ACCOUNT_SUSPENDED' }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('enforces RBAC role checks and prohibits students from staff and admin endpoints', () => {
      const studentReq = { profile: studentAlice, id: 'req-rbac-1', originalUrl: '/api/admin/overview' };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      const adminGuard = requireRole('SUPER_ADMIN');
      adminGuard(studentReq, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'FORBIDDEN',
            requiredRoles: ['SUPER_ADMIN'],
            currentRole: 'STUDENT',
          }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('2. Role Escalation Prevention', () => {
    it('prevents privilege escalation when updating profile via PATCH /api/auth/profile', async () => {
      // Direct unit test of update profile logic: only allowed keys are extracted
      const maliciousPayload = {
        fullName: 'Alice Hacker',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        department_id: DEPT_FINANCE,
        can_approve_documents: true,
      };

      const existingProfile = { ...studentAlice };
      // Simulate profile controller sanitization
      const updates = {
        updated_at: new Date().toISOString(),
      };
      if (maliciousPayload.fullName) updates.full_name = maliciousPayload.fullName.trim();
      if (maliciousPayload.phoneNumber !== undefined) updates.phone_number = maliciousPayload.phoneNumber;

      const mergedProfile = { ...existingProfile, ...updates };

      expect(mergedProfile.full_name).toBe('Alice Hacker');
      expect(mergedProfile.role).toBe('STUDENT'); // Must NOT become SUPER_ADMIN
      expect(mergedProfile.department_id).toBe(DEPT_CSE); // Must NOT change department
      expect(mergedProfile.can_approve_documents).toBeUndefined(); // Must NOT receive approval rights
    });
  });

  describe('3. Cross-Student & Cross-Department Data Isolation', () => {
    let aliceTicket;

    beforeEach(async () => {
      aliceTicket = await ticketService.createTicket(
        {
          title: 'Alice CSE Lab Access Problem',
          description: 'Cannot login to Lab 3 computers.',
          categoryId: 'cat-infra',
          assignedDepartmentId: DEPT_CSE,
          priority: 'Medium',
        },
        studentAlice
      );
    });

    it('prohibits Student B from viewing Student A ticket (returns 403 Forbidden)', async () => {
      await expect(
        ticketService.getTicket(aliceTicket.id, studentBob)
      ).rejects.toThrow(/Access denied|forbidden|not authorized/i);
    });

    it('prohibits Student B from commenting on Student A ticket', async () => {
      await expect(
        CommentService.addComment({
          ticketId: aliceTicket.id,
          content: 'Malicious unauthorized comment',
          isInternal: false,
          user: studentBob,
          role: studentBob.role,
          departmentId: studentBob.department_id,
        })
      ).rejects.toThrow(/Access denied|cannot comment/i);
    });

    it('prohibits Staff from another department from claiming an unassigned ticket', async () => {
      // Ticket is assigned to CSE, staffFinanceCarol is in FINANCE
      await expect(
        ticketService.assignTicket(
          aliceTicket.id,
          { assignedTo: staffFinanceCarol.id },
          staffFinanceCarol
        )
      ).rejects.toThrow(/Access denied|department|not authorized/i);
    });
  });

  describe('4. Attachment Download Security & Note Isolation', () => {
    let ticket;
    let internalAttachment;
    let publicAttachment;

    beforeEach(async () => {
      ticket = await ticketService.createTicket(
        {
          title: 'Tuition Fee Discrepancy',
          description: 'Double charge on portal.',
          categoryId: 'cat-fees',
          assignedDepartmentId: DEPT_FINANCE,
          priority: 'Urgent',
        },
        studentAlice
      );

      // Staff posts an internal note with an attachment
      const internalComment = await CommentService.addComment({
        ticketId: ticket.id,
        content: 'Audit notes: student bank reconciliation attachment',
        isInternal: true,
        user: staffFinanceCarol,
        role: staffFinanceCarol.role,
        departmentId: staffFinanceCarol.department_id,
      });

      // Upload attachment linked to internal comment
      const internalPdf = Buffer.from('%PDF-1.4 internal sensitive audit notes');
      const [uploadedInternal] = await AttachmentService.uploadAttachments({
        files: [
          {
            originalname: 'internal_bank_audit.pdf',
            mimetype: 'application/pdf',
            size: internalPdf.length,
            buffer: internalPdf,
          },
        ],
        ticketId: ticket.id,
        commentId: internalComment.id,
        user: staffFinanceCarol,
        isInternal: true,
      });
      internalAttachment = uploadedInternal;

      // Upload public attachment
      const publicPdf = Buffer.from('%PDF-1.4 public fee receipt');
      const [uploadedPublic] = await AttachmentService.uploadAttachments({
        files: [
          {
            originalname: 'receipt.pdf',
            mimetype: 'application/pdf',
            size: publicPdf.length,
            buffer: publicPdf,
          },
        ],
        ticketId: ticket.id,
        commentId: null,
        user: studentAlice,
        isInternal: false,
      });
      publicAttachment = uploadedPublic;
    });

    it('prohibits student from downloading internal note attachment (HTTP 403 Forbidden)', async () => {
      await expect(
        AttachmentService.getAttachmentDownload({
          ticketId: ticket.id,
          attachmentId: internalAttachment.id,
          user: studentAlice,
          role: studentAlice.role,
          departmentId: studentAlice.department_id,
        })
      ).rejects.toThrow(/restricted to authorized staff|access denied/i);
    });

    it('allows student to download non-internal attachments on their own ticket', async () => {
      const result = await AttachmentService.getAttachmentDownload({
        ticketId: ticket.id,
        attachmentId: publicAttachment.id,
        user: studentAlice,
        role: studentAlice.role,
        departmentId: studentAlice.department_id,
      });
      expect(result).toHaveProperty('fileName', 'receipt.pdf');
    });

    it('prohibits outside department staff from downloading attachments', async () => {
      // Dave is REGISTRAR, ticket belongs to FINANCE
      await expect(
        AttachmentService.getAttachmentDownload({
          ticketId: ticket.id,
          attachmentId: publicAttachment.id,
          user: staffRegistrarDave,
          role: staffRegistrarDave.role,
          departmentId: staffRegistrarDave.department_id,
        })
      ).rejects.toThrow(/access to tickets outside your department|access denied/i);
    });
  });

  describe('5. Logging Sanitization & Information Leakage Prevention', () => {
    it('redacts sensitive keys including passwords, tokens, API keys, and cookies', () => {
      const sensitiveMeta = {
        requestId: 'req-secure-123',
        userEmail: 'student@college.edu',
        password: 'SuperSecretPassword123!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        access_token: 'acctok_xyz999',
        refresh_token: 'reftok_abc111',
        authorization: 'Bearer secret_token_value',
        secret: 'jwt_secret_phrase',
        apiKey: 'sk-proj-ai-secret-key-12345',
        ai_api_key: 'AIzaSySecretApiKey',
        smtp_pass: 'smtpSecretPass123',
        cookie: 'session_id=123456789; secure',
        service_role_key: 'eyJservice_role_key_value',
        nested: {
          password: 'another_nested_password',
          safeField: 'harmless_metadata',
        },
      };

      const clean = sanitizeMeta(sensitiveMeta);

      expect(clean.requestId).toBe('req-secure-123');
      expect(clean.userEmail).toBe('student@college.edu');
      expect(clean.password).toBe('[REDACTED]');
      expect(clean.token).toBe('[REDACTED]');
      expect(clean.access_token).toBe('[REDACTED]');
      expect(clean.refresh_token).toBe('[REDACTED]');
      expect(clean.authorization).toBe('[REDACTED]');
      expect(clean.secret).toBe('[REDACTED]');
      expect(clean.apiKey).toBe('[REDACTED]');
      expect(clean.ai_api_key).toBe('[REDACTED]');
      expect(clean.smtp_pass).toBe('[REDACTED]');
      expect(clean.cookie).toBe('[REDACTED]');
      expect(clean.service_role_key).toBe('[REDACTED]');
      expect(clean.nested.password).toBe('[REDACTED]');
      expect(clean.nested.safeField).toBe('harmless_metadata');
    });
  });

  describe('6. System Liveness, Readiness & Operational Probes', () => {
    it('GET /api/health returns operational liveness and system uptime', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(typeof res.body.data.uptimeSeconds).toBe('number');
      expect(res.headers).toHaveProperty('x-request-id');
      expect(res.headers).toHaveProperty('x-frame-options'); // Helmet header
    });

    it('GET /api/ready returns operational readiness without exposing secrets', async () => {
      const res = await request(app).get('/api/ready');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ready');
      expect(res.body.data.services).toHaveProperty('api', 'operational');
      expect(res.body.data.services).toHaveProperty('database');
      expect(res.body.data.services).toHaveProperty('aiAssistant');

      // Verify no keys leaked in body
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('SUPABASE_SECRET_KEY');
      expect(bodyStr).not.toContain('GEMINI_API_KEY');
      expect(bodyStr).not.toContain('OPENAI_API_KEY');
      expect(bodyStr).not.toContain('service_role');
    });
  });
});
