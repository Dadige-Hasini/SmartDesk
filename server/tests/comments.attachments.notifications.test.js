import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateFileMagicBytes, validateAttachment } from '../src/utils/fileValidation.js';
import { CommentService, inMemoryComments } from '../src/services/comment.service.js';
import {
  AttachmentService,
  inMemoryAttachments,
  inMemoryFileBuffers,
} from '../src/services/attachment.service.js';
import {
  NotificationService,
  inMemoryNotifications,
  inMemoryPreferences,
} from '../src/services/notification.service.js';
import {
  EmailService,
  inMemoryEmailJobs,
  setCustomTransporter,
  resetTransporter,
} from '../src/services/email.service.js';
import { ticketRepository } from '../src/repositories/ticket.repository.js';
import { TicketService } from '../src/services/ticket.service.js';

describe('SmartDesk Phase 3: Comments, Attachments, Notifications & Email Outbox', () => {
  const DEPT_CSE = '11111111-1111-1111-1111-111111111111';
  const DEPT_FINANCE = '22222222-2222-2222-2222-222222222222';
  const DEPT_REGISTRAR = '33333333-3333-3333-3333-333333333333';

  const studentAlice = {
    id: 'student-alice-id',
    email: 'alice@student.college.edu',
    full_name: 'Alice Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
  };

  const studentBob = {
    id: 'student-bob-id',
    email: 'bob@student.college.edu',
    full_name: 'Bob Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: DEPT_CSE,
  };

  const staffCarol = {
    id: 'staff-carol-id',
    email: 'carol@staff.college.edu',
    full_name: 'Carol Staff',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_FINANCE,
  };

  const staffDave = {
    id: 'staff-dave-id',
    email: 'dave@staff.college.edu',
    full_name: 'Dave Staff',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: DEPT_REGISTRAR,
  };

  let testTicket;
  const ticketService = new TicketService();

  beforeEach(async () => {
    // Clear in-memory test states
    inMemoryComments.length = 0;
    inMemoryAttachments.length = 0;
    inMemoryNotifications.length = 0;
    inMemoryEmailJobs.length = 0;
    inMemoryPreferences.clear();
    inMemoryFileBuffers.clear();
    resetTransporter();

    // Register profiles in repository memory
    ticketRepository.registerProfile(studentAlice);
    ticketRepository.registerProfile(studentBob);
    ticketRepository.registerProfile(staffCarol);
    ticketRepository.registerProfile(staffDave);

    // Create a base ticket owned by Alice, assigned to Finance department
    testTicket = await ticketService.createTicket(
      {
        title: 'Tuition Fee Discrepancy Spring 2026',
        description: 'Payment receipt shows paid but portal indicates balance due.',
        categoryId: 'cat-fees-001',
        assignedDepartmentId: DEPT_FINANCE,
        priority: 'High',
      },
      studentAlice
    );

    // Clear initial lifecycle jobs so tests start with a clean outbox and notification state
    inMemoryEmailJobs.length = 0;
    inMemoryNotifications.length = 0;
  });

  afterEach(() => {
    resetTransporter();
  });

  // ====================================================================
  // 1. FILE VALIDATION & MAGIC BYTES SIGNATURE ENFORCEMENT
  // ====================================================================
  describe('File Validation & Magic Bytes Verification', () => {
    it('approves legitimate PDF, JPEG, PNG, WEBP, and DOCX files', () => {
      // PDF: %PDF-
      const pdfBuffer = Buffer.from('%PDF-1.4 valid test content');
      const pdfCheck = validateAttachment({
        originalname: 'receipt.pdf',
        size: pdfBuffer.length,
        mimetype: 'application/pdf',
        buffer: pdfBuffer,
      });
      expect(pdfCheck.isValid).toBe(true);

      // PNG: 89 50 4E 47 0D 0A 1A 0A
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
      const pngCheck = validateAttachment({
        originalname: 'screenshot.png',
        size: pngBuffer.length,
        mimetype: 'image/png',
        buffer: pngBuffer,
      });
      expect(pngCheck.isValid).toBe(true);

      // JPEG: FF D8 FF
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const jpegCheck = validateAttachment({
        originalname: 'photo.jpg',
        size: jpegBuffer.length,
        mimetype: 'image/jpeg',
        buffer: jpegBuffer,
      });
      expect(jpegCheck.isValid).toBe(true);

      // WEBP: RIFF....WEBP
      const webpBuffer = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0x00, 0x00, 0x00, 0x10]),
        Buffer.from('WEBP'),
        Buffer.from('testdata'),
      ]);
      const webpCheck = validateAttachment({
        originalname: 'graphic.webp',
        size: webpBuffer.length,
        mimetype: 'image/webp',
        buffer: webpBuffer,
      });
      expect(webpCheck.isValid).toBe(true);

      // DOCX: ZIP PK 03 04 with [Content_Types].xml
      const docxBuffer = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.from('...[Content_Types].xml...word/document.xml...'),
      ]);
      const docxCheck = validateAttachment({
        originalname: 'statement.docx',
        size: docxBuffer.length,
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: docxBuffer,
      });
      expect(docxCheck.isValid).toBe(true);
    });

    it('rejects spoofed files (e.g. executable script disguised as PDF)', () => {
      // Fake PDF with bash script content
      const spoofedBuffer = Buffer.from('#!/bin/bash\nrm -rf /');
      const check = validateAttachment({
        originalname: 'exploit.pdf',
        size: spoofedBuffer.length,
        mimetype: 'application/pdf',
        buffer: spoofedBuffer,
      });
      expect(check.isValid).toBe(false);
      expect(check.error).toMatch(/signature/i);
    });

    it('rejects unapproved extensions (.exe, .sh, .bat)', () => {
      const check = validateAttachment({
        originalname: 'malware.exe',
        size: 100,
        mimetype: 'application/octet-stream',
        buffer: Buffer.from('MZ...'),
      });
      expect(check.isValid).toBe(false);
      expect(check.error).toMatch(/extension/i);
    });

    it('rejects files exceeding 5 MB limit', () => {
      const largeSize = 5 * 1024 * 1024 + 1; // 5 MB + 1 byte
      const check = validateAttachment({
        originalname: 'large.pdf',
        size: largeSize,
        mimetype: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 test'),
      });
      expect(check.isValid).toBe(false);
      expect(check.error).toMatch(/exceeds/i);
    });

    it('rejects upload batches exceeding 3 files', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 test');
      const files = [
        { originalname: '1.pdf', size: pdfBuffer.length, mimetype: 'application/pdf', buffer: pdfBuffer },
        { originalname: '2.pdf', size: pdfBuffer.length, mimetype: 'application/pdf', buffer: pdfBuffer },
        { originalname: '3.pdf', size: pdfBuffer.length, mimetype: 'application/pdf', buffer: pdfBuffer },
        { originalname: '4.pdf', size: pdfBuffer.length, mimetype: 'application/pdf', buffer: pdfBuffer },
      ];

      await expect(
        AttachmentService.uploadAttachments({
          files,
          ticketId: testTicket.id,
          user: studentAlice,
        })
      ).rejects.toThrow(/Too many files/i);
    });
  });

  // ====================================================================
  // 2. PUBLIC COMMENTS VS INTERNAL NOTES (ISOLATION & PERMISSIONS)
  // ====================================================================
  describe('Comment System & Internal Note Isolation', () => {
    it('allows student to add a public comment on their ticket', async () => {
      const comment = await CommentService.addComment({
        ticketId: testTicket.id,
        content: 'I have attached the bank transaction ID for reference.',
        isInternal: false,
        user: studentAlice,
        role: 'STUDENT',
        departmentId: studentAlice.department_id,
      });

      expect(comment.id).toBeDefined();
      expect(comment.is_internal).toBe(false);
      expect(comment.content).toContain('bank transaction ID');
    });

    it('prohibits students from creating internal staff notes (403 Forbidden)', async () => {
      await expect(
        CommentService.addComment({
          ticketId: testTicket.id,
          content: 'Secret student note',
          isInternal: true,
          user: studentAlice,
          role: 'STUDENT',
          departmentId: studentAlice.department_id,
        })
      ).rejects.toThrow(/not permitted to create internal staff notes/i);
    });

    it('allows authorized staff to post internal notes', async () => {
      const internalNote = await CommentService.addComment({
        ticketId: testTicket.id,
        content: 'Check ERP ledger for transaction ref #TXN-9988.',
        isInternal: true,
        user: staffCarol,
        role: 'STAFF',
        departmentId: staffCarol.department_id,
      });

      expect(internalNote.id).toBeDefined();
      expect(internalNote.is_internal).toBe(true);
    });

    it('strictly isolates internal notes from student query responses', async () => {
      // 1. Staff posts public comment
      await CommentService.addComment({
        ticketId: testTicket.id,
        content: 'Hello Alice, we are verifying this with accounts.',
        isInternal: false,
        user: staffCarol,
        role: 'STAFF',
        departmentId: staffCarol.department_id,
      });

      // 2. Staff posts internal note
      await CommentService.addComment({
        ticketId: testTicket.id,
        content: 'Internal: Bank gateway was down between 2pm-4pm yesterday.',
        isInternal: true,
        user: staffCarol,
        role: 'STAFF',
        departmentId: staffCarol.department_id,
      });

      // 3. Student Alice fetches comments
      const studentView = await CommentService.getTicketComments(
        testTicket.id,
        studentAlice,
        'STUDENT',
        studentAlice.department_id
      );

      // Must NOT contain internal note
      expect(studentView.some((c) => c.is_internal === true)).toBe(false);
      expect(studentView.some((c) => c.content.includes('gateway was down'))).toBe(false);
      expect(studentView.length).toBe(1);

      // 4. Staff Carol fetches comments
      const staffView = await CommentService.getTicketComments(
        testTicket.id,
        staffCarol,
        'STAFF',
        staffCarol.department_id
      );

      // Staff sees both public and internal
      expect(staffView.length).toBe(2);
      expect(staffView.some((c) => c.is_internal === true)).toBe(true);
    });

    it('rejects unauthorized students from viewing another student comments (403)', async () => {
      await expect(
        CommentService.getTicketComments(
          testTicket.id,
          studentBob,
          'STUDENT',
          studentBob.department_id
        )
      ).rejects.toThrow(/not authorized to view comments/i);
    });
  });

  // ====================================================================
  // 3. ATTACHMENT PERMISSIONS & INTERNAL VISIBILITY ON DOWNLOAD
  // ====================================================================
  describe('Attachment Download & Permission Rechecks', () => {
    it('prevents student from downloading an attachment linked to an internal note', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 confidential audit log');

      // Upload attachment as internal
      const [internalAttachment] = await AttachmentService.uploadAttachments({
        files: [
          {
            originalname: 'audit.pdf',
            size: pdfBuffer.length,
            mimetype: 'application/pdf',
            buffer: pdfBuffer,
          },
        ],
        ticketId: testTicket.id,
        user: staffCarol,
        isInternal: true,
      });

      // Student Alice tries to download
      await expect(
        AttachmentService.getAttachmentDownload({
          ticketId: testTicket.id,
          attachmentId: internalAttachment.id,
          user: studentAlice,
          role: 'STUDENT',
          departmentId: studentAlice.department_id,
        })
      ).rejects.toThrow(/restricted to authorized staff/i);
    });

    it('allows student to download non-internal attachments on their own ticket', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 student fee receipt');

      const [publicAttachment] = await AttachmentService.uploadAttachments({
        files: [
          {
            originalname: 'receipt.pdf',
            size: pdfBuffer.length,
            mimetype: 'application/pdf',
            buffer: pdfBuffer,
          },
        ],
        ticketId: testTicket.id,
        user: studentAlice,
        isInternal: false,
      });

      const downloadResult = await AttachmentService.getAttachmentDownload({
        ticketId: testTicket.id,
        attachmentId: publicAttachment.id,
        user: studentAlice,
        role: 'STUDENT',
        departmentId: studentAlice.department_id,
      });

      expect(downloadResult.fileName).toBe('receipt.pdf');
      expect(downloadResult.buffer).toBeDefined();
    });

    it('rejects staff from outside department from downloading attachments', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 receipt');
      const [attachment] = await AttachmentService.uploadAttachments({
        files: [
          {
            originalname: 'receipt.pdf',
            size: pdfBuffer.length,
            mimetype: 'application/pdf',
            buffer: pdfBuffer,
          },
        ],
        ticketId: testTicket.id,
        user: studentAlice,
        isInternal: false,
      });

      // Staff Dave belongs to Registrar, but ticket is assigned to Finance
      await expect(
        AttachmentService.getAttachmentDownload({
          ticketId: testTicket.id,
          attachmentId: attachment.id,
          user: staffDave,
          role: 'STAFF',
          departmentId: staffDave.department_id,
        })
      ).rejects.toThrow(/outside your department/i);
    });
  });

  // ====================================================================
  // 4. IN-APP NOTIFICATIONS & USER PREFERENCE SETTINGS
  // ====================================================================
  describe('In-App Notifications & Preference Management', () => {
    it('creates in-app notifications and tracks unread count', async () => {
      await NotificationService.createInAppNotification({
        recipientId: studentAlice.id,
        ticketId: testTicket.id,
        title: 'Ticket Created',
        message: 'Your ticket has been submitted.',
        type: 'TICKET_CREATED',
      });

      await NotificationService.createInAppNotification({
        recipientId: studentAlice.id,
        ticketId: testTicket.id,
        title: 'Staff Replied',
        message: 'Carol posted a comment.',
        type: 'NEW_COMMENT',
      });

      const notifs = await NotificationService.getNotifications(studentAlice.id);
      expect(notifs.items.length).toBe(2);
      expect(notifs.unreadCount).toBe(2);

      // Mark one as read
      await NotificationService.markAsRead(notifs.items[0].id, studentAlice.id);
      const afterOneRead = await NotificationService.getNotifications(studentAlice.id);
      expect(afterOneRead.unreadCount).toBe(1);

      // Mark all read
      await NotificationService.markAllAsRead(studentAlice.id);
      const afterAllRead = await NotificationService.getNotifications(studentAlice.id);
      expect(afterAllRead.unreadCount).toBe(0);
    });

    it('honors per-event email preferences and suppresses disabled notifications', async () => {
      // Alice turns off email for comments
      await NotificationService.updatePreferences(studentAlice.id, {
        email_on_comment_added: false,
      });

      // Dispatch a NEW_COMMENT notification
      await NotificationService.notifyUser({
        recipientId: studentAlice.id,
        recipientEmail: studentAlice.email,
        recipientName: studentAlice.full_name,
        ticket: testTicket,
        eventType: 'NEW_COMMENT',
        title: 'New Comment',
        message: 'A staff member commented.',
        actorName: 'Carol Staff',
        note: 'Hello Alice',
      });

      // In-app notification should still be created
      const aliceNotifs = await NotificationService.getNotifications(studentAlice.id);
      expect(aliceNotifs.items.length).toBeGreaterThanOrEqual(1);

      // But NO email job should be queued because email_on_comment_added was disabled!
      const commentEmailJob = inMemoryEmailJobs.find(
        (job) => job.recipient_email === studentAlice.email && job.event_type === 'NEW_COMMENT'
      );
      expect(commentEmailJob).toBeUndefined();
    });
  });

  // ====================================================================
  // 5. ASYNC EMAIL OUTBOX, DEDUPLICATION & RESILIENT RETRY LOGIC
  // ====================================================================
  describe('Email Outbox, Deduplication & Mail-Provider Outage Resilience', () => {
    it('prevents duplicate sends using unique dedup_key', async () => {
      const dedupKey = `TICKET_CREATED:${testTicket.id}:${studentAlice.email}:dedup-test`;

      // First enqueue
      const job1 = await EmailService.enqueueEmailJob({
        recipientEmail: studentAlice.email,
        recipientName: studentAlice.full_name,
        subject: 'First send',
        bodyHtml: '<p>First</p>',
        bodyText: 'First',
        eventType: 'TICKET_CREATED',
        ticketId: testTicket.id,
        dedupKey,
      });

      expect(job1).toBeDefined();

      // Second enqueue with identical dedupKey
      const job2 = await EmailService.enqueueEmailJob({
        recipientEmail: studentAlice.email,
        recipientName: studentAlice.full_name,
        subject: 'Second send',
        bodyHtml: '<p>Second</p>',
        bodyText: 'Second',
        eventType: 'TICKET_CREATED',
        ticketId: testTicket.id,
        dedupKey,
      });

      // Deduplication prevents second record from queueing
      const matchingJobs = inMemoryEmailJobs.filter((j) => j.dedup_key === dedupKey);
      expect(matchingJobs.length).toBe(1);
    });

    it('ensures mail-provider outage does not fail ticket operations and schedules retries', async () => {
      // Simulate mail-provider connection outage
      setCustomTransporter({
        sendMail: vi.fn().mockRejectedValue(new Error('SMTP Connection Timeout (ETIMEDOUT)')),
      });

      const dedupKey = `STATUS_CHANGED:${testTicket.id}:outage-test`;
      await EmailService.enqueueEmailJob({
        recipientEmail: studentAlice.email,
        recipientName: studentAlice.full_name,
        subject: 'Status changed',
        bodyHtml: '<p>Status changed</p>',
        bodyText: 'Status changed',
        eventType: 'STATUS_CHANGED',
        ticketId: testTicket.id,
        dedupKey,
      });

      // Worker runs delivery cycle
      const result = await EmailService.processPendingJobs();
      expect(result.failed).toBe(1);

      const job = inMemoryEmailJobs.find((j) => j.dedup_key === dedupKey);
      expect(job.status).toBe('FAILED');
      expect(job.attempts).toBe(1);
      expect(job.error_message).toContain('ETIMEDOUT');
      expect(new Date(job.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('marks email job as SENT when mail provider is healthy', async () => {
      const dedupKey = `RESOLVED:${testTicket.id}:success-test`;
      await EmailService.enqueueEmailJob({
        recipientEmail: studentAlice.email,
        recipientName: studentAlice.full_name,
        subject: 'Resolved',
        bodyHtml: '<p>Resolved</p>',
        bodyText: 'Resolved',
        eventType: 'RESOLVED',
        ticketId: testTicket.id,
        dedupKey,
      });

      const result = await EmailService.processPendingJobs();
      expect(result.processed).toBe(1);

      const job = inMemoryEmailJobs.find((j) => j.dedup_key === dedupKey);
      expect(job.status).toBe('SENT');
      expect(job.sent_at).toBeDefined();
    });
  });
});
