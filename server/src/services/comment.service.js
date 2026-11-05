import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { TicketRepository } from '../repositories/ticket.repository.js';
import { isStudentQueryOrService } from './ticket.service.js';
import { NotificationService } from './notification.service.js';
import { auditService, AUDIT_ACTIONS } from './audit.service.js';
import { logger } from '../utils/logger.js';


function getDbClient() {
  if (process.env.NODE_ENV === 'test') return null;
  return supabaseAdmin || supabaseClient;
}

// In-memory fallback comments store
export const inMemoryComments = [];

export class CommentService {
  /**
   * Retrieves comments for a ticket, strictly enforcing internal note isolation.
   * Students NEVER see internal comments.
   *
   * @param {string} ticketId
   * @param {Object} user - Authenticated user session
   * @param {string} role - STUDENT, STAFF, or SUPER_ADMIN
   * @param {string} departmentId - User's department
   */
  static async getTicketComments(ticketId, user, role, departmentId) {
    const ticketRepo = new TicketRepository();
    const ticket = await ticketRepo.findById(ticketId);

    if (!ticket) {
      const err = new Error('Ticket not found.');
      err.statusCode = 404;
      throw err;
    }

    // Authorization check on ticket
    if (role === 'STUDENT' && ticket.created_by !== user.id) {
      const err = new Error('You are not authorized to view comments for this ticket.');
      err.statusCode = 403;
      throw err;
    }

    if (role === 'STAFF') {
      const isAuthorizedGrievanceReviewer =
        user?.can_review_grievances ||
        user?.department_code === 'STU' ||
        user?.department_code === 'AFFAIRS' ||
        user?.department_code === 'GRIEVANCE' ||
        user?.departments?.code === 'STU' ||
        user?.departments?.code === 'AFFAIRS' ||
        user?.departments?.code === 'GRIEVANCE';

      if (ticket.is_confidential && !isAuthorizedGrievanceReviewer) {
        const err = new Error('Access denied: Confidential grievances require specific grievance officer authorization.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    const isStudent = role === 'STUDENT';
    const isTest = process.env.NODE_ENV === 'test';
    const db = isTest ? null : getDbClient();

    let comments = [];

    if (db) {
      try {
        let query = db
          .from('ticket_comments')
          .select(`
            *,
            author:author_id(id, full_name, email, role, avatar_url),
            attachments:attachments(*)
          `)
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true });

        if (isStudent) {
          query = query.eq('is_internal', false);
        }

        const { data, error } = await query;
        if (!error && data) {
          comments = data;
          // Clean attachments for students (ensure no internal attachments sneak in)
          if (isStudent) {
            comments = comments.map((c) => ({
              ...c,
              attachments: (c.attachments || []).filter((a) => !a.is_internal),
            }));
          }
          return comments;
        }
      } catch (err) {
        logger.debug('[CommentService] DB comment retrieval fallback', { error: err.message });
      }
    }

    // Memory fallback
    let filtered = inMemoryComments.filter((c) => c.ticket_id === ticketId);
    if (isStudent) {
      filtered = filtered.filter((c) => !c.is_internal);
    }

    return filtered.map((c) => {
      if (isStudent && c.attachments) {
        return {
          ...c,
          attachments: c.attachments.filter((a) => !a.is_internal),
        };
      }
      return c;
    });
  }

  static async getComments(ticketId, user, role, departmentId) {
    return this.getTicketComments(ticketId, user, role || user?.role, departmentId || user?.department_id);
  }

  /**
   * Adds a comment to a ticket.
   *
   * @param {Object} params
   * @param {string} params.ticketId
   * @param {string} params.content
   * @param {boolean} [params.isInternal=false]
   * @param {Object} params.user
   * @param {string} params.role
   * @param {string} params.departmentId
   * @param {Array} [params.attachments=[]]
   */
  static async addComment(arg1, arg2, arg3) {
    let ticketId, content, isInternal, user, role, departmentId, attachments;
    if (typeof arg1 === 'object' && arg1 !== null && !arg2) {
      ({
        ticketId,
        content,
        isInternal = false,
        user,
        role,
        departmentId,
        attachments = [],
      } = arg1);
    } else {
      ticketId = arg1;
      if (typeof arg2 === 'object' && arg2 !== null && arg2.content !== undefined) {
        content = arg2.content;
        isInternal = arg2.is_internal ?? arg2.isInternal ?? false;
        attachments = arg2.attachments ?? [];
        user = arg3;
      } else {
        content = arg2;
        isInternal = Boolean(arg3);
      }
    }
    role = role || user?.role;
    departmentId = departmentId || user?.department_id;

    const ticketRepo = new TicketRepository();
    const ticket = await ticketRepo.findById(ticketId);

    if (!ticket) {
      const err = new Error('Ticket not found.');
      err.statusCode = 404;
      throw err;
    }

    // Role restrictions
    if (role === 'STUDENT') {
      if (ticket.created_by !== user.id) {
        const err = new Error('You cannot comment on a ticket you did not create.');
        err.statusCode = 403;
        throw err;
      }
      if (isInternal) {
        const err = new Error('Students are not permitted to create internal staff notes.');
        err.statusCode = 403;
        throw err;
      }
      if (['CLOSED', 'REJECTED'].includes(ticket.status)) {
        const err = new Error(`Cannot comment on a ${ticket.status.toLowerCase()} ticket. Reopen it first.`);
        err.statusCode = 400;
        throw err;
      }
    } else if (role === 'STAFF') {
      const isAssigned = ticket.assigned_to === user.id;
      const isDept = ticket.assigned_department_id === departmentId;
      const isQuery = isStudentQueryOrService(ticket);
      if (!isAssigned && !isDept && !isQuery) {
        const err = new Error('You cannot comment on tickets outside your assigned department.');
        err.statusCode = 403;
        throw err;
      }

      const isAuthorizedGrievanceReviewer =
        user?.can_review_grievances ||
        user?.department_code === 'STU' ||
        user?.department_code === 'AFFAIRS' ||
        user?.department_code === 'GRIEVANCE' ||
        user?.departments?.code === 'STU' ||
        user?.departments?.code === 'AFFAIRS' ||
        user?.departments?.code === 'GRIEVANCE';

      if (ticket.is_confidential && !isAuthorizedGrievanceReviewer) {
        const err = new Error('Access denied: Confidential grievances require specific grievance officer authorization.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    const commentRecord = {
      id: `cmt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      ticket_id: ticketId,
      author_id: user.id,
      user_id: user.id,
      content: content.trim(),
      is_internal: Boolean(isInternal),
      author_name: user.full_name || user.email,
      author: {
        id: user.id,
        full_name: user.full_name || user.email,
        email: user.email,
        role,
      },
      attachments: attachments || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const isTest = process.env.NODE_ENV === 'test';
    const db = isTest ? null : getDbClient();
    if (db) {
      try {
        const { data, error } = await db
          .from('ticket_comments')
          .insert({
            ticket_id: ticketId,
            author_id: user.id,
            content: content.trim(),
            is_internal: Boolean(isInternal),
          })
          .select(`*, author:author_id(id, full_name, email, role)`)
          .maybeSingle();

        if (data) {
          commentRecord.id = data.id;
        }
      } catch (err) {
        logger.debug('[CommentService] DB comment insertion error, fallback to memory', { error: err.message });
      }
    }

    inMemoryComments.push(commentRecord);

    // Record audit event in ticket_events
    await ticketRepo.recordEvent({
      ticketId,
      actorId: user.id,
      eventType: isInternal ? 'INTERNAL_NOTE_ADDED' : 'COMMENT_ADDED',
      note: content.length > 80 ? `${content.substring(0, 80)}...` : content,
      newValue: {
        commentId: commentRecord.id,
        isInternal,
        attachmentCount: attachments.length,
      },
    });

    // Record centralized audit log (secrets scrubbed)
    await auditService.recordAuditEvent({
      actor: user.email || user.full_name,
      actorId: user.id,
      role,
      action: AUDIT_ACTIONS.COMMENT_ADDED,
      entity: 'comment',
      entityId: commentRecord.id,
      metadata: {
        ticketId,
        isInternal: Boolean(isInternal),
        attachmentCount: attachments.length,
      },
    }).catch(() => {});


    // Auto-transition ticket from AWAITING_INFO back to IN_PROGRESS upon student reply
    if (role === 'STUDENT' && ticket.status === 'AWAITING_INFO') {
      try {
        await ticketRepo.updateTicket(ticketId, { status: 'IN_PROGRESS' });
        await ticketRepo.recordEvent({
          ticketId,
          actorId: user.id,
          eventType: 'STATUS_CHANGED',
          oldValue: { status: 'AWAITING_INFO' },
          newValue: { status: 'IN_PROGRESS' },
          note: 'Student provided requested information; ticket returned to In Progress.',
        });
        await auditService.recordAuditEvent({
          actor: user.email || user.full_name,
          actorId: user.id,
          role: 'STUDENT',
          action: AUDIT_ACTIONS.STATUS_CHANGED,
          entity: 'ticket',
          entityId: ticketId,
          metadata: {
            ticketNumber: ticket.ticket_number,
            fromStatus: 'AWAITING_INFO',
            toStatus: 'IN_PROGRESS',
            reason: 'Student reply received',
          },
        }).catch(() => {});
      } catch (e) {
        logger.debug('[CommentService] Error auto-transitioning AWAITING_INFO status on student reply', { error: e.message });
      }
    }
    // 1. If public comment and author is staff -> notify student
    if (!isInternal && role !== 'STUDENT' && ticket.created_by) {
      const studentProfile = await ticketRepo.findProfileById(ticket.created_by);
      if (studentProfile) {
        await NotificationService.notifyUser({
          recipientId: studentProfile.id,
          recipientEmail: studentProfile.email,
          recipientName: studentProfile.full_name,
          ticket,
          eventType: 'NEW_COMMENT',
          title: `New Comment on Ticket #${ticket.ticket_number}`,
          message: `${user.full_name || 'Staff'} replied to your ticket.`,
          actorName: user.full_name || 'Staff',
          note: content,
          dedupKeySuffix: commentRecord.id,
        });
      }
    }

    // 2. If author is student -> notify assigned staff (or department staff)
    if (role === 'STUDENT') {
      const recipientId = ticket.assigned_to;
      if (recipientId) {
        const staffProfile = await ticketRepo.findProfileById(recipientId);
        if (staffProfile) {
          await NotificationService.notifyUser({
            recipientId: staffProfile.id,
            recipientEmail: staffProfile.email,
            recipientName: staffProfile.full_name,
            ticket,
            eventType: 'NEW_COMMENT',
            title: `Student Commented on Ticket #${ticket.ticket_number}`,
            message: `${user.full_name || 'Student'} posted a comment.`,
            actorName: user.full_name || 'Student',
            note: content,
            dedupKeySuffix: commentRecord.id,
          });
        }
      }
    }

    return commentRecord;
  }
}
