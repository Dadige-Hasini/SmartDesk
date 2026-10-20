import { ticketRepository, inMemoryTickets } from '../repositories/ticket.repository.js';
import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

function getDbClient() {
  return supabaseAdmin || supabaseClient;
}

const PRIORITY_ORDER = {
  Urgent: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

export class StaffService {
  /**
   * Get departmental ticket queue with priority- and age-based sorting and filters
   */
  async getDepartmentQueue(query = {}, staffProfile) {
    const isSuperAdmin = staffProfile.role === 'SUPER_ADMIN';
    const deptId = isSuperAdmin && query.departmentId ? query.departmentId : staffProfile.department_id;

    if (!deptId && !isSuperAdmin) {
      throw new Error('Staff profile is not associated with any college department.');
    }

    const {
      status,
      category,
      priority,
      assignee,
      dateFrom,
      dateTo,
      search,
      sortBy = 'priority', // 'priority' | 'created_at' | 'sla_due_at' | 'status'
      sortOrder = 'desc', // 'asc' | 'desc'
      page = 1,
      limit = 20,
    } = query;

    const db = getDbClient();
    let tickets = [];

    if (db) {
      try {
        let q = db
          .from('tickets')
          .select(`
            *,
            category:categories(id, name, code),
            creator:profiles!created_by(id, full_name, email, role, roll_number),
            assignee:profiles!assigned_to(id, full_name, email, designation),
            student_department:departments!student_department_id(id, name, code),
            assigned_department:departments!assigned_department_id(id, name, code),
            ratings(*)
          `);

        if (deptId) {
          q = q.eq('assigned_department_id', deptId);
        }

        // Apply filters
        if (status) {
          if (Array.isArray(status)) q = q.in('status', status);
          else q = q.eq('status', status);
        }
        if (category) q = q.eq('category_id', category);
        if (priority) q = q.eq('priority', priority);
        if (assignee === 'unassigned') {
          q = q.is('assigned_to', null);
        } else if (assignee === 'me') {
          q = q.eq('assigned_to', staffProfile.id);
        } else if (assignee) {
          q = q.eq('assigned_to', assignee);
        }
        if (dateFrom) q = q.gte('created_at', dateFrom);
        if (dateTo) q = q.lte('created_at', dateTo);

        const { data, error } = await q;
        if (!error && data && data.length > 0) {
          tickets = data;
        }
      } catch (err) {
        logger.warn('Failed to fetch staff queue from database, falling back', { error: err.message });
      }
    }

    // Fallback to in-memory store if database yielded zero or is unmigrated
    if (tickets.length === 0 && inMemoryTickets.size > 0) {
      tickets = Array.from(inMemoryTickets.values());
      if (deptId) {
        tickets = tickets.filter((t) => t.assigned_department_id === deptId);
      }
      if (status) tickets = tickets.filter((t) => t.status === status);
      if (category) tickets = tickets.filter((t) => t.category_id === category);
      if (priority) tickets = tickets.filter((t) => t.priority === priority);
      if (assignee === 'unassigned') tickets = tickets.filter((t) => !t.assigned_to);
      else if (assignee === 'me') tickets = tickets.filter((t) => t.assigned_to === staffProfile.id);
      else if (assignee) tickets = tickets.filter((t) => t.assigned_to === assignee);
    }

    // Keyword search
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      tickets = tickets.filter(
        (t) =>
          t.ticket_number?.toLowerCase().includes(term) ||
          t.title?.toLowerCase().includes(term) ||
          t.description?.toLowerCase().includes(term) ||
          t.creator?.full_name?.toLowerCase().includes(term) ||
          t.creator?.roll_number?.toLowerCase().includes(term)
      );
    }

    // Priority- and age-based sorting
    tickets.sort((a, b) => {
      if (sortBy === 'priority') {
        const orderA = PRIORITY_ORDER[a.priority] || 0;
        const orderB = PRIORITY_ORDER[b.priority] || 0;
        if (orderA !== orderB) {
          return sortOrder === 'asc' ? orderA - orderB : orderB - orderA;
        }
        // Sub-sort by age (oldest first for urgent attention)
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }

      if (sortBy === 'created_at' || sortBy === 'age') {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }

      if (sortBy === 'sla_due_at') {
        const dueA = a.sla_due_at ? new Date(a.sla_due_at).getTime() : Infinity;
        const dueB = b.sla_due_at ? new Date(b.sla_due_at).getTime() : Infinity;
        return sortOrder === 'asc' ? dueA - dueB : dueB - dueA;
      }

      return 0;
    });

    const total = tickets.length;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;
    const paginated = tickets.slice(offset, offset + limitNum);

    return {
      tickets: paginated,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  /**
   * Get departmental performance analytics and chart time series
   */
  async getDepartmentStats(staffProfile, query = {}) {
    const isSuperAdmin = staffProfile.role === 'SUPER_ADMIN';
    const deptId = isSuperAdmin && query.departmentId ? query.departmentId : staffProfile.department_id;

    const db = getDbClient();
    let tickets = [];
    let comments = [];

    if (db) {
      try {
        let q = db
          .from('tickets')
          .select(`
            *,
            category:categories(id, name, code),
            ratings(*)
          `);

        if (deptId) q = q.eq('assigned_department_id', deptId);
        const { data, error } = await q;
        if (!error && data && data.length > 0) tickets = data;

        // Fetch comments for response time calculation
        const { data: commentsData } = await db
          .from('ticket_comments')
          .select('id, ticket_id, author_id, is_internal, created_at, author:profiles!author_id(role)')
          .order('created_at', { ascending: true });
        if (commentsData) comments = commentsData;
      } catch (err) {
        logger.warn('Failed to query department stats from database', { error: err.message });
      }
    }

    if (tickets.length === 0 && inMemoryTickets.size > 0) {
      tickets = Array.from(inMemoryTickets.values());
      if (deptId) {
        tickets = tickets.filter((t) => t.assigned_department_id === deptId);
      }
    }

    const totalTickets = tickets.length;
    let openTickets = 0;
    let resolvedTickets = 0;
    let unassignedTickets = 0;
    let urgentTickets = 0;
    let overdueTickets = 0;
    let totalResolutionHours = 0;
    let resolvedWithDurationCount = 0;
    let compliantCount = 0;
    let totalRatings = 0;
    let ratedCount = 0;

    const now = Date.now();
    const categoryCounts = {};
    const statusCounts = {
      OPEN: 0,
      IN_PROGRESS: 0,
      AWAITING_INFO: 0,
      RESOLVED: 0,
      CLOSED: 0,
      REJECTED: 0,
    };

    // Calculate response time from first public staff comment
    let totalResponseHours = 0;
    let respondedTicketsCount = 0;

    for (const t of tickets) {
      // Category Breakdown
      const catName = t.category?.name || 'General Inquiries';
      categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;

      // Status Breakdown
      if (statusCounts[t.status] !== undefined) {
        statusCounts[t.status] += 1;
      }

      if (['OPEN', 'IN_PROGRESS', 'AWAITING_INFO'].includes(t.status)) {
        openTickets += 1;
        if (!t.assigned_to) unassignedTickets += 1;
        if (t.priority === 'Urgent') urgentTickets += 1;

        // Check if overdue
        if (t.sla_due_at && new Date(t.sla_due_at).getTime() < now) {
          overdueTickets += 1;
        }
      } else if (['RESOLVED', 'CLOSED'].includes(t.status)) {
        resolvedTickets += 1;
        resolvedWithDurationCount += 1;

        // SLA Compliance
        if (t.sla_due_at) {
          const resTime = new Date(t.resolved_at || t.closed_at || t.updated_at).getTime();
          const dueTime = new Date(t.sla_due_at).getTime();
          if (resTime <= dueTime) compliantCount += 1;
        } else {
          compliantCount += 1;
        }

        // Resolution Time
        const cTime = new Date(t.created_at).getTime();
        const rTime = new Date(t.resolved_at || t.closed_at || t.updated_at).getTime();
        const dHours = (rTime - cTime) / 3600000;
        if (dHours > 0) totalResolutionHours += dHours;
      }

      // Ratings
      const r = t.ratings?.[0] || t.rating;
      if (r?.rating) {
        totalRatings += r.rating;
        ratedCount += 1;
      }

      // Response Time Calculation: first staff comment
      const firstStaffComment = comments.find(
        (c) => c.ticket_id === t.id && (c.author?.role === 'STAFF' || c.author?.role === 'SUPER_ADMIN')
      );
      if (firstStaffComment) {
        const cTime = new Date(t.created_at).getTime();
        const respTime = new Date(firstStaffComment.created_at).getTime();
        const rHours = (respTime - cTime) / 3600000;
        if (rHours >= 0) {
          totalResponseHours += rHours;
          respondedTicketsCount += 1;
        }
      }
    }

    // Averages and KPI Metrics
    const slaComplianceRate =
      resolvedWithDurationCount > 0
        ? parseFloat(((compliantCount / resolvedWithDurationCount) * 100).toFixed(1))
        : 100;

    let averageResolutionHours = null;
    let averageResolutionTime = 'N/A';
    if (resolvedWithDurationCount > 0) {
      const avg = totalResolutionHours / resolvedWithDurationCount;
      averageResolutionHours = parseFloat(avg.toFixed(1));
      if (avg < 1) averageResolutionTime = `${Math.round(avg * 60)} mins`;
      else if (avg < 24) averageResolutionTime = `${avg.toFixed(1)} hrs`;
      else averageResolutionTime = `${(avg / 24).toFixed(1)} days`;
    }

    let averageResponseHours = null;
    let averageResponseTime = 'N/A';
    if (respondedTicketsCount > 0) {
      const avg = totalResponseHours / respondedTicketsCount;
      averageResponseHours = parseFloat(avg.toFixed(1));
      if (avg < 1) averageResponseTime = `${Math.round(avg * 60)} mins`;
      else averageResponseTime = `${avg.toFixed(1)} hrs`;
    }

    const averageSatisfaction =
      ratedCount > 0 ? parseFloat((totalRatings / ratedCount).toFixed(1)) : null;

    // Time Series Generation: Past 14 Days for Tickets-Over-Time Line Chart
    const ticketsOverTime = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600000);
      const dateStr = d.toISOString().slice(0, 10);
      const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const createdCount = tickets.filter(
        (t) => t.created_at && t.created_at.slice(0, 10) === dateStr
      ).length;

      const resolvedCount = tickets.filter(
        (t) =>
          ['RESOLVED', 'CLOSED'].includes(t.status) &&
          (t.resolved_at || t.updated_at || '').slice(0, 10) === dateStr
      ).length;

      ticketsOverTime.push({
        date: dateStr,
        label: monthDay,
        created: createdCount,
        resolved: resolvedCount,
      });
    }

    // Category Distribution Pie Chart Data
    const categoryDistribution = Object.entries(categoryCounts).map(([name, count]) => ({
      name,
      count,
    }));

    // Status Breakdown Donut Chart Data
    const statusBreakdown = [
      { status: 'OPEN', name: 'Open', count: statusCounts.OPEN, color: '#3b82f6' },
      { status: 'IN_PROGRESS', name: 'In Progress', count: statusCounts.IN_PROGRESS, color: '#f59e0b' },
      { status: 'AWAITING_INFO', name: 'Awaiting Info', count: statusCounts.AWAITING_INFO, color: '#8b5cf6' },
      { status: 'RESOLVED', name: 'Resolved', count: statusCounts.RESOLVED, color: '#10b981' },
      { status: 'CLOSED', name: 'Closed', count: statusCounts.CLOSED, color: '#6b7280' },
      { status: 'REJECTED', name: 'Rejected', count: statusCounts.REJECTED, color: '#ef4444' },
    ].filter((s) => s.count > 0);

    return {
      overview: {
        totalTickets,
        openTickets,
        resolvedTickets,
        unassignedTickets,
        urgentTickets,
        overdueTickets,
        slaComplianceRate,
        averageResponseTime,
        averageResponseHours,
        averageResolutionTime,
        averageResolutionHours,
        averageSatisfaction,
      },
      charts: {
        ticketsOverTime,
        categoryDistribution,
        statusBreakdown,
      },
    };
  }
}

export const staffService = new StaffService();
