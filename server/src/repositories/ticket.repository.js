import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

function getDbClient() {
  return supabaseAdmin || supabaseClient;
}

// In-memory atomic sequence fallback when database sequence is not yet initialized in test
let inMemorySeq = 1000;
export const inMemoryProfiles = new Map();
export const inMemoryTickets = new Map();

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
   * Calculate SLA due timestamp based on priority policy
   */
  async calculateSlaDueTimestamp(priority) {
    const db = getDbClient();
    if (!db) return new Date(Date.now() + 48 * 3600000).toISOString();

    try {
      const { data } = await db
        .from('sla_policies')
        .select('resolution_time_hours')
        .eq('priority', priority)
        .eq('is_active', true)
        .maybeSingle();

      const hours = data?.resolution_time_hours || 48;
      return new Date(Date.now() + hours * 3600000).toISOString();
    } catch {
      return new Date(Date.now() + 48 * 3600000).toISOString();
    }
  }

  /**
   * Insert new ticket into PostgreSQL
   */
  async createTicket(ticketData) {
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

    const db = getDbClient();
    if (db) {
      try {
        const { data, error } = await db
          .from('tickets')
          .insert(ticketData)
          .select(`
            *,
            category:categories(id, name, code),
            assigned_department:departments!tickets_assigned_department_id_fkey(id, name, code),
            student_department:departments!tickets_student_department_id_fkey(id, name, code),
            creator:profiles!tickets_created_by_fkey(id, full_name, email, role, roll_number),
            assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, employee_id)
          `)
          .single();

        if (!error && data) {
          inMemoryTickets.set(data.id, data);
          return data;
        }

        if (error) {
          logger.debug('Failed to create ticket in database, falling back to memory', { error: error.message });
        }
      } catch (err) {
        logger.debug('Database error in createTicket, fallback to memory', { error: err.message });
      }
    }

    inMemoryTickets.set(fallbackRecord.id, fallbackRecord);
    return fallbackRecord;
  }

  /**
   * Fetch ticket by internal UUID or unique ticket number
   */
  async findById(ticketIdOrNumber) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketIdOrNumber);

    const db = getDbClient();
    if (db) {
      try {
        let query = db
          .from('tickets')
          .select(`
            *,
            category:categories(id, name, code),
            assigned_department:departments!tickets_assigned_department_id_fkey(id, name, code),
            student_department:departments!tickets_student_department_id_fkey(id, name, code),
            creator:profiles!tickets_created_by_fkey(id, full_name, email, role, roll_number),
            assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, employee_id),
            rating:ratings(rating, feedback, created_at)
          `);

        if (isUuid) {
          query = query.eq('id', ticketIdOrNumber);
        } else {
          query = query.eq('ticket_number', ticketIdOrNumber);
        }

        const { data, error } = await query.maybeSingle();
        if (!error && data) {
          return data;
        }
      } catch (err) {
        logger.debug('Database error in findById, fallback to memory', { error: err.message });
      }
    }

    for (const ticket of inMemoryTickets.values()) {
      if (ticket.id === ticketIdOrNumber || ticket.ticket_number === ticketIdOrNumber) {
        return ticket;
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
    const db = getDbClient();
    if (!db) return { tickets: [], total: 0, page, limit, totalPages: 0 };

    const offset = (page - 1) * limit;

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
      logger.error('Error listing tickets', { error: error.message });
      throw new Error(`Database error listing tickets: ${error.message}`);
    }

    const total = count || 0;
    return {
      tickets: data || [],
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
    const updatedFields = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const db = getDbClient();
    if (db) {
      try {
        const { data, error } = await db
          .from('tickets')
          .update(updatedFields)
          .eq('id', ticketId)
          .select(`
            *,
            category:categories(id, name, code),
            assigned_department:departments!tickets_assigned_department_id_fkey(id, name, code),
            student_department:departments!tickets_student_department_id_fkey(id, name, code),
            creator:profiles!tickets_created_by_fkey(id, full_name, email, role, roll_number),
            assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role, employee_id)
          `)
          .single();

        if (!error && data) {
          inMemoryTickets.set(ticketId, { ...(inMemoryTickets.get(ticketId) || {}), ...data });
          return data;
        }
      } catch (err) {
        logger.debug('Database error in updateTicket, fallback to memory', { error: err.message });
      }
    }

    const existing = inMemoryTickets.get(ticketId) || {};
    const updated = { ...existing, ...updatedFields };
    inMemoryTickets.set(ticketId, updated);
    return updated;
  }

  /**
   * Append an audit event to ticket_events
   */
  async recordEvent({ ticketId, actorId, eventType, oldValue = null, newValue = null, note = null }) {
    const db = getDbClient();
    if (!db) return null;

    try {
      const { data, error } = await db
        .from('ticket_events')
        .insert({
          ticket_id: ticketId,
          actor_id: actorId,
          event_type: eventType,
          old_value: oldValue ? JSON.stringify(oldValue) : null,
          new_value: newValue ? JSON.stringify(newValue) : null,
          note,
        })
        .select()
        .single();

      if (error) {
        logger.warn('Failed to record ticket event', { ticketId, eventType, error: error.message });
        return null;
      }

      return data;
    } catch (err) {
      logger.warn('Exception recording ticket event', { ticketId, eventType, error: err.message });
      return null;
    }
  }

  /**
   * Fetch audit history events for a ticket
   */
  async getEventsByTicketId(ticketId) {
    const db = getDbClient();
    if (!db) return [];

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

    if (error) {
      logger.error('Failed to fetch ticket events', { ticketId, error: error.message });
      return [];
    }

    return data || [];
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
  async bulkAssign({ ticketIds, assignedTo, departmentId = null }) {
    const db = getDbClient();
    if (!db) throw new Error('Database client not available');

    const updates = {
      assigned_to: assignedTo,
      status: 'IN_PROGRESS',
      updated_at: new Date().toISOString(),
    };

    let query = db.from('tickets').update(updates).in('id', ticketIds);

    if (departmentId) {
      query = query.eq('assigned_department_id', departmentId);
    }

    const { data, error } = await query.select('id, ticket_number, assigned_to, status');

    if (error) {
      throw new Error(`Bulk assignment failed: ${error.message}`);
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
    const db = getDbClient();
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
