import { describe, it, expect, beforeEach } from 'vitest';
import { faqService, inMemoryFaqs, inMemoryFaqVotes } from '../src/services/faq.service.js';
import {
  ragService,
  inMemoryKnowledgeDocs,
  inMemoryDocumentChunks,
} from '../src/services/ai/rag.service.js';
import { semanticSearchService } from '../src/services/ai/semantic_search.service.js';
import { inMemoryTickets, inMemoryProfiles } from '../src/repositories/ticket.repository.js';

describe('SmartDesk Phase 8: Knowledge Base & FAQ Management System', () => {
  const studentBob = {
    id: 'usr-student-bob',
    email: 'bob@student.college.edu',
    full_name: 'Bob Student',
    role: 'STUDENT',
    status: 'ACTIVE',
    department_id: 'dept-cse',
  };

  const staffSarah = {
    id: 'usr-staff-sarah',
    email: 'sarah@it.college.edu',
    full_name: 'Sarah IT Staff',
    role: 'STAFF',
    status: 'ACTIVE',
    department_id: 'dept-it',
    can_approve_documents: false,
  };

  const superAdmin = {
    id: 'usr-admin-root',
    email: 'admin@college.edu',
    full_name: 'Root Administrator',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    can_approve_documents: true,
  };

  const sampleResolvedTicket = {
    id: 'tkt-test-resolved-01',
    ticket_number: 'TKT-2026-000100',
    title: 'Cannot access laboratory computers due to expired LDAP',
    description: 'My computer science lab account credentials expired and I cannot log in.',
    category_id: 'c1000000-0000-0000-0000-000000000006',
    assigned_department_id: 'dept-it',
    status: 'RESOLVED',
    resolution_summary: 'Reset laboratory domain password and extended account expiry to semester end.',
    tags: ['ldap', 'lab login', 'password reset'],
    created_by: studentBob.id,
  };

  beforeEach(() => {
    inMemoryFaqVotes.length = 0;
    inMemoryTickets.clear();
    inMemoryTickets.set(sampleResolvedTicket.id, sampleResolvedTicket);
  });

  describe('1. Public FAQ Access & Search (Guest & Unauthenticated)', () => {
    it('returns published, active FAQs without authentication', async () => {
      const result = await faqService.getPublicFaqs();
      expect(result).toHaveProperty('faqs');
      expect(result.faqs.length).toBeGreaterThan(0);
      result.faqs.forEach((faq) => {
        expect(faq.status).toBe('PUBLISHED');
        expect(faq.visibility).toBe('PUBLIC');
        expect(faq.is_published).toBe(true);
      });
    });

    it('filters FAQs accurately by search keyword', async () => {
      const result = await faqService.getPublicFaqs({ search: 'wifi' });
      expect(result.faqs.length).toBeGreaterThan(0);
      result.faqs.forEach((faq) => {
        const matchesQuestion = faq.question.toLowerCase().includes('wifi');
        const matchesAnswer = faq.answer.toLowerCase().includes('wifi');
        const matchesKeyword = faq.keywords?.some((k) => k.toLowerCase().includes('wifi'));
        expect(matchesQuestion || matchesAnswer || matchesKeyword).toBe(true);
      });
    });

    it('filters FAQs by category', async () => {
      const result = await faqService.getPublicFaqs({ categoryId: 'CAMPUS_IT' });
      expect(result.faqs.length).toBeGreaterThan(0);
      result.faqs.forEach((faq) => {
        expect(faq.category_code).toBe('CAMPUS_IT');
      });
    });
  });

  describe('2. Helpful / Unhelpful Voting & Abuse Prevention', () => {
    it('records helpful feedback and increments helpful_count', async () => {
      const targetFaq = inMemoryFaqs.find((f) => f.status === 'PUBLISHED');
      const initialHelpful = targetFaq.helpful_count || 0;

      const res = await faqService.voteFaq({
        faqId: targetFaq.id,
        isHelpful: true,
        userId: 'unique-user-1',
        ipAddress: '10.0.0.1',
      });

      expect(res.success).toBe(true);
      expect(targetFaq.helpful_count).toBe(initialHelpful + 1);
    });

    it('prevents duplicate voting from the same authenticated user (429 DUPLICATE_VOTE)', async () => {
      const targetFaq = inMemoryFaqs.find((f) => f.status === 'PUBLISHED');

      await faqService.voteFaq({
        faqId: targetFaq.id,
        isHelpful: true,
        userId: studentBob.id,
        ipAddress: '192.168.1.100',
      });

      // Second attempt must fail with 429
      await expect(
        faqService.voteFaq({
          faqId: targetFaq.id,
          isHelpful: false,
          userId: studentBob.id,
          ipAddress: '192.168.1.100',
        })
      ).rejects.toThrow(/DUPLICATE_VOTE/);
    });

    it('prevents anonymous guest vote abuse from the same IP address within 24h', async () => {
      const targetFaq = inMemoryFaqs.find((f) => f.status === 'PUBLISHED');

      await faqService.voteFaq({
        faqId: targetFaq.id,
        isHelpful: true,
        userId: null,
        ipAddress: '203.0.113.42',
      });

      // Second guest vote from same IP
      await expect(
        faqService.voteFaq({
          faqId: targetFaq.id,
          isHelpful: true,
          userId: null,
          ipAddress: '203.0.113.42',
        })
      ).rejects.toThrow(/DUPLICATE_VOTE/);
    });
  });

  describe('3. Staff Submission of FAQ Drafts from Resolved Tickets', () => {
    it('rejects ordinary students from creating FAQ drafts (403 Forbidden)', async () => {
      await expect(
        faqService.submitDraftFromTicket(
          {
            ticketId: sampleResolvedTicket.id,
            question: 'How do I renew lab credentials?',
            answer: 'Visit the lab admin with ID.',
          },
          studentBob
        )
      ).rejects.toThrow(/FORBIDDEN/);
    });

    it('allows staff to submit FAQ draft from a resolved ticket with status DRAFT', async () => {
      const draft = await faqService.submitDraftFromTicket(
        {
          ticketId: sampleResolvedTicket.id,
          question: 'How do I renew expired laboratory computer LDAP access?',
          answer: sampleResolvedTicket.resolution_summary,
          keywords: ['lab', 'ldap', 'account expiry'],
        },
        staffSarah
      );

      expect(draft.id).toBeDefined();
      expect(draft.status).toBe('DRAFT');
      expect(draft.is_published).toBe(false);
      expect(draft.source_ticket_id).toBe(sampleResolvedTicket.id);
      expect(draft.created_by).toBe(staffSarah.id);

      // Verify that this draft is NOT visible in public FAQs
      const publicList = await faqService.getPublicFaqs({ search: 'renew expired laboratory' });
      const foundInPublic = publicList.faqs.some((f) => f.id === draft.id);
      expect(foundInPublic).toBe(false);
    });
  });

  describe('4. Super Admin Review, Approval, Publication & Permissions', () => {
    it('rejects ordinary students or non-approver staff from approving FAQs', async () => {
      const draft = await faqService.submitDraftFromTicket(
        {
          ticketId: sampleResolvedTicket.id,
          question: 'Can student approvers publish FAQs without admin rights?',
          answer: 'No, only super admins and authorized approvers can publish.',
        },
        staffSarah
      );

      // Student attempt
      await expect(faqService.approveAndPublishFaq(draft.id, studentBob)).rejects.toThrow(
        /FORBIDDEN/
      );

      // Non-approver staff attempt
      await expect(faqService.approveAndPublishFaq(draft.id, staffSarah)).rejects.toThrow(
        /FORBIDDEN/
      );
    });

    it('allows Super Admin to approve & publish an FAQ, making it visible and embedded', async () => {
      const draft = await faqService.submitDraftFromTicket(
        {
          ticketId: sampleResolvedTicket.id,
          question: 'How to reset campus lab workstation passwords?',
          answer: 'Submit identity card to CSE lab technician on 2nd Floor.',
          keywords: ['workstation', 'password'],
        },
        staffSarah
      );

      const approved = await faqService.approveAndPublishFaq(draft.id, superAdmin);

      expect(approved.status).toBe('PUBLISHED');
      expect(approved.is_published).toBe(true);
      expect(approved.approved_by).toBe(superAdmin.id);
      expect(approved.approved_at).toBeDefined();
      expect(approved.embedding).toBeDefined();

      // Now it must appear in public FAQs
      const publicList = await faqService.getPublicFaqs({ search: 'reset campus lab workstation' });
      const foundInPublic = publicList.faqs.some((f) => f.id === draft.id);
      expect(foundInPublic).toBe(true);
    });

    it('increments version number and recomputes embedding upon FAQ content update', async () => {
      const draft = await faqService.submitDraftFromTicket(
        {
          question: 'What are the computer laboratory opening hours?',
          answer: 'Laboratories are open from 8:00 AM to 8:00 PM on weekdays.',
        },
        staffSarah
      );
      await faqService.approveAndPublishFaq(draft.id, superAdmin);

      const updated = await faqService.updateFaq(
        draft.id,
        {
          answer: 'Laboratories are open from 8:00 AM to 10:00 PM on weekdays during exam periods.',
        },
        superAdmin
      );

      expect(updated.version).toBe(2);
      expect(updated.answer).toContain('10:00 PM');
      expect(updated.embedding).toBeDefined();
    });
  });

  describe('5. FAQ Retirement & Invalidation from Retrieval Pipeline', () => {
    it('retires an FAQ and immediately removes it from public list and AI deflection', async () => {
      const draft = await faqService.submitDraftFromTicket(
        {
          question: 'Obsolete procedure for physical punch-card library entry?',
          answer: 'Punch card entry is no longer used.',
        },
        staffSarah
      );
      const approved = await faqService.approveAndPublishFaq(draft.id, superAdmin);

      // Verify it is initially searchable in semantic deflection
      let similar = await semanticSearchService.searchSimilarFaqs({
        query: 'punch-card library entry',
      });
      expect(similar.some((f) => f.id === approved.id)).toBe(true);

      // Super Admin retires the FAQ
      const retired = await faqService.retireFaq(approved.id, superAdmin);
      expect(retired.status).toBe('RETIRED');
      expect(retired.is_published).toBe(false);
      expect(retired.retired_by).toBe(superAdmin.id);

      // 1. Must be excluded from public FAQ search
      const publicList = await faqService.getPublicFaqs({ search: 'punch-card' });
      expect(publicList.faqs.some((f) => f.id === approved.id)).toBe(false);

      // 2. Must be immediately invalidated from AI semantic deflection search
      similar = await semanticSearchService.searchSimilarFaqs({
        query: 'punch-card library entry',
      });
      expect(similar.some((f) => f.id === approved.id)).toBe(false);
    });
  });

  describe('6. Knowledge Document Invalidation & Re-indexing in RAG Pipeline', () => {
    it('rejects unauthorized users from retiring knowledge documents', async () => {
      await expect(
        ragService.retireDocument({
          documentId: 'doc-any',
          adminProfile: studentBob,
        })
      ).rejects.toThrow(/FORBIDDEN/);
    });

    it('retires a knowledge document and excludes its chunks from grounded AI generation', async () => {
      // 1. Ingest an approved knowledge document
      const doc = await ragService.ingestDocument({
        title: 'Deprecated 2020 Fee Refund Guidelines',
        description: 'Old fee refund policy with 50% penalty',
        buffer: Buffer.from(
          'Students withdrawing before day 15 receive 50% refund under deprecated 2020 guidelines.',
          'utf-8'
        ),
        fileType: 'TXT',
        adminProfile: superAdmin,
        autoApprove: true,
      });

      expect(doc.status).toBe('ACTIVE');
      expect(doc.is_approved).toBe(true);

      // Verify it is found in similarity query
      let retrieval = await ragService.queryKnowledge({
        query: 'deprecated 2020 fee refund penalty',
        limit: 5,
        userProfile: studentBob,
      });
      expect(retrieval.chunks.some((c) => c.documentId === doc.id)).toBe(true);

      // 2. Retire the document
      const retired = await ragService.retireDocument({
        documentId: doc.id,
        adminProfile: superAdmin,
      });

      expect(retired.status).toBe('RETIRED');
      expect(retired.is_active).toBe(false);

      // 3. Immediately query again: chunks from retired document must be completely excluded!
      retrieval = await ragService.queryKnowledge({
        query: 'deprecated 2020 fee refund penalty',
        limit: 5,
        userProfile: studentBob,
      });
      expect(retrieval.chunks.some((c) => c.documentId === doc.id)).toBe(false);
    });

    it('re-indexes a knowledge document to bumped version and replaces chunks', async () => {
      const doc = await ragService.ingestDocument({
        title: 'Hostel Curfew Policy',
        description: 'Hostel entry timing guidelines',
        buffer: Buffer.from('Hostel main gate closes strictly at 9:00 PM for all students.', 'utf-8'),
        fileType: 'TXT',
        adminProfile: superAdmin,
        autoApprove: true,
      });

      expect(doc.version).toBe(1);

      // Re-index with updated content
      const reindexed = await ragService.reindexDocument({
        documentId: doc.id,
        fileBuffer: Buffer.from(
          'Hostel main gate closes at 10:30 PM with smart biometric verification.',
          'utf-8'
        ),
        fileType: 'TXT',
        adminProfile: superAdmin,
      });

      expect(reindexed.document.version).toBe(2);
      expect(reindexed.chunksAdded).toBeGreaterThan(0);

      // AI retrieval must cite the new version (v2) with updated content
      const retrieval = await ragService.queryKnowledge({
        query: 'hostel curfew biometric entry timing',
        limit: 5,
        userProfile: studentBob,
      });

      const chunk = retrieval.chunks.find((c) => c.documentId === doc.id);
      expect(chunk).toBeDefined();
      expect(chunk.chunkText).toContain('10:30 PM');
      expect(chunk.documentVersion).toBe(2);
    });
  });
});
