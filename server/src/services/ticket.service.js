import { ticketRepository } from '../repositories/ticket.repository.js';
import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { NotificationService } from './notification.service.js';
import { auditService, AUDIT_ACTIONS } from './audit.service.js';
import { slaService, DEMO_POLICY_LABEL, IS_DEMO_TARGET } from './sla.service.js';
import { formatToIST } from '../utils/date.js';
import { logger } from '../utils/logger.js';
import { CATEGORIES } from '../ml/taxonomy.js';
import { routingEngine } from '../ml/ticket_classification/routing_engine.js';
import { DEFAULT_DEPARTMENTS } from '../routes/auth.routes.js';

export const ALLOWED_STATUS_TRANSITIONS = {
  OPEN: ['UNDER_REVIEW', 'DOCUMENT_VERIFICATION', 'IN_PROGRESS', 'REJECTED'],
  UNDER_REVIEW: ['DOCUMENT_VERIFICATION', 'IN_PROGRESS', 'AWAITING_INFO', 'READY_FOR_COLLECTION', 'ISSUED', 'RESOLVED', 'REJECTED'],
  DOCUMENT_VERIFICATION: ['UNDER_REVIEW', 'IN_PROGRESS', 'AWAITING_INFO', 'READY_FOR_COLLECTION', 'ISSUED', 'RESOLVED', 'REJECTED'],
  IN_PROGRESS: ['UNDER_REVIEW', 'DOCUMENT_VERIFICATION', 'AWAITING_INFO', 'READY_FOR_COLLECTION', 'ISSUED', 'RESOLVED', 'REJECTED'],
  AWAITING_INFO: ['UNDER_REVIEW', 'DOCUMENT_VERIFICATION', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  READY_FOR_COLLECTION: ['IN_PROGRESS', 'DOCUMENT_VERIFICATION', 'ISSUED', 'RESOLVED', 'CLOSED'],
  ISSUED: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'], // IN_PROGRESS allowed only via student reopen
  CLOSED: ['IN_PROGRESS'],            // IN_PROGRESS allowed only via student reopen
  REJECTED: ['IN_PROGRESS'],          // Only Super Admin can reopen a rejected ticket
};

/**
 * Universal classifier to detect student informational queries, clarifying inquiries,
 * certificate requests, and conversational AI handoffs.
 */
export function isStudentQueryOrService(ticket) {
  if (!ticket) return false;
  if (
    ticket.request_type === 'INFORMATION_REQUEST' ||
    ticket.request_type === 'QUERY' ||
    ticket.request_type === 'CERTIFICATE'
  ) {
    return true;
  }
  const tags = Array.isArray(ticket.tags) ? ticket.tags.map((t) => String(t).toUpperCase()) : [];
  if (
    tags.some((t) =>
      t.includes('INFORMATION_REQUEST') ||
      t.includes('QUERY') ||
      t.includes('CERTIFICATE') ||
      t.includes('STUDENT_QUERY') ||
      t.includes('INQUIRY') ||
      t.includes('CLARIFICATION') ||
      t.includes('WORKFLOW:APPROVAL_REQUEST')
    )
  ) {
    return true;
  }
  const title = typeof ticket.title === 'string' ? ticket.title.toLowerCase().trim() : '';
  if (
    title.startsWith('information request:') ||
    title.startsWith('query:') ||
    title.startsWith('inquiry:') ||
    title.startsWith('clarification:') ||
    title.startsWith('request:') ||
    title.includes('certificate') ||
    title.includes('bonafide') ||
    title.includes('transcript') ||
    title.endsWith('?') ||
    title.startsWith('what ') ||
    title.startsWith('when ') ||
    title.startsWith('how ') ||
    title.startsWith('why ') ||
    title.startsWith('where ') ||
    title.startsWith('who ') ||
    title.startsWith('is ') ||
    title.startsWith('can ')
  ) {
    return true;
  }
  return false;
}


export class TicketService {
  isStudentQueryOrService(ticket) {
    return isStudentQueryOrService(ticket);
  }

  /**
   * Create a new ticket with automatic departmental routing
   */
  async createTicket(input, creatorProfile) {
    let profile = creatorProfile;
    const userId = input.userId || input.user_id || input.created_by;
    if (!profile && userId) {
      profile = await ticketRepository.findProfileById(userId);
    }
    const studentDeptId = profile?.department_id || input.student_department_id || null;
    let assignedDeptId =
      input.assignedDepartmentId ||
      input.assigned_department_id ||
      input.department_id ||
      input.departmentId ||
      null;
    let routingRationale = assignedDeptId ? 'Explicitly assigned department' : null;
    let requiresTriage = false;
    const categoryKey = input.categoryId || input.category_id || input.category;

    // Category-to-department routing resolution
    if (!assignedDeptId) {
      // 1. Check if database has a specific active routing rule for the category
      const rule = categoryKey ? await ticketRepository.findRoutingRuleByCategoryId(categoryKey) : null;
      if (rule?.default_department_id) {
        assignedDeptId = rule.default_department_id;
        routingRationale = `Configured category routing rule for category (${categoryKey})`;
      } else {
        // 2. Resolve via canonical taxonomy (CATEGORIES)
        const matchedTaxonomyCat = CATEGORIES.find(
          (c) =>
            c.id === categoryKey ||
            c.code === categoryKey ||
            (categoryKey && c.name?.toLowerCase() === String(categoryKey).toLowerCase()) ||
            (categoryKey && c.keywords?.some((k) => String(categoryKey).toLowerCase().includes(k)))
        );

        const db = supabaseAdmin || supabaseClient;
        let matchedDept = null;

        if (matchedTaxonomyCat?.defaultDepartmentCode) {
          const deptCode = matchedTaxonomyCat.defaultDepartmentCode;
          if (db) {
            try {
              const { data } = await db
                .from('departments')
                .select('id, name, code')
                .eq('is_active', true)
                .or(`code.eq.${deptCode},code.eq.${deptCode === 'ACAD' ? 'REGISTRAR' : (deptCode === 'IT' ? 'CSE' : deptCode)}`)
                .limit(1)
                .maybeSingle();
              if (data) matchedDept = data;
            } catch {}
          }
          if (!matchedDept) {
            matchedDept = DEFAULT_DEPARTMENTS.find(
              (d) =>
                d.code === deptCode ||
                (deptCode === 'ACAD' && d.code === 'REGISTRAR') ||
                (deptCode === 'IT' && (d.code === 'CSE' || d.code === 'IT')) ||
                (deptCode === 'STU' && d.code === 'AFFAIRS')
            );
          }
        }

        // 3. If taxonomy did not match, check deterministic routing engine with title and description
        if (!matchedDept) {
          const prediction = routingEngine.routeTicket(
            { category: matchedTaxonomyCat?.code || 'OTHER', confidence: 0.85 },
            { title: input.title, description: input.description }
          );

          if (!prediction.is_fallback && !prediction.human_review_required && prediction.department) {
            const engineDeptCode = prediction.department;
            if (db) {
              try {
                const { data } = await db
                  .from('departments')
                  .select('id, name, code')
                  .eq('is_active', true)
                  .or(`code.eq.${engineDeptCode},code.eq.${engineDeptCode === 'STU' ? 'AFFAIRS' : (engineDeptCode === 'IT' ? 'CSE' : engineDeptCode)}`)
                  .limit(1)
                  .maybeSingle();
                if (data) matchedDept = data;
              } catch {}
            }
            if (!matchedDept) {
              matchedDept = DEFAULT_DEPARTMENTS.find(
                (d) =>
                  d.code === engineDeptCode ||
                  (engineDeptCode === 'STU' && d.code === 'AFFAIRS') ||
                  (engineDeptCode === 'IT' && (d.code === 'CSE' || d.code === 'IT'))
              );
            }
          }
        }

        if (matchedDept?.id) {
          assignedDeptId = matchedDept.id;
          routingRationale = `Deterministic taxonomy routing rule mapped to ${matchedDept.code || matchedDept.name}`;
        } else {
          // 4. Authorized Triage Process:
          // If a ticket cannot be routed confidently, route to the authorized Student Affairs / Central Triage Desk
          // rather than silently assigning to an arbitrary department!
          requiresTriage = true;
          let triageDept = null;
          if (db) {
            try {
              const { data } = await db
                .from('departments')
                .select('id, name, code')
                .eq('is_active', true)
                .or('code.eq.AFFAIRS,code.eq.STU,code.eq.GRIEVANCE')
                .limit(1)
                .maybeSingle();
              if (data) triageDept = data;
            } catch {}
          }
          assignedDeptId = triageDept?.id || '77777777-7777-7777-7777-777777777777';
          routingRationale = 'Unmatched category routed to authorized Student Affairs Central Triage Desk for manual review';
        }
      }
    }

    // Calculate SLA deadlines from active demonstration policy (sla_policies.json)
    const slaDeadlines = slaService.calculateDeadlines(input.priority || 'Medium');

    // Ensure resolvedCategoryId is a valid UUID
    const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    let resolvedCategoryId = input.categoryId || input.category_id || null;

    if (!isUuid(resolvedCategoryId)) {
      const matchedTax = CATEGORIES.find(
        (c) =>
          c.id === categoryKey ||
          c.code === categoryKey ||
          (c.name && categoryKey && c.name.toLowerCase() === String(categoryKey).toLowerCase())
      );
      if (matchedTax?.id && isUuid(matchedTax.id)) {
        resolvedCategoryId = matchedTax.id;
      } else {
        resolvedCategoryId = 'c1000000-0000-0000-0000-000000000001';
      }
    }

    if (!isUuid(assignedDeptId)) {
      assignedDeptId = '77777777-7777-7777-7777-777777777777';
    }

    const ticketData = {
      title: input.title,
      description: input.description,
      category_id: resolvedCategoryId,
      priority: input.priority || 'Medium',
      status: 'OPEN',
      created_by: creatorProfile.id,
      student_department_id: isUuid(studentDeptId) ? studentDeptId : null,
      assigned_department_id: assignedDeptId,
      tags: Array.isArray(input.tags) ? input.tags : [],
      is_confidential: Boolean(input.isConfidential),
      sla_due_at: slaDeadlines.resolution_due_at,
      reopened_count: 0,
    };

    const newTicket = await ticketRepository.createTicket(ticketData);

    // Augment in-memory return object with operational routing metadata
    const returnTicket = {
      ...newTicket,
      requires_triage: requiresTriage,
      routing_rationale: routingRationale,
      policy_label: DEMO_POLICY_LABEL,
      first_response_due_at: slaDeadlines.first_response_due_at,
      resolution_due_at: slaDeadlines.resolution_due_at,
      escalation_due_at: slaDeadlines.escalation_due_at,
    };

    // Record CREATED event in ticket_events
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
        routingRationale,
        requiresTriage,
        policyLabel: DEMO_POLICY_LABEL,
      },
      note: requiresTriage
        ? 'Ticket opened by user and routed to authorized Student Affairs triage desk'
        : 'Ticket opened by user',
    });

    // Record append-only system audit log
    await auditService.recordAuditEvent({
      actor: creatorProfile.email || creatorProfile.full_name,
      actorId: creatorProfile.id,
      role: creatorProfile.role || 'STUDENT',
      action: AUDIT_ACTIONS.TICKET_CREATED,
      entity: 'ticket',
      entityId: newTicket.id,
      metadata: {
        ticket_number: newTicket.ticket_number,
        title: newTicket.title,
        priority: newTicket.priority,
        category_id: newTicket.category_id,
        assigned_department_id: newTicket.assigned_department_id,
        is_confidential: newTicket.is_confidential,
        routing_rationale: routingRationale,
        requires_triage: requiresTriage,
        sla_due_at: newTicket.sla_due_at,
        policy_label: DEMO_POLICY_LABEL,
      },
    });

    // Asynchronously notify ticket creator of successful creation (non-blocking resilience)
    try {
      await NotificationService.notifyUser({
        recipientId: creatorProfile.id,
        recipientEmail: creatorProfile.email,
        recipientName: creatorProfile.full_name,
        ticket: returnTicket,
        eventType: 'TICKET_CREATED',
        title: `Ticket Created: #${newTicket.ticket_number}`,
        message: `Your ticket "${newTicket.title}" has been submitted successfully.`,
        actorName: creatorProfile.full_name,
        dedupKeySuffix: 'created',
      }).catch((e) => logger.debug('Non-fatal notify error on ticket create', { error: e.message }));
    } catch (e) {
      logger.debug('Non-fatal notify error on ticket create', { error: e.message });
    }

    return returnTicket;
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

    // Attach audit events history
    let events = await ticketRepository.getEventsByTicketId(ticket.id);

    // Requirement 13: Keep internal notes hidden from students in database queries and API responses
    if (profile.role === 'STUDENT') {
      events = events.filter((e) => {
        if (e.event_type === 'INTERNAL_NOTE_ADDED') return false;
        if (e.note && /internal note/i.test(e.note)) return false;
        if (e.new_value) {
          try {
            const val = typeof e.new_value === 'string' ? JSON.parse(e.new_value) : e.new_value;
            if (val?.isInternal || val?.is_internal) return false;
          } catch {
            // Non-JSON new_value, keep
          }
        }
        return true;
      });
    }

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
      const isAuthorizedGrievanceReviewer =
        profile.can_review_grievances ||
        profile.department_code === 'STU' ||
        profile.department_code === 'AFFAIRS' ||
        profile.department_code === 'GRIEVANCE';
      if (!isAuthorizedGrievanceReviewer) {
        filters.excludeConfidential = true;
      }
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

    // Role restrictions on transitions: students cannot transition status directly (reopenTicket handles student reopen)
    if (profile.role === 'STUDENT') {
      const err = new Error('Students may not directly modify staff resolution statuses.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    // Check state transition validity
    const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(nextStatus)) {
      const err = new Error(`Invalid status transition from ${currentStatus} to ${nextStatus}. Allowed transitions: ${allowedNext.join(', ')}`);
      err.statusCode = 400;
      err.code = 'INVALID_STATUS_TRANSITION';
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

    const isApprovalRequest = Array.isArray(ticket.tags) && ticket.tags.includes('WORKFLOW:APPROVAL_REQUEST');
    if (isApprovalRequest && (nextStatus === 'RESOLVED' || nextStatus === 'REJECTED')) {
      const isAuthorizedApprover = profile.role === 'SUPER_ADMIN' || Boolean(profile.can_approve_documents);
      if (!isAuthorizedApprover) {
        const err = new Error('Only authorized staff with document approval privileges or Super Admins can officially approve/reject this institutional request.');
        err.statusCode = 403;
        err.code = 'APPROVAL_FORBIDDEN';
        throw err;
      }
      let tags = [...ticket.tags].filter((t) => t !== 'APPROVAL_STATUS:PENDING');
      tags.push(nextStatus === 'RESOLVED' ? 'APPROVAL_STATUS:APPROVED' : 'APPROVAL_STATUS:REJECTED');
      updates.tags = tags;
    }

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

    // Record centralized append-only audit event
    await auditService.recordAuditEvent({
      actor: profile.email || profile.full_name,
      actorId: profile.id,
      role: profile.role,
      action: AUDIT_ACTIONS.STATUS_CHANGED,
      entity: 'ticket',
      entityId: ticketId,
      metadata: {
        ticketNumber: ticket.ticket_number,
        fromStatus: currentStatus,
        toStatus: nextStatus,
        resolutionSummary: resolutionSummary || null,
        rejectionReason: rejectionReason || null,
        note: note || null,
      },
    });

    // Notify student creator about status change / resolution (asynchronous resilience)
    if (ticket.created_by) {
      try {
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
          }).catch((e) => logger.debug('Non-fatal notify error on transition', { error: e.message }));
        }
      } catch (e) {
        logger.debug('Non-fatal profile lookup/notify error', { error: e.message });
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
    if (ticket.assigned_department_id !== profile.department_id && isStudentQueryOrService(ticket) && profile.department_id) {
      updates.assigned_department_id = profile.department_id;
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

    await auditService.recordAuditEvent({
      actor: profile.email || profile.full_name,
      actorId: profile.id,
      role: profile.role,
      action: AUDIT_ACTIONS.TICKET_ASSIGNED,
      entity: 'ticket',
      entityId: ticketId,
      metadata: {
        ticketNumber: ticket.ticket_number,
        assignedTo: profile.id,
        assignedName: profile.full_name,
        claimed: true,
        status: updatedTicket.status,
      },
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
    let targetProfile = null;
    if (db) {
      try {
        const { data } = await db
          .from('profiles')
          .select('id, full_name, role, department_id, status')
          .eq('id', assignedTo)
          .maybeSingle();
        if (data) targetProfile = data;
      } catch {}
    }
    if (!targetProfile) {
      targetProfile = await ticketRepository.findProfileById(assignedTo);
    }

    if (!targetProfile) {
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

    // Verify staff belongs to the ticket's assigned department (Super Admin & Student queries exempt)
    if (
      profile.role !== 'SUPER_ADMIN' &&
      !isStudentQueryOrService(ticket) &&
      targetProfile.department_id !== ticket.assigned_department_id
    ) {
      const err = new Error('Assignee staff member does not belong to the responsible department for this ticket.');
      err.statusCode = 400;
      err.code = 'DEPARTMENT_MISMATCH';
      throw err;
    }

    const updates = { assigned_to: assignedTo };
    if (isStudentQueryOrService(ticket) && targetProfile.department_id) {
      updates.assigned_department_id = targetProfile.department_id;
    }
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

    await auditService.recordAuditEvent({
      actor: profile.email || profile.full_name,
      actorId: profile.id,
      role: profile.role,
      action: AUDIT_ACTIONS.TICKET_REASSIGNED,
      entity: 'ticket',
      entityId: ticketId,
      metadata: {
        ticketNumber: ticket.ticket_number,
        assignedTo,
        assigneeName: targetProfile.full_name,
        departmentId: ticket.assigned_department_id,
        note: note || null,
        status: updatedTicket.status,
      },
    });

    // Asynchronously notify target staff member (non-blocking resilience)
    try {
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
      }).catch((e) => logger.debug('Non-fatal notify error on assign', { error: e.message }));
    } catch (e) {
      logger.debug('Non-fatal notify error on assign', { error: e.message });
    }

    return updatedTicket;
  }

  /**
   * Reassign a ticket to a new department with recorded reason (Staff or Super Admin)
   */
  async reassignDepartment(ticketId, { departmentId, reason, assignedTo = null }, profile) {
    if (profile.role === 'STUDENT') {
      const err = new Error('Students cannot reassign tickets to departments.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (!reason || reason.trim().length < 5) {
      const err = new Error('A documented reassignment reason (at least 5 characters) is required.');
      err.statusCode = 400;
      err.code = 'REASSIGN_REASON_REQUIRED';
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

    const oldDeptId = ticket.assigned_department_id;

    // Verify target department exists
    const db = supabaseAdmin || supabaseClient;
    let targetDept = null;
    if (db) {
      try {
        const { data, error } = await db
          .from('departments')
          .select('id, name, code, is_active')
          .eq('id', departmentId)
          .maybeSingle();
        if (!error && data) targetDept = data;
      } catch {
        targetDept = null;
      }
    }

    const updates = {
      assigned_department_id: departmentId,
      assigned_to: assignedTo || null,
      updated_at: new Date().toISOString(),
    };

    const updatedTicket = await ticketRepository.updateTicket(ticketId, updates);

    // Record in ticket_events
    await ticketRepository.recordEvent({
      ticketId,
      actorId: profile.id,
      eventType: 'REASSIGNED',
      oldValue: { assigned_department_id: oldDeptId, assigned_to: ticket.assigned_to },
      newValue: { assigned_department_id: departmentId, assigned_to: assignedTo || null },
      note: `Department reassigned: ${reason}`,
    });

    // Record in centralized append-only audit log
    await auditService.recordAuditEvent({
      actor: profile.email || profile.full_name,
      actorId: profile.id,
      role: profile.role,
      action: AUDIT_ACTIONS.TICKET_REASSIGNED,
      entity: 'ticket',
      entityId: ticketId,
      metadata: {
        ticketNumber: ticket.ticket_number,
        fromDepartmentId: oldDeptId,
        toDepartmentId: departmentId,
        targetDepartmentName: targetDept?.name || 'Department',
        reason: reason.trim(),
        assignedTo: assignedTo || null,
      },
    });

    // Asynchronously notify student about department transfer
    if (ticket.created_by) {
      const creator = await ticketRepository.findProfileById(ticket.created_by);
      if (creator) {
        NotificationService.notifyUser({
          recipientId: creator.id,
          recipientEmail: creator.email,
          recipientName: creator.full_name,
          ticket: updatedTicket,
          eventType: 'REASSIGNED',
          title: `Ticket #${ticket.ticket_number} Department Updated`,
          message: `Your ticket has been routed to ${targetDept?.name || 'another department'}: ${reason}`,
          actorName: profile.full_name,
          note: reason,
          dedupKeySuffix: `dept-${departmentId}-${Date.now()}`,
        }).catch((e) => logger.debug('Non-fatal notify error', { error: e.message }));
      }
    }

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

    await auditService.recordAuditEvent({
      actor: profile.email || profile.full_name,
      actorId: profile.id,
      role: profile.role,
      action: AUDIT_ACTIONS.TICKET_REOPENED,
      entity: 'ticket',
      entityId: ticketId,
      metadata: {
        ticketNumber: ticket.ticket_number,
        reopenedCount: updates.reopened_count,
        reason,
        status: 'IN_PROGRESS',
      },
    });

    if (ticket.assigned_to) {
      try {
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
          }).catch((e) => logger.debug('Non-fatal notify error on reopen', { error: e.message }));
        }
      } catch (e) {
        logger.debug('Non-fatal profile lookup error on reopen notify', { error: e.message });
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
   * Bulk assign tickets with foreign key integrity verification
   */
  async bulkAssign({ ticketIds, assignedTo }, profile) {
    if (profile.role === 'STUDENT') {
      const err = new Error('Students cannot perform bulk actions.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (!assignedTo) {
      const err = new Error('Assigned staff member is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // Verify target staff member profile exists in database
    const db = supabaseAdmin || supabaseClient;
    let targetProfile = null;
    if (db) {
      try {
        const { data } = await db
          .from('profiles')
          .select('id, full_name, email, role, department_id, status')
          .eq('id', assignedTo)
          .maybeSingle();
        if (data) targetProfile = data;
      } catch {}
    }
    if (!targetProfile) {
      targetProfile = await ticketRepository.findProfileById(assignedTo);
    }

    if (!targetProfile) {
      const err = new Error(`Assigned staff member profile (${assignedTo}) was not found in the staff directory.`);
      err.statusCode = 400;
      err.code = 'STAFF_NOT_FOUND';
      throw err;
    }

    if (targetProfile.role !== 'STAFF' && targetProfile.role !== 'SUPER_ADMIN') {
      const err = new Error(`User "${targetProfile.full_name || assignedTo}" is not registered as a campus staff member.`);
      err.statusCode = 400;
      err.code = 'INVALID_ASSIGNEE_ROLE';
      throw err;
    }

    const deptId = profile.role === 'SUPER_ADMIN' ? null : profile.department_id;
    const targetDeptId = targetProfile.department_id || null;
    let result = await ticketRepository.bulkAssign({ ticketIds, assignedTo, departmentId: deptId, newDepartmentId: targetDeptId });
    if (result.length === 0 && deptId && ticketIds.length > 0) {
      // Allow cross-department triage assignment for student information requests and queries
      result = await ticketRepository.bulkAssign({ ticketIds, assignedTo, departmentId: null, newDepartmentId: targetDeptId });
    }

    // Record audit events for each assigned ticket
    for (const item of result) {
      await auditService.recordAuditEvent({
        actor: profile.email || profile.full_name,
        actorId: profile.id,
        role: profile.role,
        action: AUDIT_ACTIONS.TICKET_ASSIGNED,
        entity: 'ticket',
        entityId: item.id,
        metadata: {
          ticketNumber: item.ticket_number,
          assignedTo,
          assignedName: targetProfile.full_name,
          bulk: true,
          status: item.status,
        },
      }).catch(() => {});
    }

    return result;
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

  /**
   * Compute real dashboard statistics from real API data
   */
  async getDashboardStats(profile) {
    const listResult = await this.listTickets({ limit: 1000 }, profile);
    const tickets = listResult.tickets || [];

    const totalTickets = tickets.length;
    let openTickets = 0;
    let resolvedTickets = 0;
    let totalResolutionHours = 0;
    let resolvedCountWithDuration = 0;

    const byPriority = { Low: 0, Medium: 0, High: 0, Urgent: 0 };
    const byStatus = {
      OPEN: 0,
      IN_PROGRESS: 0,
      AWAITING_INFO: 0,
      RESOLVED: 0,
      CLOSED: 0,
      REJECTED: 0,
    };

    for (const t of tickets) {
      if (['OPEN', 'IN_PROGRESS', 'AWAITING_INFO'].includes(t.status)) {
        openTickets += 1;
      } else if (['RESOLVED', 'CLOSED'].includes(t.status)) {
        resolvedTickets += 1;
      }

      if (byPriority[t.priority] !== undefined) {
        byPriority[t.priority] += 1;
      }
      if (byStatus[t.status] !== undefined) {
        byStatus[t.status] += 1;
      }

      // Calculate resolution time
      if (['RESOLVED', 'CLOSED'].includes(t.status)) {
        const resolvedTimestamp = new Date(t.resolved_at || t.closed_at || t.updated_at).getTime();
        const createdTimestamp = new Date(t.created_at).getTime();
        const durationHours = (resolvedTimestamp - createdTimestamp) / (1000 * 60 * 60);
        if (durationHours > 0) {
          totalResolutionHours += durationHours;
          resolvedCountWithDuration += 1;
        }
      }
    }

    let averageResolutionHours = null;
    let averageResolutionTime = 'N/A';

    if (resolvedCountWithDuration > 0) {
      const avg = totalResolutionHours / resolvedCountWithDuration;
      averageResolutionHours = parseFloat(avg.toFixed(1));
      if (avg < 1) {
        averageResolutionTime = `${Math.round(avg * 60)} mins`;
      } else if (avg < 24) {
        averageResolutionTime = `${avg.toFixed(1)} hrs`;
      } else {
        averageResolutionTime = `${(avg / 24).toFixed(1)} days`;
      }
    }

    const recentTickets = tickets.slice(0, 50);

    return {
      totalTickets,
      openTickets,
      resolvedTickets,
      averageResolutionTime,
      averageResolutionHours,
      byPriority,
      byStatus,
      recentTickets,
    };
  }

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
      const isAuthorizedGrievanceReviewer =
        profile.can_review_grievances ||
        profile.department_code === 'STU' ||
        profile.department_code === 'AFFAIRS' ||
        profile.department_code === 'GRIEVANCE';

      if (ticket.is_confidential) {
        if (!isAuthorizedGrievanceReviewer) {
          const err = new Error('Access denied: Confidential grievances require specific grievance officer authorization.');
          err.statusCode = 403;
          err.code = 'FORBIDDEN';
          throw err;
        }
      }

      // Check if ticket is an informational student query, inquiry, or certificate request
      const isQueryOrService = isStudentQueryOrService(ticket);

      if (!isQueryOrService) {
        if (
          profile.department_id &&
          ticket.assigned_department_id &&
          profile.department_id !== ticket.assigned_department_id &&
          ticket.assigned_to !== profile.id
        ) {
          const err = new Error('Access denied: This ticket belongs to a different department.');
          err.statusCode = 403;
          err.code = 'FORBIDDEN';
          throw err;
        }
      }

      return;
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
      const isAuthorizedGrievanceReviewer =
        profile.can_review_grievances ||
        profile.department_code === 'STU' ||
        profile.department_code === 'AFFAIRS' ||
        profile.department_code === 'GRIEVANCE';

      if (ticket.is_confidential) {
        if (!isAuthorizedGrievanceReviewer) {
          const err = new Error('Access denied: Confidential grievances require specific grievance officer authorization.');
          err.statusCode = 403;
          err.code = 'FORBIDDEN';
          throw err;
        }
      } else {
        const isQueryOrService = isStudentQueryOrService(ticket);

        const canWrite =
          isQueryOrService ||
          !ticket.assigned_department_id ||
          !profile.department_id ||
          ticket.assigned_department_id === profile.department_id ||
          ticket.assigned_to === profile.id;

        if (!canWrite) {
          const err = new Error('Access denied: You can only triage tickets assigned to your department or assigned to you.');
          err.statusCode = 403;
          err.code = 'FORBIDDEN';
          throw err;
        }
      }
    }
  }

}

export const ticketService = new TicketService();
