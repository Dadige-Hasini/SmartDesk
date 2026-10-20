import { ticketRepository } from '../repositories/ticket.repository.js';
import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { NotificationService } from './notification.service.js';
import { logger } from '../utils/logger.js';

export const ALLOWED_STATUS_TRANSITIONS = {
  OPEN: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['AWAITING_INFO', 'RESOLVED', 'REJECTED'],
  AWAITING_INFO: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'], // IN_PROGRESS allowed only via student reopen
  CLOSED: ['IN_PROGRESS'],            // IN_PROGRESS allowed only via student reopen
  REJECTED: ['IN_PROGRESS'],          // Only Super Admin can reopen a rejected ticket
};

export class TicketService {
  /**
   * Create a new ticket with automatic departmental routing
   */
  async createTicket(input, creatorProfile) {
    const studentDeptId = creatorProfile.department_id || null;
    let assignedDeptId = input.assignedDepartmentId;

    // Category-to-department routing resolution
    if (!assignedDeptId) {
      const rule = await ticketRepository.findRoutingRuleByCategoryId(input.categoryId);
      if (rule?.default_department_id) {
        assignedDeptId = rule.default_department_id;
      } else {
        // Fallback to first available active department
        const db = supabaseAdmin || supabaseClient;
        const { data: defaultDept } = await db
          .from('departments')
          .select('id')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (!defaultDept) {
          throw new Error('No active department found to route this ticket.');
        }
        assignedDeptId = defaultDept.id;
      }
    }

    // Calculate SLA due date
    const slaDueAt = await ticketRepository.calculateSlaDueTimestamp(input.priority || 'Medium');

    const ticketData = {
      title: input.title,
      description: input.description,
      category_id: input.categoryId,
      priority: input.priority || 'Medium',
      status: 'OPEN',
      created_by: creatorProfile.id,
      student_department_id: studentDeptId,
      assigned_department_id: assignedDeptId,
      tags: input.tags || [],
      is_confidential: Boolean(input.isConfidential),
      sla_due_at: slaDueAt,
      reopened_count: 0,
    };

    const newTicket = await ticketRepository.createTicket(ticketData);

    // Record CREATED event in audit log
    await ticketRepository.recordEvent({
      ticketId: newTicket.id,
      actorId: creatorProfile.id,
      eventType: 'CREATED',
      newValue: {
        ticketNumber: newTicket.ticket_number,
        title: newTicket.title,
        priority: newTicket.priority,
        status: newTicket.status,
        assignedDepartmentId: newTicket.assigned_department_id,
      },
      note: 'Ticket opened by user',
    });

    // Notify ticket creator of successful creation
    await NotificationService.notifyUser({
      recipientId: creatorProfile.id,
      recipientEmail: creatorProfile.email,
      recipientName: creatorProfile.full_name,
      ticket: newTicket,
      eventType: 'TICKET_CREATED',
      title: `Ticket Created: #${newTicket.ticket_number}`,
      message: `Your ticket "${newTicket.title}" has been submitted successfully.`,
      actorName: creatorProfile.full_name,
      dedupKeySuffix: 'created',
    });

    return newTicket;
  }

  /**
   * Retrieve ticket detail with strict authorization check
   */
  async getTicket(ticketIdOrNumber, profile) {
    const ticket = await ticketRepository.findById(ticketIdOrNumber);
    if (!ticket) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    this.enforceReadAccess(ticket, profile);

    // Attach full audit events history
    const events = await ticketRepository.getEventsByTicketId(ticket.id);

    return {
      ...ticket,
      events,
    };
  }

  /**
   * List tickets with role-based scoping
   */
  async listTickets(queryParams, profile) {
    const filters = { ...queryParams };

    if (profile.role === 'STUDENT') {
      filters.creatorId = profile.id;
    } else if (profile.role === 'STAFF') {
      filters.departmentId = profile.department_id;
      filters.excludeConfidential = true;
    }

    return await ticketRepository.listTickets(filters);
  }

  /**
   * Transition ticket status with state machine enforcement
   */
  async transitionStatus(ticketId, { status: nextStatus, resolutionSummary, rejectionReason, note }, profile) {
    const ticket = await ticketRepository.findById(ticketId);
    if (!ticket) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    this.enforceWriteAccess(ticket, profile);

    const currentStatus = ticket.status;

    // Check state transition validity
    const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(nextStatus)) {
      const err = new Error(`Invalid status transition from ${currentStatus} to ${nextStatus}. Allowed transitions: ${allowedNext.join(', ')}`);
      err.statusCode = 400;
      err.code = 'INVALID_STATUS_TRANSITION';
      throw err;
    }

    // Role restrictions on transitions
    if (profile.role === 'STUDENT' && nextStatus !== 'IN_PROGRESS') {
      const err = new Error('Students may not directly modify staff resolution statuses.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    // Mandatory resolution summary
    if (nextStatus === 'RESOLVED') {
      if (!resolutionSummary || resolutionSummary.trim().length < 5) {
        const err = new Error('A detailed resolution summary (at least 5 characters) is required to resolve a ticket.');
        err.statusCode = 400;
        err.code = 'RESOLUTION_SUMMARY_REQUIRED';
        throw err;
      }
    }

    // Mandatory rejection reason
    if (nextStatus === 'REJECTED') {
      if (!rejectionReason || rejectionReason.trim().length < 5) {
        const err = new Error('A documented rejection reason (at least 5 characters) is required to reject a ticket.');
        err.statusCode = 400;
        err.code = 'REJECTION_REASON_REQUIRED';
        throw err;
      }
    }

    const updates = { status: nextStatus };
    const now = new Date().toISOString();

    if (nextStatus === 'RESOLVED') {
      updates.resolution_summary = resolutionSummary;
      updates.resolved_at = now;
    } else if (nextStatus === 'REJECTED') {
      updates.rejection_reason = rejectionReason;
    } else if (nextStatus === 'CLOSED') {
      updates.closed_at = now;
      if (resolutionSummary) updates.resolution_summary = resolutionSummary;
    }

    const updatedTicket = await ticketRepository.updateTicket(ticketId, updates);

    let eventType = 'STATUS_CHANGED';
    if (nextStatus === 'RESOLVED') eventType = 'RESOLVED';
    else if (nextStatus === 'REJECTED') eventType = 'REJECTED';
    else if (nextStatus === 'CLOSED') eventType = 'CLOSED';

    await ticketRepository.recordEvent({
      ticketId,
      actorId: profile.id,
      eventType,
      oldValue: { status: currentStatus },
      newValue: { status: nextStatus, resolutionSummary, rejectionReason },
      note: note || `Status changed from ${currentStatus} to ${nextStatus}`,
    });

    // Notify student creator about status change / resolution
    if (ticket.created_by) {
      const creator = await ticketRepository.findProfileById(ticket.created_by);
      if (creator) {
        const isResolved = nextStatus === 'RESOLVED';
        await NotificationService.notifyUser({
          recipientId: creator.id,
          recipientEmail: creator.email,
          recipientName: creator.full_name,
          ticket: updatedTicket,
          eventType: isResolved ? 'RESOLVED' : 'STATUS_CHANGED',
          title: isResolved
            ? `Ticket #${ticket.ticket_number} Resolved`
            : `Ticket #${ticket.ticket_number} Status: ${nextStatus}`,
          message: isResolved
            ? `Your ticket has been marked as resolved: ${resolutionSummary}`
            : `Status updated to ${nextStatus}`,
          actorName: profile.full_name,
          note: isResolved ? resolutionSummary : note,
          dedupKeySuffix: `${nextStatus}-${Date.now()}`,
        });
      }
    }

    return updatedTicket;
  }

  /**
   * Staff claims a ticket
   */
  async claimTicket(ticketId, profile) {
    if (profile.role === 'STUDENT') {
      const err = new Error('Students cannot claim tickets.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const ticket = await ticketRepository.findById(ticketId);
    if (!ticket) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    this.enforceWriteAccess(ticket, profile);

    const updates = { assigned_to: profile.id };
    if (ticket.status === 'OPEN') {
      updates.status = 'IN_PROGRESS';
    }

    const updatedTicket = await ticketRepository.updateTicket(ticketId, updates);

    await ticketRepository.recordEvent({
      ticketId,
      actorId: profile.id,
      eventType: 'ASSIGNED',
      oldValue: { assigned_to: ticket.assigned_to, status: ticket.status },
      newValue: { assigned_to: profile.id, status: updatedTicket.status },
      note: `Ticket claimed by ${profile.full_name}`,
    });

    return updatedTicket;
  }

  /**
   * Staff/Admin assigns ticket to another staff member
   */
  async assignTicket(ticketId, { assignedTo, note }, profile) {
    if (profile.role === 'STUDENT') {
      const err = new Error('Students cannot reassign tickets.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const ticket = await ticketRepository.findById(ticketId);
    if (!ticket) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    this.enforceWriteAccess(ticket, profile);

    // Verify target staff member exists and is in the correct department
    const db = supabaseAdmin || supabaseClient;
    const { data: targetProfile, error } = await db
      .from('profiles')
      .select('id, full_name, role, department_id, status')
      .eq('id', assignedTo)
      .maybeSingle();

    if (error || !targetProfile) {
      const err = new Error('Assignee staff member profile not found.');
      err.statusCode = 404;
      err.code = 'ASSIGNEE_NOT_FOUND';
      throw err;
    }

    if (targetProfile.role !== 'STAFF' && targetProfile.role !== 'SUPER_ADMIN') {
      const err = new Error('Tickets can only be assigned to staff or administrator accounts.');
      err.statusCode = 400;
      err.code = 'INVALID_ASSIGNEE_ROLE';
      throw err;
    }

    // Verify staff belongs to the ticket's assigned department (Super Admin exempt)
    if (profile.role !== 'SUPER_ADMIN' && targetProfile.department_id !== ticket.assigned_department_id) {
      const err = new Error('Assignee staff member does not belong to the responsible department for this ticket.');
      err.statusCode = 400;
      err.code = 'DEPARTMENT_MISMATCH';
      throw err;
    }

    const updates = { assigned_to: assignedTo };
    if (ticket.status === 'OPEN') {
      updates.status = 'IN_PROGRESS';
    }

    const updatedTicket = await ticketRepository.updateTicket(ticketId, updates);

    await ticketRepository.recordEvent({
      ticketId,
      actorId: profile.id,
      eventType: 'REASSIGNED',
      oldValue: { assigned_to: ticket.assigned_to, status: ticket.status },
      newValue: { assigned_to: assignedTo, status: updatedTicket.status },
      note: note || `Assigned to ${targetProfile.full_name}`,
    });

    await NotificationService.notifyUser({
      recipientId: targetProfile.id,
      recipientEmail: targetProfile.email,
      recipientName: targetProfile.full_name,
      ticket: updatedTicket,
      eventType: 'ASSIGNED',
      title: `Assigned: Ticket #${ticket.ticket_number}`,
      message: `You have been assigned to resolve ticket: ${ticket.title}`,
      actorName: profile.full_name,
      note,
      dedupKeySuffix: `assigned-${assignedTo}-${Date.now()}`,
    });

    return updatedTicket;
  }

  /**
   * Reopen a ticket: Allowed ONCE within 7 days of resolution/closure
   */
  async reopenTicket(ticketId, { reason }, profile) {
    const ticket = await ticketRepository.findById(ticketId);
    if (!ticket) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Only ticket creator or Super Admin may reopen
    if (profile.role === 'STUDENT' && ticket.created_by !== profile.id) {
      const err = new Error('You may only reopen tickets that you created.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    // Must be in RESOLVED or CLOSED status
    if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
      const err = new Error(`Only RESOLVED or CLOSED tickets can be reopened. Current status is ${ticket.status}.`);
      err.statusCode = 400;
      err.code = 'INVALID_REOPEN_STATE';
      throw err;
    }

    // Allowed only ONCE
    if (ticket.reopened_count >= 1 && profile.role !== 'SUPER_ADMIN') {
      const err = new Error('This ticket has already been reopened once. College policy permits only a single reopening per ticket.');
      err.statusCode = 400;
      err.code = 'MAX_REOPENS_EXCEEDED';
      throw err;
    }

    // Must be within 7 days of resolution or closure
    const resolvedOrClosedAt = new Date(ticket.resolved_at || ticket.closed_at || ticket.updated_at).getTime();
    const now = Date.now();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

    if (now - resolvedOrClosedAt > sevenDaysInMs && profile.role !== 'SUPER_ADMIN') {
      const err = new Error('The 7-day reopening window for this ticket has elapsed. Please submit a new ticket.');
      err.statusCode = 400;
      err.code = 'REOPEN_WINDOW_EXPIRED';
      throw err;
    }

    const updates = {
      status: 'IN_PROGRESS',
      reopened_count: (ticket.reopened_count || 0) + 1,
      last_reopened_at: new Date().toISOString(),
    };

    const updatedTicket = await ticketRepository.updateTicket(ticketId, updates);

    await ticketRepository.recordEvent({
      ticketId,
      actorId: profile.id,
      eventType: 'REOPENED',
      oldValue: { status: ticket.status, reopened_count: ticket.reopened_count },
      newValue: { status: 'IN_PROGRESS', reopened_count: updates.reopened_count },
      note: reason,
    });

    if (ticket.assigned_to) {
      const assignedStaff = await ticketRepository.findProfileById(ticket.assigned_to);
      if (assignedStaff) {
        await NotificationService.notifyUser({
          recipientId: assignedStaff.id,
          recipientEmail: assignedStaff.email,
          recipientName: assignedStaff.full_name,
          ticket: updatedTicket,
          eventType: 'REOPENED',
          title: `Ticket #${ticket.ticket_number} Reopened`,
          message: `Student reopened ticket: ${reason}`,
          actorName: profile.full_name,
          note: reason,
          dedupKeySuffix: `reopened-${updates.reopened_count}`,
        });
      }
    }

    return updatedTicket;
  }

  /**
   * Rate a resolved/closed ticket (1 to 5 stars)
   */
  async rateTicket(ticketId, { rating, feedback }, profile) {
    const ticket = await ticketRepository.findById(ticketId);
    if (!ticket) {
      const err = new Error('Ticket not found');
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (ticket.created_by !== profile.id && profile.role !== 'SUPER_ADMIN') {
      const err = new Error('Only the student who raised this ticket can submit a satisfaction rating.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
      const err = new Error('Ratings can only be submitted for RESOLVED or CLOSED tickets.');
      err.statusCode = 400;
      err.code = 'TICKET_NOT_RESOLVED';
      throw err;
    }

    const savedRating = await ticketRepository.createRating({
      ticketId,
      studentId: profile.id,
      rating,
      feedback,
    });

    await ticketRepository.recordEvent({
      ticketId,
      actorId: profile.id,
      eventType: 'RATED',
      newValue: { rating, feedback },
      note: `Student submitted ${rating}-star resolution rating`,
    });

    return savedRating;
  }

  /**
   * Bulk assign tickets
   */
  async bulkAssign({ ticketIds, assignedTo }, profile) {
    if (profile.role === 'STUDENT') {
      const err = new Error('Students cannot perform bulk actions.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const deptId = profile.role === 'SUPER_ADMIN' ? null : profile.department_id;
    return await ticketRepository.bulkAssign({ ticketIds, assignedTo, departmentId: deptId });
  }

  /**
   * Bulk close tickets
   */
  async bulkClose({ ticketIds, resolutionSummary }, profile) {
    if (profile.role === 'STUDENT') {
      const err = new Error('Students cannot perform bulk actions.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    const deptId = profile.role === 'SUPER_ADMIN' ? null : profile.department_id;
    return await ticketRepository.bulkClose({ ticketIds, resolutionSummary, departmentId: deptId });
  }

  /**
   * Generate CSV export data of tickets scoped to caller authorization
   */
  async exportTicketsCsv(queryParams, profile) {
    const { tickets } = await this.listTickets({ ...queryParams, limit: 1000, page: 1 }, profile);

    const headers = [
      'Ticket Number',
      'Title',
      'Status',
      'Priority',
      'Category',
      'Assigned Department',
      'Student Academic Dept',
      'Creator Name',
      'Assignee Name',
      'Created At',
      'Resolved At',
      'SLA Due At',
      'Resolution Summary',
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = tickets.map((t) => [
      escapeCsv(t.ticket_number),
      escapeCsv(t.title),
      escapeCsv(t.status),
      escapeCsv(t.priority),
      escapeCsv(t.category?.name),
      escapeCsv(t.assigned_department?.name),
      escapeCsv(t.student_department?.name),
      escapeCsv(t.creator?.full_name),
      escapeCsv(t.assignee?.full_name || 'Unassigned'),
      escapeCsv(t.created_at),
      escapeCsv(t.resolved_at),
      escapeCsv(t.sla_due_at),
      escapeCsv(t.resolution_summary),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  // --- Security Helpers ---

  enforceReadAccess(ticket, profile) {
    if (profile.role === 'SUPER_ADMIN') return;

    if (profile.role === 'STUDENT') {
      if (ticket.created_by !== profile.id) {
        const err = new Error('Access denied: You do not have permission to view tickets raised by other students.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
      return;
    }

    if (profile.role === 'STAFF') {
      if (ticket.assigned_department_id !== profile.department_id) {
        const err = new Error('Access denied: This ticket belongs to a different department.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }

      if (ticket.is_confidential) {
        const err = new Error('Access denied: Confidential grievances require specific grievance officer authorization.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }
  }

  enforceWriteAccess(ticket, profile) {
    if (profile.role === 'SUPER_ADMIN') return;

    if (profile.role === 'STUDENT') {
      if (ticket.created_by !== profile.id) {
        const err = new Error('Access denied: You cannot modify another student\'s ticket.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
      return;
    }

    if (profile.role === 'STAFF') {
      if (ticket.assigned_department_id !== profile.department_id) {
        const err = new Error('Access denied: You can only triage tickets assigned to your department.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }
  }
}

export const ticketService = new TicketService();
