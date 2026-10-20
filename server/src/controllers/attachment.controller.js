import { AttachmentService } from '../services/attachment.service.js';
import { responseHandler } from '../utils/response.js';

export class AttachmentController {
  /**
   * POST /api/tickets/:id/attachments
   */
  static async upload(req, res, next) {
    try {
      const ticketId = req.params.id;
      const user = req.user;
      const { isInternal } = req.body;

      if (!req.files || req.files.length === 0) {
        const err = new Error('No files provided for upload.');
        err.statusCode = 400;
        throw err;
      }

      const attachments = await AttachmentService.uploadAttachments({
        files: req.files,
        ticketId,
        user,
        isInternal: isInternal === 'true' || isInternal === true,
      });

      return responseHandler.created(res, { attachments }, 'Files uploaded successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/tickets/:id/attachments
   */
  static async list(req, res, next) {
    try {
      const ticketId = req.params.id;
      const role = req.userRole;

      const attachments = await AttachmentService.getTicketAttachments(ticketId, role);
      return responseHandler.success(res, { attachments });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/tickets/:id/attachments/:attachmentId/download
   * Rechecks parent ticket permissions and internal note isolation.
   */
  static async download(req, res, next) {
    try {
      const { id: ticketId, attachmentId } = req.params;
      const user = req.user;
      const role = req.userRole;
      const departmentId = req.userDepartmentId;

      const downloadResult = await AttachmentService.getAttachmentDownload({
        ticketId,
        attachmentId,
        user,
        role,
        departmentId,
      });

      // If signed URL is available, send URL or redirect based on query param
      if (req.query.mode === 'url' && downloadResult.signedUrl) {
        return responseHandler.success(res, { signedUrl: downloadResult.signedUrl });
      }

      if (downloadResult.buffer) {
        res.setHeader('Content-Type', downloadResult.mimeType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(downloadResult.fileName)}"`
        );
        res.setHeader('Content-Length', downloadResult.buffer.length);
        return res.end(downloadResult.buffer);
      }

      if (downloadResult.signedUrl) {
        return res.redirect(downloadResult.signedUrl);
      }

      const err = new Error('File content is unavailable.');
      err.statusCode = 404;
      throw err;
    } catch (err) {
      next(err);
    }
  }
}
