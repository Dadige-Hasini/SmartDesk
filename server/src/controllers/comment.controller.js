import { CommentService } from '../services/comment.service.js';
import { AttachmentService } from '../services/attachment.service.js';
import { responseHandler } from '../utils/response.js';

export class CommentController {
  /**
   * GET /api/tickets/:id/comments
   */
  static async listComments(req, res, next) {
    try {
      const ticketId = req.params.id;
      const user = req.user;
      const role = req.userRole;
      const departmentId = req.userDepartmentId;

      const comments = await CommentService.getTicketComments(ticketId, user, role, departmentId);
      return responseHandler.success(res, { comments });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/tickets/:id/comments
   */
  static async createComment(req, res, next) {
    try {
      const ticketId = req.params.id;
      const user = req.user;
      const role = req.userRole;
      const departmentId = req.userDepartmentId;

      const { content, isInternal } = req.body;

      if (!content || !content.trim()) {
        const err = new Error('Comment content cannot be empty.');
        err.statusCode = 400;
        throw err;
      }

      // Handle optional attached files uploaded via multer
      let uploadedAttachments = [];
      if (req.files && req.files.length > 0) {
        uploadedAttachments = await AttachmentService.uploadAttachments({
          files: req.files,
          ticketId,
          user,
          isInternal: isInternal === 'true' || isInternal === true,
        });
      }

      const comment = await CommentService.addComment({
        ticketId,
        content: content.trim(),
        isInternal: isInternal === 'true' || isInternal === true,
        user,
        role,
        departmentId,
        attachments: uploadedAttachments,
      });

      return responseHandler.created(res, { comment }, 'Comment added successfully');
    } catch (err) {
      next(err);
    }
  }
}
