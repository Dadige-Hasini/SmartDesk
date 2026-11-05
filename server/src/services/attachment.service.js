import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { TicketRepository } from '../repositories/ticket.repository.js';
import { isStudentQueryOrService } from './ticket.service.js';
import { validateAttachment, MAX_ATTACHMENTS_PER_REQUEST } from '../utils/fileValidation.js';
import { logger } from '../utils/logger.js';

function getDbClient() {
  return supabaseAdmin || supabaseClient;
}

// In-memory attachment metadata & buffer cache for tests and local fallback
export const inMemoryAttachments = [];
export const inMemoryFileBuffers = new Map();

export class AttachmentService {
  /**
   * Validates and persists attachments for a ticket or comment.
   *
   * @param {Object} params
   * @param {Array<Express.Multer.File>} params.files
   * @param {string} params.ticketId
   * @param {string} [params.commentId]
   * @param {Object} params.user
   * @param {boolean} [params.isInternal=false]
   */
  static async uploadAttachments({
    files = [],
    ticketId,
    commentId = null,
    user,
    isInternal = false,
  }) {
    if (!files || files.length === 0) return [];

    const ticketRepo = new TicketRepository();
    const ticket = await ticketRepo.findById(ticketId);
    if (!ticket) {
      const err = new Error('Ticket not found.');
      err.statusCode = 404;
      throw err;
    }

    const role = user?.role || 'STUDENT';
    const departmentId = user?.department_id;

    if (role === 'STUDENT') {
      if (ticket.created_by !== user.id) {
        const err = new Error('Access denied: You cannot upload attachments to another student\'s ticket.');
        err.statusCode = 403;
        throw err;
      }
      if (isInternal) {
        const err = new Error('Access denied: Students cannot mark attachments as internal.');
        err.statusCode = 403;
        throw err;
      }
    } else if (role === 'STAFF') {
      const isAssigned = ticket.assigned_to === user.id;
      const isDept = ticket.assigned_department_id === departmentId;
      const isQuery = isStudentQueryOrService(ticket);
      if (!isAssigned && !isDept && !isQuery) {
        const err = new Error('Access denied: You cannot upload attachments to tickets outside your department.');
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

    if (files.length > MAX_ATTACHMENTS_PER_REQUEST) {
      const err = new Error(
        `Too many files attached. Maximum permitted: ${MAX_ATTACHMENTS_PER_REQUEST} files per request.`
      );
      err.statusCode = 400;
      throw err;
    }

    const savedRecords = [];
    const db = getDbClient();

    for (const file of files) {
      // 1. Validate file size, extension, MIME, and magic-byte signature
      const validation = validateAttachment(file);
      if (!validation.isValid) {
        const err = new Error(validation.error);
        err.statusCode = 400;
        throw err;
      }

      const storagePath = `${ticketId}/${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${file.originalname}`;

      // 2. Upload to Supabase Storage private bucket (if configured)
      if (supabaseAdmin) {
        try {
          const { error: uploadError } = await supabaseAdmin.storage
            .from('ticket-attachments')
            .upload(storagePath, file.buffer, {
              contentType: file.mimetype,
              upsert: false,
            });

          if (uploadError) {
            logger.warn('[AttachmentService] Supabase Storage upload error, caching buffer in memory', {
              error: uploadError.message,
            });
          }
        } catch (storageErr) {
          logger.warn('[AttachmentService] Storage client exception', { error: storageErr.message });
        }
      }

      // Store in buffer map for testing & immediate download fallback
      inMemoryFileBuffers.set(storagePath, {
        buffer: file.buffer,
        mimeType: file.mimetype,
        fileName: file.originalname,
      });

      const record = {
        id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        ticket_id: ticketId,
        comment_id: commentId,
        uploaded_by: user.id,
        file_name: file.originalname,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.mimetype,
        extension: validation.extension,
        is_internal: Boolean(isInternal),
        created_at: new Date().toISOString(),
      };

      if (db) {
        try {
          const { data, error } = await db
            .from('attachments')
            .insert({
              ticket_id: ticketId,
              comment_id: commentId,
              uploaded_by: user.id,
              file_name: file.originalname,
              storage_path: storagePath,
              file_size: file.size,
              mime_type: file.mimetype,
              extension: validation.extension,
              is_internal: Boolean(isInternal),
            })
            .select()
            .maybeSingle();

          if (data) {
            record.id = data.id;
          }
        } catch (dbErr) {
          logger.debug('[AttachmentService] DB attachment insert error', { error: dbErr.message });
        }
      }

      inMemoryAttachments.push(record);
      savedRecords.push(record);
    }

    return savedRecords;
  }

  /**
   * Authorizes and generates secure access to an attachment.
   * Strictly rechecks parent-ticket permissions and comment visibility.
   *
   * @param {Object} params
   * @param {string} params.ticketId
   * @param {string} params.attachmentId
   * @param {Object} params.user
   * @param {string} params.role
   * @param {string} params.departmentId
   */
  static async getAttachmentDownload({
    ticketId,
    attachmentId,
    user,
    role,
    departmentId,
  }) {
    const ticketRepo = new TicketRepository();
    const ticket = await ticketRepo.findById(ticketId);

    if (!ticket) {
      const err = new Error('Ticket not found.');
      err.statusCode = 404;
      throw err;
    }

    // 1. Check parent-ticket permissions
    if (role === 'STUDENT' && ticket.created_by !== user.id) {
      const err = new Error('You are not authorized to access attachments from this ticket.');
      err.statusCode = 403;
      throw err;
    }

    if (role === 'STAFF') {
      const isAssigned = ticket.assigned_to === user.id;
      const isDept = ticket.assigned_department_id === departmentId;
      const isQuery = isStudentQueryOrService(ticket);
      if (!isAssigned && !isDept && !isQuery) {
        const err = new Error('You do not have access to tickets outside your department.');
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

    // 2. Fetch attachment metadata
    const db = getDbClient();
    let attachment = null;

    if (db) {
      try {
        const { data } = await db
          .from('attachments')
          .select('*')
          .eq('id', attachmentId)
          .eq('ticket_id', ticketId)
          .maybeSingle();

        if (data) attachment = data;
      } catch (err) {
        logger.debug('[AttachmentService] DB query attachment error', { error: err.message });
      }
    }

    if (!attachment) {
      attachment = inMemoryAttachments.find(
        (a) => a.id === attachmentId && a.ticket_id === ticketId
      );
    }

    if (!attachment) {
      const err = new Error('Attachment not found.');
      err.statusCode = 404;
      throw err;
    }

    // 3. Recheck internal visibility: Students can NEVER download internal attachments!
    if (role === 'STUDENT' && attachment.is_internal) {
      const err = new Error('Access denied. This attachment is restricted to authorized staff.');
      err.statusCode = 403;
      throw err;
    }

    // 4. Generate signed URL or extract buffer
    let signedUrl = null;
    if (supabaseAdmin) {
      try {
        const { data: signData, error: signError } = await supabaseAdmin.storage
          .from('ticket-attachments')
          .createSignedUrl(attachment.storage_path, 60); // 60 seconds TTL

        if (!signError && signData?.signedUrl) {
          signedUrl = signData.signedUrl;
        }
      } catch (signErr) {
        logger.debug('[AttachmentService] Signed URL generation error', { error: signErr.message });
      }
    }

    // Retrieve local buffer if available
    const bufferData = inMemoryFileBuffers.get(attachment.storage_path);

    return {
      attachment,
      signedUrl,
      buffer: bufferData?.buffer || null,
      mimeType: attachment.mime_type,
      fileName: attachment.file_name,
    };
  }

  /**
   * Retrieves all attachments associated with a ticket, filtered by role and authorized access.
   */
  static async getTicketAttachments(ticketId, userOrRole, maybeRole, maybeDeptId) {
    let user = null;
    let role = 'STUDENT';
    let departmentId = null;

    if (typeof userOrRole === 'object' && userOrRole !== null) {
      user = userOrRole;
      role = maybeRole || user.role || 'STUDENT';
      departmentId = maybeDeptId || user.department_id;
    } else if (typeof userOrRole === 'string') {
      role = userOrRole;
    }

    const ticketRepo = new TicketRepository();
    const ticket = await ticketRepo.findById(ticketId);
    if (!ticket) {
      const err = new Error('Ticket not found.');
      err.statusCode = 404;
      throw err;
    }

    if (user) {
      if (role === 'STUDENT' && ticket.created_by !== user.id) {
        const err = new Error('Access denied: You cannot view attachments for another student\'s ticket.');
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
    }

    const isStudent = role === 'STUDENT';
    const db = getDbClient();

    if (db) {
      try {
        let query = db.from('attachments').select('*').eq('ticket_id', ticketId);
        if (isStudent) {
          query = query.eq('is_internal', false);
        }
        const { data } = await query;
        if (data) return data;
      } catch {}
    }

    let records = inMemoryAttachments.filter((a) => a.ticket_id === ticketId);
    if (isStudent) {
      records = records.filter((a) => !a.is_internal);
    }
    return records;
  }
}
