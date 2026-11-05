import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { supabaseClient } from '../src/config/supabase.js';
import {
  ticketRepository,
  inMemoryProfiles,
  inMemoryTickets,
} from '../src/repositories/ticket.repository.js';
import { inMemoryComments, CommentService } from '../src/services/comment.service.js';
import { inMemoryAttachments, inMemoryFileBuffers, AttachmentService } from '../src/services/attachment.service.js';
import { ticketService } from '../src/services/ticket.service.js';

describe('SmartDesk Phase 8: Security Review & Authorization Hardening Suite', () => {
  const DEPT_CSE = '11111111-1111-1111-1111-111111111111';
  const DEPT_FINANCE = '44444444-4444-4444-4444-444444444444';
  const DEPT_AFFAIRS = '77777777-7777-7777-7777-777777777777';

  // Test User Identities (Using valid RFC4122 UUIDs)
  const studentAlice = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'alice@student.college.edu',
    full_name: 'Alice Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
  };

  const studentBob = {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'bob@student.college.edu',
    full_name: 'Bob Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
  };

  const staffCseCharlie = {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'charlie@staff.college.edu',
    full_name: 'Prof. Charlie CSE',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
    department_code: 'CSE',
  };

  const staffFinanceCarol = {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'carol@finance.college.edu',
    full_name: 'Carol Finance',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_FINANCE,
    department_code: 'FIN',
  };

  const staffGrievanceOfficer = {
    id: '00000000-0000-0000-0000-000000000005',
    email: 'grievance@affairs.college.edu',
    full_name: 'Dean Student Affairs',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_AFFAIRS,
    department_code: 'AFFAIRS',
    can_review_grievances: true,
  };

  const pendingStaffUser = {
    id: '00000000-0000-0000-0000-000000000006',
    email: 'pending@staff.college.edu',
    full_name: 'Pending Staff',
    role: 'STAFF',
    status: 'PENDING_APPROVAL',
    department_id: DEPT_CSE,
  };

  const suspendedStudentUser = {
    id: '00000000-0000-0000-0000-000000000007',
    email: 'suspended@student.college.edu',
    full_name: 'Suspended Student',
    role: 'STUDENT',
    status: 'SUSPENDED',
    department_id: DEPT_CSE,
  };

  const superAdminUser = {
    id: '00000000-0000-0000-0000-000000000008',
    email: 'superadmin@college.edu',
    full_name: 'Super Administrator',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    department_id: null,
  };

  const tokens = {
    'token-alice': studentAlice,
    'token-bob': studentBob,
    'token-staff-cse': staffCseCharlie,
    'token-staff-finance': staffFinanceCarol,
    'token-staff-grievance': staffGrievanceOfficer,
    'token-pending': pendingStaffUser,
    'token-suspended': suspendedStudentUser,
    'token-super-admin': superAdminUser,
  };

  beforeEach(() => {
    inMemoryProfiles.clear();
    inMemoryTickets.clear();
    inMemoryComments.length = 0;
    inMemoryAttachments.length = 0;
    inMemoryFileBuffers.clear();

    for (const user of Object.values(tokens)) {
      ticketRepository.registerProfile(user);
      inMemoryProfiles.set(user.id, user);
      inMemoryProfiles[user.id] = user;
    }

    // Mock Supabase Auth verification
    if (supabaseClient?.auth) {
      vi.spyOn(supabaseClient.auth, 'getUser').mockImplementation(async (tok) => {
        const matched = tokens[tok];
        if (matched) {
          return {
            data: { user: { id: matched.id, email: matched.email } },
            error: null,
          };
        }
        return {
          data: { user: null },
          error: { message: 'Invalid, revoked, or expired authentication token.' },
        };
      });
    }
  });

  // =========================================================================
  // 1. Unauthenticated Negative Authorization Tests
  // =========================================================================
  describe('1. Unauthenticated Access Controls', () => {
    const protectedGetEndpoints = [
      '/api/tickets',
      '/api/tickets/sample-id',
      '/api/tickets/sample-id/comments',
      '/api/tickets/sample-id/attachments',
      '/api/staff/queue',
      '/api/admin/audit-logs',
      '/api/admin/stats',
      '/api/notifications',
    ];

    it.each(protectedGetEndpoints)(
      'rejects unauthenticated GET %s with 401 UNAUTHORIZED',
      async (endpoint) => {
        const res = await request(app).get(endpoint);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      }
    );

    it('rejects invalid or forged bearer tokens with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .get('/api/tickets')
        .set('Authorization', 'Bearer forged-malicious-token-12345');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects malformed auth schemes (e.g. Basic auth) with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .get('/api/tickets')
        .set('Authorization', 'Basic dXNlcjpwYXNz');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // =========================================================================
  // 2. Account Status Lifecycle Enforcement
  // =========================================================================
  describe('2. Account Status Lifecycle Enforcement', () => {
    it('blocks suspended accounts from accessing tickets (403 ACCOUNT_SUSPENDED)', async () => {
      const res = await request(app)
        .get('/api/tickets')
        .set('Authorization', 'Bearer token-suspended');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('blocks accounts pending approval from accessing staff queue (403 ACCOUNT_PENDING_APPROVAL)', async () => {
      const res = await request(app)
        .get('/api/staff/queue')
        .set('Authorization', 'Bearer token-pending');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_PENDING_APPROVAL');
    });
  });

  // =========================================================================
  // 3. Cross-Student Ownership Isolation
  // =========================================================================
  describe('3. Cross-Student Ownership Isolation', () => {
    let aliceTicket;

    beforeEach(async () => {
      aliceTicket = await ticketService.createTicket(
        {
          title: 'Alice Private Lab Issue',
          description: 'Cannot access lab computer 4B.',
          categoryId: 'cat-cse',
          assignedDepartmentId: DEPT_CSE,
          priority: 'Medium',
        },
        studentAlice
      );
    });

    it('prohibits Student Bob from viewing Student Alice ticket details (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get(`/api/tickets/${aliceTicket.id}`)
        .set('Authorization', 'Bearer token-bob');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('prohibits Student Bob from posting comments on Student Alice ticket (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post(`/api/tickets/${aliceTicket.id}/comments`)
        .set('Authorization', 'Bearer token-bob')
        .send({ content: 'Unauthorized comment by Bob' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('prohibits Student Bob from listing comments on Student Alice ticket (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get(`/api/tickets/${aliceTicket.id}/comments`)
        .set('Authorization', 'Bearer token-bob');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('prohibits Student Bob from listing attachments on Student Alice ticket (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get(`/api/tickets/${aliceTicket.id}/attachments`)
        .set('Authorization', 'Bearer token-bob');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('prohibits Student Bob from uploading attachments to Student Alice ticket (403 FORBIDDEN)', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 test payload');
      const res = await request(app)
        .post(`/api/tickets/${aliceTicket.id}/attachments`)
        .set('Authorization', 'Bearer token-bob')
        .attach('files', pdfBuffer, 'sample.pdf');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('prohibits Student Bob from editing Student Alice ticket (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .patch(`/api/tickets/${aliceTicket.id}`)
        .set('Authorization', 'Bearer token-bob')
        .send({ title: 'Hacked Title' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('prohibits Student Bob from reopening Student Alice ticket (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post(`/api/tickets/${aliceTicket.id}/reopen`)
        .set('Authorization', 'Bearer token-bob')
        .send({ reason: 'Unauthorized reopen attempt' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('strictly isolates ticket listings so Student Bob never sees Alice ticket', async () => {
      const res = await request(app)
        .get('/api/tickets')
        .set('Authorization', 'Bearer token-bob');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const ticketIds = res.body.data.tickets.map((t) => t.id);
      expect(ticketIds).not.toContain(aliceTicket.id);
    });
  });

  // =========================================================================
  // 4. Staff Department Scoping Restrictions
  // =========================================================================
  describe('4. Staff Department Scoping Restrictions', () => {
    let cseTicket;

    beforeEach(async () => {
      cseTicket = await ticketService.createTicket(
        {
          title: 'CSE Compiler Server Down',
          description: 'GCC server is not responding.',
          categoryId: 'cat-cse',
          assignedDepartmentId: DEPT_CSE,
          priority: 'High',
        },
        studentAlice
      );
    });

    it('prohibits outside department staff (Finance) from accessing CSE ticket details (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get(`/api/tickets/${cseTicket.id}`)
        .set('Authorization', 'Bearer token-staff-finance');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('prohibits outside department staff from claiming CSE ticket (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post(`/api/tickets/${cseTicket.id}/claim`)
        .set('Authorization', 'Bearer token-staff-finance');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('prohibits outside department staff from assigning CSE ticket (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post(`/api/tickets/${cseTicket.id}/assign`)
        .set('Authorization', 'Bearer token-staff-finance')
        .send({ assignedTo: staffFinanceCarol.id });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('prohibits outside department staff from posting comments on CSE ticket (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post(`/api/tickets/${cseTicket.id}/comments`)
        .set('Authorization', 'Bearer token-staff-finance')
        .send({ content: 'Comment from wrong department' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('prohibits outside department staff from transitioning status of CSE ticket (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .patch(`/api/tickets/${cseTicket.id}/status`)
        .set('Authorization', 'Bearer token-staff-finance')
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows authorized CSE department staff to access and claim the ticket (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/tickets/${cseTicket.id}`)
        .set('Authorization', 'Bearer token-staff-cse');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(cseTicket.id);
    });
  });

  // =========================================================================
  // 5. Confidential Grievance Visibility & Officer Scoping
  // =========================================================================
  describe('5. Confidential Grievance Visibility & Officer Scoping', () => {
    let grievanceTicket;

    beforeEach(async () => {
      grievanceTicket = await ticketService.createTicket(
        {
          title: 'Confidential Harassment Report',
          description: 'Sensitive complaint regarding hostel incident.',
          categoryId: 'cat-grievance',
          assignedDepartmentId: DEPT_AFFAIRS,
          priority: 'Urgent',
          isConfidential: true,
        },
        studentAlice
      );
    });

    it('allows student creator (Alice) to view her own confidential grievance (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/tickets/${grievanceTicket.id}`)
        .set('Authorization', 'Bearer token-alice');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(grievanceTicket.id);
    });

    it('prohibits unauthorized staff (CSE & Finance) from viewing confidential grievance (403 FORBIDDEN)', async () => {
      const resCse = await request(app)
        .get(`/api/tickets/${grievanceTicket.id}`)
        .set('Authorization', 'Bearer token-staff-cse');
      expect(resCse.status).toBe(403);
      expect(resCse.body.success).toBe(false);

      const resFin = await request(app)
        .get(`/api/tickets/${grievanceTicket.id}`)
        .set('Authorization', 'Bearer token-staff-finance');
      expect(resFin.status).toBe(403);
      expect(resFin.body.success).toBe(false);
    });

    it('prohibits unauthorized staff from viewing comments on confidential grievance (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get(`/api/tickets/${grievanceTicket.id}/comments`)
        .set('Authorization', 'Bearer token-staff-finance');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('excludes confidential tickets from unauthorized staff department queues', async () => {
      const res = await request(app)
        .get('/api/staff/queue')
        .set('Authorization', 'Bearer token-staff-finance');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const queueIds = res.body.data.tickets.map((t) => t.id);
      expect(queueIds).not.toContain(grievanceTicket.id);
    });

    it('allows authorized grievance officer (Student Affairs) to access confidential ticket (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/tickets/${grievanceTicket.id}`)
        .set('Authorization', 'Bearer token-staff-grievance');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(grievanceTicket.id);
    });
  });

  // =========================================================================
  // 6. Internal Notes & Restricted Detail Isolation
  // =========================================================================
  describe('6. Internal Notes & Restricted Detail Isolation', () => {
    let ticket;
    let internalAttachment;
    let publicAttachment;

    beforeEach(async () => {
      ticket = await ticketService.createTicket(
        {
          title: 'Exam Hall Ticket Missing Seat',
          description: 'No seat number printed on hall ticket.',
          categoryId: 'cat-exam',
          assignedDepartmentId: DEPT_CSE,
          priority: 'High',
        },
        studentAlice
      );

      // Staff adds public comment
      await CommentService.addComment({
        ticketId: ticket.id,
        content: 'We are verifying with the exam coordinator.',
        isInternal: false,
        user: staffCseCharlie,
        role: staffCseCharlie.role,
        departmentId: staffCseCharlie.department_id,
      });

      // Staff adds internal note
      await CommentService.addComment({
        ticketId: ticket.id,
        content: 'INTERNAL NOTE: Student has fee hold pending verification.',
        isInternal: true,
        user: staffCseCharlie,
        role: staffCseCharlie.role,
        departmentId: staffCseCharlie.department_id,
      });

      // Public attachment
      const publicPdf = Buffer.from('%PDF-1.4 Public hall ticket scan');
      const [pubAtt] = await AttachmentService.uploadAttachments({
        files: [{ originalname: 'hall_ticket.pdf', mimetype: 'application/pdf', size: publicPdf.length, buffer: publicPdf }],
        ticketId: ticket.id,
        user: studentAlice,
        isInternal: false,
      });
      publicAttachment = pubAtt;

      // Internal attachment
      const internalPdf = Buffer.from('%PDF-1.4 Internal fee audit report');
      const [intAtt] = await AttachmentService.uploadAttachments({
        files: [{ originalname: 'internal_fee_audit.pdf', mimetype: 'application/pdf', size: internalPdf.length, buffer: internalPdf }],
        ticketId: ticket.id,
        user: staffCseCharlie,
        isInternal: true,
      });
      internalAttachment = intAtt;
    });

    it('prohibits students from submitting internal staff notes (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/comments`)
        .set('Authorization', 'Bearer token-alice')
        .send({
          content: 'Student trying to sneak in an internal note',
          isInternal: true,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('filters out internal notes when student queries comments (student sees only public comments)', async () => {
      const res = await request(app)
        .get(`/api/tickets/${ticket.id}/comments`)
        .set('Authorization', 'Bearer token-alice');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const comments = res.body.data.comments;
      expect(comments.length).toBe(1);
      expect(comments[0].content).toContain('verifying with the exam coordinator');
      expect(comments.some((c) => c.is_internal)).toBe(false);
    });

    it('allows authorized staff to see both public and internal notes', async () => {
      const res = await request(app)
        .get(`/api/tickets/${ticket.id}/comments`)
        .set('Authorization', 'Bearer token-staff-cse');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const comments = res.body.data.comments;
      expect(comments.length).toBe(2);
      expect(comments.some((c) => c.is_internal)).toBe(true);
    });

    it('filters out internal attachments when student lists attachments', async () => {
      const res = await request(app)
        .get(`/api/tickets/${ticket.id}/attachments`)
        .set('Authorization', 'Bearer token-alice');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const attachments = res.body.data.attachments;
      expect(attachments.some((a) => a.is_internal)).toBe(false);
      expect(attachments.map((a) => a.id)).toContain(publicAttachment.id);
      expect(attachments.map((a) => a.id)).not.toContain(internalAttachment.id);
    });

    it('strictly denies student from downloading internal note attachment (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get(`/api/tickets/${ticket.id}/attachments/${internalAttachment.id}/download`)
        .set('Authorization', 'Bearer token-alice');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('prohibits students and regular staff from viewing admin system audit logs (403 FORBIDDEN)', async () => {
      const studentRes = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', 'Bearer token-alice');
      expect(studentRes.status).toBe(403);

      const staffRes = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', 'Bearer token-staff-cse');
      expect(staffRes.status).toBe(403);
    });

    it('allows Super Admin to view admin audit logs (200 OK)', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', 'Bearer token-super-admin');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // =========================================================================
  // 7. Status Transitions & State Machine Boundaries
  // =========================================================================
  describe('7. Status Transitions & State Machine Boundaries', () => {
    let ticket;

    beforeEach(async () => {
      ticket = await ticketService.createTicket(
        {
          title: 'Wi-Fi Connection Issue',
          description: 'Hostel Block A 2nd floor has no signal.',
          categoryId: 'cat-it',
          assignedDepartmentId: DEPT_CSE,
          priority: 'Low',
        },
        studentAlice
      );
    });

    it('prohibits student from transitioning ticket status directly (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .patch(`/api/tickets/${ticket.id}/status`)
        .set('Authorization', 'Bearer token-alice')
        .send({ status: 'RESOLVED', resolutionSummary: 'Fixed by student myself' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid status jumps (e.g. OPEN -> RESOLVED directly) with 400 INVALID_STATUS_TRANSITION', async () => {
      const res = await request(app)
        .patch(`/api/tickets/${ticket.id}/status`)
        .set('Authorization', 'Bearer token-staff-cse')
        .send({
          status: 'RESOLVED',
          resolutionSummary: 'Skipped in-progress state illegally',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('requires a mandatory resolution summary (>= 5 chars) on resolution (400 RESOLUTION_SUMMARY_REQUIRED)', async () => {
      // First move to IN_PROGRESS
      await request(app)
        .patch(`/api/tickets/${ticket.id}/status`)
        .set('Authorization', 'Bearer token-staff-cse')
        .send({ status: 'IN_PROGRESS' });

      const res = await request(app)
        .patch(`/api/tickets/${ticket.id}/status`)
        .set('Authorization', 'Bearer token-staff-cse')
        .send({ status: 'RESOLVED' }); // missing resolution summary

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('RESOLUTION_SUMMARY_REQUIRED');
    });

    it('requires a mandatory rejection reason (>= 5 chars) on rejection (400 REJECTION_REASON_REQUIRED)', async () => {
      const res = await request(app)
        .patch(`/api/tickets/${ticket.id}/status`)
        .set('Authorization', 'Bearer token-staff-cse')
        .send({ status: 'REJECTED' }); // missing rejection reason

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('REJECTION_REASON_REQUIRED');
    });
  });

  // =========================================================================
  // 8. File Upload Validation & File Signature (Magic Bytes) Security
  // =========================================================================
  describe('8. File Upload Validation & Signature Verification', () => {
    let ticket;

    beforeEach(async () => {
      ticket = await ticketService.createTicket(
        {
          title: 'Attachment Testing Ticket',
          description: 'Testing upload security boundaries.',
          categoryId: 'cat-cse',
          assignedDepartmentId: DEPT_CSE,
          priority: 'Medium',
        },
        studentAlice
      );
    });

    it('rejects spoofed file signatures (e.g. bash script disguised as .pdf) with 400', async () => {
      const fakePdfBuffer = Buffer.from('#!/bin/bash\nrm -rf /');
      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/attachments`)
        .set('Authorization', 'Bearer token-alice')
        .attach('files', fakePdfBuffer, 'trojan.pdf');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Security verification failed|signature/i);
    });

    it('rejects executable file extensions (.exe) with 400', async () => {
      const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/attachments`)
        .set('Authorization', 'Bearer token-alice')
        .attach('files', exeBuffer, 'malware.exe');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not permitted/i);
    });

    it('rejects files exceeding the 5 MB size limit with 400', async () => {
      // 5.5 MB dummy buffer starting with PDF magic bytes
      const bigBuffer = Buffer.alloc(5.5 * 1024 * 1024);
      bigBuffer.write('%PDF-1.4', 0);

      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/attachments`)
        .set('Authorization', 'Bearer token-alice')
        .attach('files', bigBuffer, 'oversized.pdf');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/exceeds.*5 MB/i);
    });

    it('accepts genuine PDF files matching the magic byte signature (201 Created)', async () => {
      const validPdfBuffer = Buffer.from('%PDF-1.4 valid content here');
      const res = await request(app)
        .post(`/api/tickets/${ticket.id}/attachments`)
        .set('Authorization', 'Bearer token-alice')
        .attach('files', validPdfBuffer, 'genuine.pdf');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.attachments.length).toBe(1);
      expect(res.body.data.attachments[0].file_name).toBe('genuine.pdf');
    });
  });

  // =========================================================================
  // 9. Error Sanitization & Secret Disclosures
  // =========================================================================
  describe('9. Error Sanitization & Secret Disclosures', () => {
    it('sanitizes and redacts credentials from error messages', async () => {
      // Intentionally trigger an error with embedded credentials in test route or custom handler
      const res = await request(app)
        .patch('/api/auth/profile')
        .set('Authorization', 'Bearer token-alice')
        .send({
          // Invalid payload structure causing error or edge condition
          yearOfStudy: 'invalid-string',
        });

      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(bodyStr).not.toContain('JWT_SECRET');
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain('Bearer secret_');
    });
  });

  // =========================================================================
  // 10. Rate Limiting & Abuse Protections
  // =========================================================================
  describe('10. Rate Limiting & Abuse Protections', () => {
    it('returns 429 RATE_LIMIT_EXCEEDED when rate limits are exceeded', async () => {
      // Use test rate limit header with a low test threshold (e.g. 5 requests)
      let lastResponse;
      for (let i = 0; i < 25; i++) {
        lastResponse = await request(app)
          .post('/api/tickets')
          .set('Authorization', 'Bearer token-alice')
          .set('x-test-rate-limit', 'true')
          .send({
            title: `Flood Ticket ${i}`,
            description: 'Flood description for abuse testing.',
            categoryId: 'cat-cse',
            assignedDepartmentId: DEPT_CSE,
            priority: 'Low',
          });

        if (lastResponse.status === 429) break;
      }

      expect(lastResponse.status).toBe(429);
      expect(lastResponse.body.success).toBe(false);
      expect(lastResponse.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });
});
