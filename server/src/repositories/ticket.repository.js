import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { slaService } from '../services/sla.service.js';

function getDbClient() {
  if (process.env.NODE_ENV === 'test') return null;
  return supabaseAdmin || supabaseClient;
}

// In-memory atomic sequence fallback when database sequence is not yet initialized in test
let inMemorySeq = 1000;
export const inMemoryProfiles = new Map();
export const inMemoryTickets = new Map();
export const inMemoryEvents = new Map();

// Canonical list of PostgreSQL public.tickets table columns
export const VALID_TICKET_COLUMNS = new Set([
  'id',
  'demo_id',
  'ticket_number',
  'title',
  'description',
  'category_id',
  'priority',
  'status',
  'created_by',
  'assigned_to',
  'student_department_id',
  'assigned_department_id',
  'tags',
  'is_confidential',
  'is_overdue',
  'sla_breached_at',
  'resolution_summary',
  'rejection_reason',
  'reopened_count',
  'last_reopened_at',
  'resolved_at',
  'closed_at',
  'sla_due_at',
  'created_at',
  'updated_at',
]);

export const EXTENDED_CERT_STATUSES = new Set([
  'UNDER_REVIEW',
  'DOCUMENT_VERIFICATION',
  'READY_FOR_COLLECTION',
  'ISSUED',
]);

export function restoreExtendedStatus(ticket) {
  if (!ticket) return ticket;
  if (Array.isArray(ticket.tags)) {
    const certTag = ticket.tags.find((t) => typeof t === 'string' && t.startsWith('CERT_STATUS:'));
    if (certTag) {
      const extStatus = certTag.replace('CERT_STATUS:', '');
      if (EXTENDED_CERT_STATUSES.has(extStatus)) {
        ticket.status = extStatus;
      }
    }
  }
  return ticket;
}

export function generateFallbackTicketNumber() {
  inMemorySeq += 1;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `TKT-${today}-${String(inMemorySeq).padStart(4, '0')}`;
}

export class TicketRepository {
  /**
   * Find default routing rule for a given category
   */
  async findRoutingRuleByCategoryId(categoryId) {
    const db = getDbClient();
    if (!db) return null;

    try {
      const { data, error } = await db
        .from('category_routing_rules')
        .select('default_department_id, default_priority')
        .eq('category_id', categoryId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        logger.warn('Failed to query routing rule', { categoryId, error: error.message });
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Calculate SLA deadlines using active demonstration SLA policy (sla_policies.json)
   */
  async calculateSlaDeadlines(priority) {
    return slaService.calculateDeadlines(priority);
  }

  /**
   * Calculate SLA due timestamp based on priority policy
   */
  async calculateSlaDueTimestamp(priority) {
    const deadlines = slaService.calculateDeadlines(priority);
    return deadlines.resolution_due_at;
  }

  /**
   * Insert new ticket into PostgreSQL
   */
  async createTicket(ticketData) {
    const isTest = process.env.NODE_ENV === 'test';
    const db = isTest ? null : getDbClient();
    if (db) {
      try {
        // Whitelist only valid PostgreSQL public.tickets table columns
        const insertPayload = {};
        for (const [key, value] of Object.entries(ticketData)) {
          if (VALID_TICKET_COLUMNS.has(key) && value !== undefined) {
            insertPayload[key] = value;
          }
        }

        const { data, error } = await db
          .from('tickets')
          .insert(insertPayload)
          .select(`
            *,
            category:categories(id, name, code),
            assigned_department:departments!tickets_assigned_department_id_fkey(id, name, code),
            student_department:departments!tickets_student_department_id_fkey(id, name, code),
            creator:profiles!tickets_created_by_fkey(id, full_name, email, role, roll_number, phone_number, year_of_study),
            assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, employee_id)
          `)
          .single();

        if (error) {
          logger.warn('Failed to create ticket in database, falling back to memory store', { error: error.message, code: error.code });
        } else if (data) {
          inMemoryTickets.set(data.id, data);
          return data;
        }
      } catch (err) {
        logger.warn('Database error in createTicket, falling back to memory store', { error: err.message });
      }
    }

    // Offline / unit-test fallback when db client is not initialized or unreachable
    if (!ticketData.ticket_number) {
      ticketData.ticket_number = generateFallbackTicketNumber();
    }

    const fallbackRecord = {
      id: ticketData.id || `tkt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      ...ticketData,
      reopened_count: ticketData.reopened_count || 0,
      tags: ticketData.tags || [],
      is_confidential: Boolean(ticketData.is_confidential),
      created_at: ticketData.created_at || new Date().toISOString(),
      updated_at: ticketData.updated_at || new Date().toISOString(),
    };

    inMemoryTickets.set(fallbackRecord.id, fallbackRecord);
    return fallbackRecord;
  }

  /**
   * Fetch ticket by internal UUID or unique ticket number
   */
  async findById(ticketIdOrNumber) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketIdOrNumber);

    const isTest = process.env.NODE_ENV === 'test';
    const db = isTest ? null : getDbClient();
    if (db) {
      try {
        let query = db
          .from('tickets')
          .select(`
            *,
            category:categories(id, name, code),
            assigned_department:departments!tickets_assigned_department_id_fkey(id, name, code),
            student_department:departments!tickets_student_department_id_fkey(id, name, code),
            creator:profiles!tickets_created_by_fkey(id, full_name, email, role, roll_number, phone_number, year_of_study),
            assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, employee_id),
            rating:ratings(rating, feedback, created_at)
          `);

        if (isUuid) {
          query = query.eq('id', ticketIdOrNumber);
        } else {
          query = query.or(`ticket_number.eq.${ticketIdOrNumber},demo_id.eq.${ticketIdOrNumber}`);
        }

        const { data, error } = await query.maybeSingle();
        if (!error && data) {
          return restoreExtendedStatus(data);
        }
      } catch (err) {
        logger.debug('Database error in findById, fallback to memory', { error: err.message });
      }
    }

    for (const ticket of inMemoryTickets.values()) {
      if (
        ticket.id === ticketIdOrNumber ||
        ticket.ticket_number === ticketIdOrNumber ||
        ticket.demo_id === ticketIdOrNumber
      ) {
        return restoreExtendedStatus(ticket);
      }
    }

    return null;
  }

  /**
   * List tickets with filtering, search, sorting, and pagination
   */
  async listTickets({
    page = 1,
    limit = 10,
    search,
    status,
    priority,
    categoryId,
    departmentId,
    creatorId,
    sortBy = 'created_at',
    sortOrder = 'desc',
    createdAfter,
    createdBefore,
    excludeConfidential = false,
  }) {
    const offset = (page - 1) * limit;

    const db = getDbClient();
    if (!db) {
      return this._listInMemoryTickets({ offset, limit, page, creatorId, departmentId, excludeConfidential, status, priority, categoryId, search });
    }

    let query = db
      .from('tickets')
      .select(`
        *,
        category:categories(id, name, code),
        assigned_department:departments!tickets_assigned_department_id_fkey(id, name, code),
        student_department:departments!tickets_student_department_id_fkey(id, name, code),
        creator:profiles!tickets_created_by_fkey(id, full_name, email, role, roll_number),
        assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, employee_id)
      `, { count: 'exact' });

    // Scoping & security filters
    if (creatorId) {
      query = query.eq('created_by', creatorId);
    }
    if (departmentId) {
      query = query.eq('assigned_department_id', departmentId);
    }
    if (excludeConfidential) {
      query = query.eq('is_confidential', false);
    }

    // Parametric filters
    if (status) {
      const statuses = status.split(',').map((s) => s.trim().toUpperCase());
      query = query.in('status', statuses);
    }
    if (priority) {
      const priorities = priority.split(',').map((p) => p.trim());
      query = query.in('priority', priorities);
    }
    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }
    if (createdAfter) {
      query = query.gte('created_at', createdAfter);
    }
    if (createdBefore) {
      query = query.lte('created_at', createdBefore);
    }

    // Free text search over ticket_number, title, description
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`ticket_number.ilike.${term},title.ilike.${term},description.ilike.${term}`);
    }

    // Sorting & Pagination
    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      logger.warn('Database error listing tickets, falling back to memory store', { error: error.message });
      return this._listInMemoryTickets({ offset, limit, page, creatorId, departmentId, excludeConfidential, status, priority, categoryId, search });
    }

    const total = count || 0;
    return {
      tickets: (data || []).map(restoreExtendedStatus),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  _listInMemoryTickets({ offset, limit, page, creatorId, departmentId, excludeConfidential, status, priority, categoryId, search }) {
    let list = Array.from(inMemoryTickets.values());
    if (creatorId) {
      list = list.filter((t) => t.created_by === creatorId);
    }
    if (departmentId) {
      list = list.filter((t) => t.assigned_department_id === departmentId);
    }
    if (excludeConfidential) {
      list = list.filter((t) => !t.is_confidential);
    }
    if (status) {
      const statuses = status.split(',').map((s) => s.trim().toUpperCase());
      list = list.filter((t) => statuses.includes(t.status?.toUpperCase()));
    }
    if (priority) {
      const priorities = priority.split(',').map((p) => p.trim());
      list = list.filter((t) => priorities.includes(t.priority));
    }
    if (categoryId) {
      list = list.filter((t) => t.category_id === categoryId);
    }
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter((t) =>
        (t.ticket_number && t.ticket_number.toLowerCase().includes(term)) ||
        (t.title && t.title.toLowerCase().includes(term)) ||
        (t.description && t.description.toLowerCase().includes(term))
      );
    }
    const total = list.length;
    const paginated = list.slice(offset, offset + limit);
    return {
      tickets: paginated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update ticket fields by UUID
   */
  async updateTicket(ticketId, updates) {
    const desiredStatus = updates.status;
    let effectiveUpdates = { ...updates };

    if (desiredStatus && EXTENDED_CERT_STATUSES.has(desiredStatus)) {
      const dbBaseStatus = desiredStatus === 'ISSUED' ? 'RESOLVED' : 'IN_PROGRESS';
      let tags = Array.isArray(effectiveUpdates.tags) ? [...effectiveUpdates.tags] : null;
      if (!tags) {
        const existing = await this.findById(ticketId);
        tags = Array.isArray(existing?.tags) ? [...existing.tags] : [];
      }
      tags = tags.filter((t) => typeof t === 'string' && !t.startsWith('CERT_STATUS:'));
      tags.push(`CERT_STATUS:${desiredStatus}`);

      effectiveUpdates = {
        ...effectiveUpdates,
        status: dbBaseStatus,
        tags,
      };
    } else if (desiredStatus && !EXTENDED_CERT_STATUSES.has(desiredStatus)) {
      let tags = Array.isArray(effectiveUpdates.tags) ? [...effectiveUpdates.tags] : null;
      if (!tags) {
        const existing = await this.findById(ticketId);
        if (Array.isArray(existing?.tags) && existing.tags.some((t) => typeof t === 'string' && t.startsWith('CERT_STATUS:'))) {
          tags = existing.tags.filter((t) => typeof t === 'string' && !t.startsWith('CERT_STATUS:'));
          effectiveUpdates.tags = tags;
        }
      } else {
        effectiveUpdates.tags = tags.filter((t) => typeof t === 'string' && !t.startsWith('CERT_STATUS:'));
      }
    }

    const updatedFields = {
      ...effectiveUpdates,
      updated_at: new Date().toISOString(),
    };

    const isTest = process.env.NODE_ENV === 'test';
    const db = isTest ? null : getDbClient();
    if (db) {
      try {
        const updatePayload = {};
        for (const [key, value] of Object.entries(updatedFields)) {
          if (VALID_TICKET_COLUMNS.has(key) && value !== undefined) {
            updatePayload[key] = value;
          }
        }

        const { data, error } = await db
          .from('tickets')
          .update(updatePayload)
          .eq('id', ticketId)
          .select(`
            *,
            category:categories(id, name, code),
            assigned_department:departments!tickets_assigned_department_id_fkey(id, name, code),
            student_department:departments!tickets_student_department_id_fkey(id, name, code),
            creator:profiles!tickets_created_by_fkey(id, full_name, email, role, roll_number, phone_number, year_of_study),
            assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, employee_id)
          `)
          .single();

        if (error) {
          logger.warn('Failed to update ticket in database, falling back to memory store', { ticketId, error: error.message });
        } else if (data) {
          if (desiredStatus && EXTENDED_CERT_STATUSES.has(desiredStatus)) {
            data.status = desiredStatus;
          }
          inMemoryTickets.set(ticketId, { ...(inMemoryTickets.get(ticketId) || {}), ...data });
          return restoreExtendedStatus(data);
        }
      } catch (err) {
        logger.warn('Database error in updateTicket, falling back to memory store', { error: err.message });
      }
    }

    const existing = inMemoryTickets.get(ticketId) || {};
    const updated = { ...existing, ...updatedFields };
    if (desiredStatus && EXTENDED_CERT_STATUSES.has(desiredStatus)) {
      updated.status = desiredStatus;
    }
    inMemoryTickets.set(ticketId, updated);
    return restoreExtendedStatus(updated);
  }

  /**
   * Append an audit event to ticket_events
   */
  async recordEvent({ ticketId, actorId, eventType, oldValue = null, newValue = null, note = null }) {
    const memEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      ticket_id: ticketId,
      actor_id: actorId,
      event_type: eventType,
      old_value: oldValue,
      new_value: newValue,
      note,
      created_at: new Date().toISOString(),
    };
    const list = inMemoryEvents.get(ticketId) || [];
    list.push(memEvent);
    inMemoryEvents.set(ticketId, list);

    const isTest = process.env.NODE_ENV === 'test';
    const db = isTest ? null : getDbClient();
    if (!db) return memEvent;

    try {
      const { data, error } = await db
        .from('ticket_events')
        .insert({
          ticket_id: ticketId,
          actor_id: actorId,
          event_type: eventType,
          old_value: oldValue || null,
          new_value: newValue || null,
          note: note || null,
        })
        .select()
        .single();

      if (error) {
        logger.warn('Failed to record ticket event', { ticketId, eventType, error: error.message });
        return memEvent;
      }

      return data || memEvent;
    } catch (err) {
      logger.warn('Exception recording ticket event', { ticketId, eventType, error: err.message });
      return memEvent;
    }
  }

  /**
   * Fetch audit history events for a ticket
   */
  async getEventsByTicketId(ticketId) {
    const isTest = process.env.NODE_ENV === 'test';
    const db = isTest ? null : getDbClient();
    if (db) {
      try {
        const { data, error } = await db
          .from('ticket_events')
          .select(`
            id,
            ticket_id,
            event_type,
            old_value,
            new_value,
            note,
            created_at,
            actor:profiles!ticket_events_actor_id_fkey(id, full_name, email, role)
          `)
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true });

        if (!error && data && data.length > 0) {
          return data;
        }
      } catch (err) {
        logger.debug('Database error fetching ticket events, falling back to memory', { error: err.message });
      }
    }

    return inMemoryEvents.get(ticketId) || [];
  }

  /**
   * Submit 1-5 star rating
   */
  async createRating({ ticketId, studentId, rating, feedback }) {
    const db = getDbClient();
    if (!db) throw new Error('Database client not available');

    const { data, error } = await db
      .from('ratings')
      .upsert(
        {
          ticket_id: ticketId,
          student_id: studentId,
          rating,
          feedback: feedback || null,
        },
        { onConflict: 'ticket_id' }
      )
      .select()
      .single();

    if (error) {
      logger.error('Failed to submit ticket rating', { ticketId, error: error.message });
      throw new Error(`Database error saving rating: ${error.message}`);
    }

    return data;
  }

  /**
   * Bulk assign tickets
   */
  async bulkAssign({ ticketIds, assignedTo, departmentId = null, newDepartmentId = null }) {
    const db = getDbClient();
    if (!db) throw new Error('Database client not available');

    const updates = {
      assigned_to: assignedTo,
      status: 'IN_PROGRESS',
      updated_at: new Date().toISOString(),
    };
    if (newDepartmentId) {
      updates.assigned_department_id = newDepartmentId;
    }

    let query = db.from('tickets').update(updates).in('id', ticketIds);

    if (departmentId) {
      query = query.eq('assigned_department_id', departmentId);
    }

    const { data, error } = await query.select('id, ticket_number, assigned_to, status');

    if (error) {
      if (error.message && error.message.includes('tickets_assigned_to_fkey')) {
        const customErr = new Error(`Staff assignment failed: Target assignee profile (${assignedTo}) is not registered in the database.`);
        customErr.statusCode = 400;
        customErr.code = 'INVALID_ASSIGNEE_PROFILE';
        throw customErr;
      }
      const genericErr = new Error(`Bulk assignment failed: ${error.message}`);
      genericErr.statusCode = 400;
      throw genericErr;
    }

    return data || [];
  }

  /**
   * Bulk close tickets
   */
  async bulkClose({ ticketIds, resolutionSummary, departmentId = null }) {
    const db = getDbClient();
    if (!db) throw new Error('Database client not available');

    const now = new Date().toISOString();
    const updates = {
      status: 'CLOSED',
      closed_at: now,
      resolution_summary: resolutionSummary,
      updated_at: now,
    };

    let query = db.from('tickets').update(updates).in('id', ticketIds);

    if (departmentId) {
      query = query.eq('assigned_department_id', departmentId);
    }

    const { data, error } = await query.select('id, ticket_number, status, closed_at');

    if (error) {
      throw new Error(`Bulk close failed: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Register a profile in memory (for testing)
   */
  registerProfile(profile) {
    if (profile && profile.id) {
      inMemoryProfiles.set(profile.id, profile);
    }
  }

  /**
   * Find profile by ID (checks memory fallback then database)
   */
  async findProfileById(profileId) {
    if (inMemoryProfiles.has(profileId)) {
      return inMemoryProfiles.get(profileId);
    }
    const isTest = process.env.NODE_ENV === 'test';
    const db = isTest ? null : getDbClient();
    if (db) {
      try {
        const { data } = await db
          .from('profiles')
          .select('id, email, full_name, role, department_id, status')
          .eq('id', profileId)
          .maybeSingle();
        if (data) return data;
      } catch (err) {
        logger.debug('Error finding profile by id', { error: err.message });
      }
    }
    return null;
  }
}

export const ticketRepository = new TicketRepository();
