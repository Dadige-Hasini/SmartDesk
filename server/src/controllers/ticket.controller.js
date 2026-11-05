import { ticketService } from '../services/ticket.service.js';
import {
  createTicketSchema,
  updateTicketSchema,
  transitionStatusSchema,
  assignTicketSchema,
  reopenTicketSchema,
  rateTicketSchema,
  bulkAssignSchema,
  bulkCloseSchema,
  ticketQuerySchema,
  reassignDepartmentSchema,
} from '../validators/ticket.validator.js';

import { sendSuccess } from '../utils/response.js';
import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import { CATEGORIES } from '../ml/taxonomy.js';

export class TicketController {
  /**
   * POST /api/tickets
   */
  async createTicket(req, res, next) {
    try {
      const validated = createTicketSchema.parse(req.body);
      const ticket = await ticketService.createTicket(validated, req.profile);
      return sendSuccess(res, 'Ticket raised successfully', ticket, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/tickets/:id
   */
  async getTicket(req, res, next) {
    try {
      const ticket = await ticketService.getTicket(req.params.id, req.profile);
      return sendSuccess(res, 'Ticket details retrieved successfully', ticket, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/tickets
   */
  async listTickets(req, res, next) {
    try {
      const validatedQuery = ticketQuerySchema.parse(req.query);
      const result = await ticketService.listTickets(validatedQuery, req.profile);
      return sendSuccess(res, 'Tickets retrieved successfully', result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/tickets/:id
   */
  async updateTicket(req, res, next) {
    try {
      const validated = updateTicketSchema.parse(req.body);
      const ticket = await ticketService.getTicket(req.params.id, req.profile);

      // Student can only edit if status is OPEN
      if (req.profile.role === 'STUDENT' && ticket.status !== 'OPEN') {
        const err = new Error('Tickets can only be edited while in OPEN status.');
        err.statusCode = 400;
        err.code = 'TICKET_LOCKED';
        throw err;
      }

      const updated = await ticketService.updateTicketDetails(req.params.id, validated, req.profile);
      return sendSuccess(res, 'Ticket updated successfully', updated, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/tickets/:id/status
   */
  async transitionStatus(req, res, next) {
    try {
      const validated = transitionStatusSchema.parse(req.body);
      const updated = await ticketService.transitionStatus(req.params.id, validated, req.profile);
      return sendSuccess(res, `Ticket status transitioned to ${validated.status}`, updated, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/tickets/:id/claim
   */
  async claimTicket(req, res, next) {
    try {
      const updated = await ticketService.claimTicket(req.params.id, req.profile);
      return sendSuccess(res, 'Ticket claimed successfully', updated, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/tickets/:id/assign
   */
  async assignTicket(req, res, next) {
    try {
      const validated = assignTicketSchema.parse(req.body);
      const updated = await ticketService.assignTicket(req.params.id, validated, req.profile);
      return sendSuccess(res, 'Ticket assigned successfully', updated, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/tickets/:id/reassign-department
   */
  async reassignDepartment(req, res, next) {
    try {
      const validated = reassignDepartmentSchema.parse(req.body);
      const updated = await ticketService.reassignDepartment(req.params.id, validated, req.profile);
      return sendSuccess(res, 'Ticket department reassigned successfully', updated, 200);
    } catch (err) {
      next(err);
    }
  }


  /**
   * POST /api/tickets/:id/reopen
   */
  async reopenTicket(req, res, next) {
    try {
      const validated = reopenTicketSchema.parse(req.body);
      const updated = await ticketService.reopenTicket(req.params.id, validated, req.profile);
      return sendSuccess(res, 'Ticket reopened successfully', updated, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/tickets/:id/rate
   */
  async rateTicket(req, res, next) {
    try {
      const validated = rateTicketSchema.parse(req.body);
      const rating = await ticketService.rateTicket(req.params.id, validated, req.profile);
      return sendSuccess(res, 'Rating recorded. Thank you for your feedback!', rating, 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/tickets/bulk/assign
   */
  async bulkAssign(req, res, next) {
    try {
      const validated = bulkAssignSchema.parse(req.body);
      const result = await ticketService.bulkAssign(validated, req.profile);
      return sendSuccess(res, `Successfully assigned ${result.length} tickets`, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/tickets/bulk/close
   */
  async bulkClose(req, res, next) {
    try {
      const validated = bulkCloseSchema.parse(req.body);
      const result = await ticketService.bulkClose(validated, req.profile);
      return sendSuccess(res, `Successfully closed ${result.length} tickets`, result, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/tickets/export/csv
   */
  async exportCsv(req, res, next) {
    try {
      const validatedQuery = ticketQuerySchema.parse(req.query);
      const csv = await ticketService.exportTicketsCsv(validatedQuery, req.profile);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="smartdesk-tickets-${Date.now()}.csv"`);
      return res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/tickets/meta/categories
   */
  async getCategories(req, res, next) {
    try {
      const canonicalCategories = CATEGORIES.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        description: c.description,
        default_department_code: c.defaultDepartmentCode,
      }));

      const db = supabaseAdmin || supabaseClient;
      if (!db) {
        return sendSuccess(res, 'Categories retrieved (canonical fallback)', canonicalCategories);
      }

      const { data, error } = await db
        .from('categories')
        .select(`
          id, name, code, description,
          routing:category_routing_rules(default_department_id, default_priority)
        `)
        .eq('is_active', true)
        .order('name');

      if (error || !data || data.length === 0) {
        return sendSuccess(res, 'Categories retrieved (canonical list)', canonicalCategories);
      }

      return sendSuccess(res, 'Active categories retrieved successfully', data, 200);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/tickets/stats/dashboard
   */
  async getDashboardStats(req, res, next) {
    try {
      const stats = await ticketService.getDashboardStats(req.profile);
      return sendSuccess(res, 'Dashboard statistics retrieved successfully', stats, 200);
    } catch (err) {
      next(err);
    }
  }
}

export const ticketController = new TicketController();
