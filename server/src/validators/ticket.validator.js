import { z } from 'zod';

export const createTicketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters long')
    .max(150, 'Title cannot exceed 150 characters'),
  description: z
    .string()
    .trim()
    .min(5, 'Description must be at least 5 characters long')
    .max(5000, 'Description cannot exceed 5000 characters'),
  categoryId: z
    .string()
    .trim()
    .optional()
    .nullable(),
  category_id: z
    .string()
    .trim()
    .optional()
    .nullable(),
  priority: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        const cap = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
        if (['Low', 'Medium', 'High', 'Urgent'].includes(cap)) return cap;
      }
      return val || 'Medium';
    }, z.enum(['Low', 'Medium', 'High', 'Urgent']))
    .default('Medium'),
  assignedDepartmentId: z
    .string()
    .trim()
    .optional()
    .nullable(),
  assigned_department_id: z
    .string()
    .trim()
    .optional()
    .nullable(),
  departmentId: z
    .string()
    .trim()
    .optional()
    .nullable(),
  tags: z
    .array(z.string().trim().max(100))
    .max(20, 'Cannot exceed 20 tags')
    .default([]),
  isConfidential: z
    .boolean()
    .default(false),
  requestType: z
    .string()
    .trim()
    .optional()
    .nullable(),
  request_type: z
    .string()
    .trim()
    .optional()
    .nullable(),
}).passthrough();

export const updateTicketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3)
    .max(150)
    .optional(),
  description: z
    .string()
    .trim()
    .min(5)
    .max(5000)
    .optional(),
  priority: z
    .enum(['Low', 'Medium', 'High', 'Urgent'])
    .optional(),
  tags: z
    .array(z.string().trim().max(30))
    .max(10)
    .optional(),
});

export const transitionStatusSchema = z.object({
  status: z.enum([
    'OPEN',
    'UNDER_REVIEW',
    'DOCUMENT_VERIFICATION',
    'IN_PROGRESS',
    'AWAITING_INFO',
    'READY_FOR_COLLECTION',
    'ISSUED',
    'RESOLVED',
    'CLOSED',
    'REJECTED',
  ]),
  resolutionSummary: z
    .string()
    .trim()
    .min(5, 'Resolution summary must be at least 5 characters long')
    .optional(),
  rejectionReason: z
    .string()
    .trim()
    .min(5, 'Rejection reason must be at least 5 characters long')
    .optional(),
  note: z.string().trim().optional(),
});

export const assignTicketSchema = z.object({
  assignedTo: z
    .string()
    .uuid('Assigned staff member must be a valid UUID'),
  note: z.string().trim().optional(),
});

export const reopenTicketSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Reopen explanation must be at least 5 characters long'),
});

export const rateTicketSchema = z.object({
  rating: z
    .number()
    .int()
    .min(1, 'Rating must be between 1 and 5 stars')
    .max(5, 'Rating must be between 1 and 5 stars'),
  feedback: z
    .string()
    .trim()
    .max(1000, 'Feedback cannot exceed 1000 characters')
    .optional(),
});

export const bulkAssignSchema = z
  .object({
    ticketIds: z
      .array(z.string().uuid())
      .min(1, 'Provide at least one ticket ID to assign')
      .max(100, 'Cannot assign more than 100 tickets in a single batch'),
    assignedTo: z.string().uuid('Assigned staff member must be a valid UUID').optional(),
    staffId: z.string().uuid('Assigned staff member must be a valid UUID').optional(),
    note: z.string().optional(),
  })
  .transform((data) => {
    const target = data.assignedTo || data.staffId;
    if (!target) {
      throw new Error('Assigned staff member must be a valid UUID');
    }
    return {
      ticketIds: data.ticketIds,
      assignedTo: target,
      note: data.note,
    };
  });

export const bulkCloseSchema = z.object({
  ticketIds: z
    .array(z.string().uuid())
    .min(1, 'Provide at least one ticket ID to close')
    .max(100, 'Cannot close more than 100 tickets in a single batch'),
  resolutionSummary: z
    .string()
    .trim()
    .min(5, 'Resolution summary is required for bulk closure'),
});

export const ticketQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  categoryId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'priority', 'status', 'ticket_number']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
});

export const reassignDepartmentSchema = z.object({
  departmentId: z
    .string()
    .uuid('Assigned department must be a valid UUID'),
  reason: z
    .string()
    .trim()
    .min(5, 'A documented reassignment reason (at least 5 characters) is required'),
  assignedTo: z
    .string()
    .uuid('Assigned staff member must be a valid UUID')
    .optional()
    .nullable(),
});

