import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { embeddingService } from './ai/embedding.service.js';
import { getCategoryByCode } from '../ml/taxonomy.js';
import { inMemoryTickets } from '../repositories/ticket.repository.js';
import { auditService, AUDIT_ACTIONS } from './audit.service.js';
import { logger } from '../utils/logger.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BENCHMARK_PATH = path.join(__dirname, '..', 'ml', 'data', 'faq_retrieval_benchmark.json');

function getDbClient() {
  return supabaseAdmin || supabaseClient;
}

// In-memory collections for testing and offline environments
export const inMemoryFaqs = [];
export const inMemoryFaqVotes = [];

// Initialize inMemoryFaqs with benchmark data
try {
  if (fs.existsSync(BENCHMARK_PATH)) {
    const raw = fs.readFileSync(BENCHMARK_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.faqs)) {
      parsed.faqs.forEach((f) => {
        const cat = getCategoryByCode(f.category_code);
        inMemoryFaqs.push({
          id: f.id,
          question: f.question,
          answer: f.answer,
          category_code: f.category_code,
          category_id: cat?.id || f.category_id || 'c1000000-0000-0000-0000-000000000002',
          department_id: cat?.defaultDepartmentCode || 'FIN',
          keywords: f.keywords || [],
          view_count: 12,
          helpful_count: 8,
          unhelpful_count: 0,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          version: 1,
          is_published: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      });
    }
  }
} catch (e) {
  logger.warn('Failed to initialize inMemoryFaqs from benchmark', { error: e.message });
}

export class FaqService {
  /**
   * Public FAQ listing with instant keyword search and category filtering
   * Strictly returns only PUBLISHED, PUBLIC information.
   */
  async getPublicFaqs({ search = '', categoryId = '', limit = 50, page = 1 } = {}) {
    const db = getDbClient();
    const queryTerm = (search || '').trim().toLowerCase();
    const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 50, 100));
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const offset = (parsedPage - 1) * parsedLimit;

    if (db && process.env.NODE_ENV !== 'test') {
      try {
        let dbQuery = db
          .from('faqs')
          .select(`
            id, question, answer, keywords, view_count, helpful_count, unhelpful_count,
            category_id, department_id, status, visibility, version, created_at, updated_at,
            category:categories(id, name, code)
          `, { count: 'exact' })
          .eq('status', 'PUBLISHED')
          .eq('visibility', 'PUBLIC')
          .eq('is_published', true);

        if (categoryId) {
          dbQuery = dbQuery.eq('category_id', categoryId);
        }

        if (queryTerm) {
          dbQuery = dbQuery.or(`question.ilike.%${queryTerm}%,answer.ilike.%${queryTerm}%`);
        }

        const { data, count, error } = await dbQuery
          .order('helpful_count', { ascending: false })
          .range(offset, offset + parsedLimit - 1);

        if (!error && Array.isArray(data)) {
          return {
            faqs: data,
            total: count || data.length,
            page: parsedPage,
            limit: parsedLimit,
            totalPages: Math.ceil((count || data.length) / parsedLimit),
          };
        }
      } catch (err) {
        logger.debug('Database error in getPublicFaqs, falling back to memory', { error: err.message });
      }
    }

    // Memory Fallback
    let filtered = inMemoryFaqs.filter(
      (f) => f.status === 'PUBLISHED' && f.visibility === 'PUBLIC' && f.is_published !== false
    );

    if (categoryId) {
      filtered = filtered.filter(
        (f) => f.category_id === categoryId || f.category_code === categoryId
      );
    }

    if (queryTerm) {
      filtered = filtered.filter((f) => {
        const inQuestion = f.question.toLowerCase().includes(queryTerm);
        const inAnswer = f.answer.toLowerCase().includes(queryTerm);
        const inKeywords = Array.isArray(f.keywords) && f.keywords.some((k) => k.toLowerCase().includes(queryTerm));
        return inQuestion || inAnswer || inKeywords;
      });
    }

    filtered.sort((a, b) => (b.helpful_count || 0) - (a.helpful_count || 0));
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + parsedLimit);

    return {
      faqs: paginated,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit),
    };
  }

  /**
   * Get single FAQ by ID and increment view count
   */
  async getFaqById(faqId) {
    if (!faqId) throw new Error('FAQ ID is required');

    const db = getDbClient();
    if (db && process.env.NODE_ENV !== 'test') {
      try {
        const { data, error } = await db
          .from('faqs')
          .select('*, category:categories(id, name, code)')
          .eq('id', faqId)
          .maybeSingle();

        if (!error && data) {
          // Increment view count in background
          db.from('faqs').update({ view_count: (data.view_count || 0) + 1 }).eq('id', faqId).then();
          return data;
        }
      } catch (e) {
        logger.debug('Database fetch failed for single FAQ', { error: e.message });
      }
    }

    const faq = inMemoryFaqs.find((f) => f.id === faqId);
    if (!faq) {
      throw new Error(`FAQ not found with ID ${faqId}`);
    }
    faq.view_count = (faq.view_count || 0) + 1;
    return faq;
  }

  /**
   * Helpful / Unhelpful voting with abuse prevention
   * Ensures 1 vote per authenticated user, or 1 vote per IP address within 24h for guests.
   */
  async voteFaq({ faqId, isHelpful, userId = null, ipAddress = '127.0.0.1' }) {
    if (!faqId) throw new Error('FAQ ID is required for feedback');

    // 1. Abuse prevention check
    const existingVote = inMemoryFaqVotes.find((v) => {
      if (v.faq_id !== faqId) return false;
      if (userId && v.user_id === userId) return true;
      if (!userId && v.ip_address === ipAddress) {
        // Check 24-hour window
        const diffMs = Date.now() - new Date(v.created_at).getTime();
        return diffMs < 24 * 60 * 60 * 1000;
      }
      return false;
    });

    if (existingVote) {
      const err = new Error(
        userId
          ? 'DUPLICATE_VOTE: You have already submitted feedback for this FAQ.'
          : 'DUPLICATE_VOTE: Feedback has already been recorded from your network connection.'
      );
      err.statusCode = 429;
      err.code = 'DUPLICATE_VOTE';
      throw err;
    }

    // 2. Record vote
    const voteRecord = {
      id: `vote-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      faq_id: faqId,
      user_id: userId || null,
      ip_address: ipAddress,
      is_helpful: Boolean(isHelpful),
      created_at: new Date().toISOString(),
    };

    inMemoryFaqVotes.push(voteRecord);

    // 3. Update FAQ vote counters
    const faq = inMemoryFaqs.find((f) => f.id === faqId);
    if (faq) {
      if (isHelpful) {
        faq.helpful_count = (faq.helpful_count || 0) + 1;
      } else {
        faq.unhelpful_count = (faq.unhelpful_count || 0) + 1;
      }
    }

    const db = getDbClient();
    if (db && process.env.NODE_ENV !== 'test') {
      try {
        await db.from('faq_votes').insert(voteRecord);
        const col = isHelpful ? 'helpful_count' : 'unhelpful_count';
        await db.rpc('increment_faq_vote', { p_faq_id: faqId, p_is_helpful: isHelpful });
      } catch (err) {
        logger.debug('DB insert for faq_votes failed, saved in memory', { error: err.message });
      }
    }

    return {
      success: true,
      faqId,
      helpfulCount: faq?.helpful_count || (isHelpful ? 1 : 0),
      unhelpfulCount: faq?.unhelpful_count || (!isHelpful ? 1 : 0),
      userVoted: isHelpful,
    };
  }

  /**
   * Staff submission of FAQ draft from a resolved ticket
   * Requires role: STAFF or SUPER_ADMIN
   */
  async submitDraftFromTicket({ ticketId, question, answer, categoryId, departmentId, keywords = [] }, staffProfile) {
    if (!staffProfile || (staffProfile.role !== 'STAFF' && staffProfile.role !== 'SUPER_ADMIN')) {
      const err = new Error('FORBIDDEN: Only department staff and administrators can submit FAQ drafts.');
      err.statusCode = 403;
      throw err;
    }

    if (!question || question.trim().length < 5) {
      const err = new Error('Question must be at least 5 characters long.');
      err.statusCode = 400;
      throw err;
    }

    if (!answer || answer.trim().length < 10) {
      const err = new Error('Answer must be at least 10 characters long.');
      err.statusCode = 400;
      throw err;
    }

    // Verify ticket if provided
    let ticket = null;
    if (ticketId) {
      if (inMemoryTickets instanceof Map) {
        ticket = inMemoryTickets.get(ticketId) || Array.from(inMemoryTickets.values()).find((t) => t.id === ticketId);
      } else if (Array.isArray(inMemoryTickets)) {
        ticket = inMemoryTickets.find((t) => t.id === ticketId);
      }
      if (ticket && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
        const err = new Error('FAQ drafts can only be created from RESOLVED or CLOSED tickets.');
        err.statusCode = 400;
        throw err;
      }
    }

    const newDraft = {
      id: `faq-draft-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      question: question.trim(),
      answer: answer.trim(),
      category_id: categoryId || ticket?.category_id || 'c1000000-0000-0000-0000-000000000002',
      department_id: departmentId || ticket?.assigned_department_id || staffProfile.department_id || null,
      keywords: Array.isArray(keywords) ? keywords : [],
      view_count: 0,
      helpful_count: 0,
      unhelpful_count: 0,
      status: 'DRAFT', // Always DRAFT until Super Admin approval
      visibility: 'PUBLIC',
      version: 1,
      is_published: false,
      source_ticket_id: ticketId || null,
      created_by: staffProfile.id,
      approved_by: null,
      approved_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    inMemoryFaqs.push(newDraft);

    const db = getDbClient();
    if (db && process.env.NODE_ENV !== 'test') {
      try {
        await db.from('faqs').insert(newDraft);
      } catch (e) {
        logger.debug('Failed to insert draft FAQ to DB', { error: e.message });
      }
    }

    return newDraft;
  }

  /**
   * Super Admin & Staff FAQ management list
   * Allows filtering by status (DRAFT, PUBLISHED, RETIRED) and department.
   */
  async listFaqsAdmin({ status = '', departmentId = '', search = '' } = {}, userProfile) {
    if (!userProfile || (userProfile.role !== 'STAFF' && userProfile.role !== 'SUPER_ADMIN')) {
      const err = new Error('FORBIDDEN: Administrative access required.');
      err.statusCode = 403;
      throw err;
    }

    let items = [...inMemoryFaqs];

    if (userProfile.role === 'STAFF') {
      // Staff can see all PUBLISHED FAQs + DRAFTs belonging to their department
      items = items.filter(
        (f) => f.status === 'PUBLISHED' || !f.department_id || f.department_id === userProfile.department_id
      );
    }

    if (status) {
      items = items.filter((f) => f.status === status);
    }

    if (departmentId) {
      items = items.filter((f) => f.department_id === departmentId);
    }

    if (search) {
      const s = search.toLowerCase();
      items = items.filter(
        (f) => f.question.toLowerCase().includes(s) || f.answer.toLowerCase().includes(s)
      );
    }

    items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return items;
  }

  /**
   * Super Admin Review, Approval & Publication of FAQ
   * Generates pgvector cosine embedding so it is immediately searchable by AI.
   */
  async approveAndPublishFaq(faqId, adminProfile, updates = {}) {
    if (!adminProfile || (adminProfile.role !== 'SUPER_ADMIN' && !adminProfile.can_approve_documents)) {
      const err = new Error('FORBIDDEN: Only Super Admins or authorized document approvers can approve and publish FAQs.');
      err.statusCode = 403;
      throw err;
    }

    const faq = inMemoryFaqs.find((f) => f.id === faqId);
    if (!faq) {
      const err = new Error(`FAQ not found with ID ${faqId}`);
      err.statusCode = 404;
      throw err;
    }

    if (updates.question) faq.question = updates.question.trim();
    if (updates.answer) faq.answer = updates.answer.trim();
    if (updates.category_id) faq.category_id = updates.category_id;
    if (updates.department_id) faq.department_id = updates.department_id;
    if (Array.isArray(updates.keywords)) faq.keywords = updates.keywords;
    if (updates.visibility) faq.visibility = updates.visibility;

    faq.status = 'PUBLISHED';
    faq.is_published = true;
    faq.approved_by = adminProfile.id;
    faq.approved_at = new Date().toISOString();
    faq.updated_at = new Date().toISOString();

    // Generate fresh embedding
    try {
      faq.embedding = await embeddingService.generateEmbedding(`${faq.question} ${faq.answer}`);
    } catch (e) {
      logger.warn('Failed to generate embedding on FAQ publish', { error: e.message });
    }

    const db = getDbClient();
    if (db && process.env.NODE_ENV !== 'test') {
      try {
        await db.from('faqs').update({
          question: faq.question,
          answer: faq.answer,
          category_id: faq.category_id,
          department_id: faq.department_id,
          keywords: faq.keywords,
          visibility: faq.visibility,
          status: 'PUBLISHED',
          is_published: true,
          approved_by: adminProfile.id,
          approved_at: faq.approved_at,
          updated_at: faq.updated_at,
          embedding: faq.embedding,
        }).eq('id', faqId);
      } catch (err) {
        logger.debug('DB update failed for FAQ approval', { error: err.message });
      }
    }

    // Record centralized append-only audit event for knowledge approval
    await auditService.recordAuditEvent({
      actor: adminProfile.email || adminProfile.full_name,
      actorId: adminProfile.id,
      role: adminProfile.role,
      action: AUDIT_ACTIONS.KNOWLEDGE_APPROVED,
      entity: 'knowledge_document',
      entityId: faq.id,
      metadata: {
        faqId: faq.id,
        question: faq.question.slice(0, 100),
        categoryId: faq.category_id,
        departmentId: faq.department_id,
        approvedAt: faq.approved_at,
      },
    }).catch(() => {});

    return faq;
  }


  /**
   * Edit FAQ content and update embedding
   */
  async updateFaq(faqId, updates, adminProfile) {
    if (!adminProfile || (adminProfile.role !== 'SUPER_ADMIN' && !adminProfile.can_approve_documents)) {
      const err = new Error('FORBIDDEN: Insufficient permissions to edit FAQ.');
      err.statusCode = 403;
      throw err;
    }

    const faq = inMemoryFaqs.find((f) => f.id === faqId);
    if (!faq) {
      const err = new Error(`FAQ not found with ID ${faqId}`);
      err.statusCode = 404;
      throw err;
    }

    if (updates.question) faq.question = updates.question.trim();
    if (updates.answer) faq.answer = updates.answer.trim();
    if (updates.category_id) faq.category_id = updates.category_id;
    if (updates.department_id) faq.department_id = updates.department_id;
    if (Array.isArray(updates.keywords)) faq.keywords = updates.keywords;
    if (updates.visibility) faq.visibility = updates.visibility;

    faq.version = (faq.version || 1) + 1;
    faq.updated_at = new Date().toISOString();

    // Regenerate embedding for updated content
    try {
      faq.embedding = await embeddingService.generateEmbedding(`${faq.question} ${faq.answer}`);
    } catch (e) {
      logger.warn('Failed to update embedding on FAQ edit', { error: e.message });
    }

    return faq;
  }

  /**
   * Retire FAQ: Immediately invalidates it from public display and AI search pipeline
   */
  async retireFaq(faqId, adminProfile) {
    if (!adminProfile || (adminProfile.role !== 'SUPER_ADMIN' && !adminProfile.can_approve_documents)) {
      const err = new Error('FORBIDDEN: Only Super Admins or authorized document approvers can retire FAQs.');
      err.statusCode = 403;
      throw err;
    }

    const faq = inMemoryFaqs.find((f) => f.id === faqId);
    if (!faq) {
      const err = new Error(`FAQ not found with ID ${faqId}`);
      err.statusCode = 404;
      throw err;
    }

    faq.status = 'RETIRED';
    faq.is_published = false;
    faq.retired_by = adminProfile.id;
    faq.retired_at = new Date().toISOString();
    faq.updated_at = new Date().toISOString();

    const db = getDbClient();
    if (db && process.env.NODE_ENV !== 'test') {
      try {
        await db.from('faqs').update({
          status: 'RETIRED',
          is_published: false,
          retired_by: adminProfile.id,
          retired_at: faq.retired_at,
          updated_at: faq.updated_at,
        }).eq('id', faqId);
      } catch (err) {
        logger.debug('DB update failed for FAQ retirement', { error: err.message });
      }
    }

    return faq;
  }
}

export const faqService = new FaqService();
