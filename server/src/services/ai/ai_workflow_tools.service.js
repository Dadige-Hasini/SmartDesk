import { ticketRepository } from '../../repositories/ticket.repository.js';
import { ticketService } from '../ticket.service.js';
import { CommentService } from '../comment.service.js';
import { slaService } from '../sla.service.js';
import { adminService } from '../admin.service.js';
import { ticketClassificationService } from '../../ml/ticket_classification/ticket_classification_service.js';
import { formatToIST } from '../../utils/date.js';
import { auditService, AUDIT_ACTIONS } from '../audit.service.js';
import { logger } from '../../utils/logger.js';
import { inMemoryKnowledgeDocs, inMemoryDocumentChunks } from './rag.service.js';

// Sensitive grievance patterns requiring mandatory confidential review
const SENSITIVE_GRIEVANCE_REGEX = /\b(harassment|ragging|sexual|discrimination|assault|abuse|threat|blackmail|mental health|crisis|extortion|bribe)\b/i;

// Fee transaction discrepancy patterns
const FEE_DISCREPANCY_REGEX = /\b(charged twice|double debit|double charge|debited|deducted|money deducted|unauthorized charge|payment failed|duplicate payment|refund|fee payment|tuition fee)\b/i;

// Urgent examination deadline patterns
const EXAM_DEADLINE_REGEX = /\b(exam today|exam tomorrow|missed exam|hall ticket not generated|hall ticket missing|examination clash|admit card missing)\b/i;

export const TOOL_DEFINITIONS = [
  {
    name: 'get_ticket_status',
    description: 'Retrieve live status, priority, and department details for a specific ticket. Requires authenticated student ownership.',
    parameters: {
      type: 'object',
      properties: {
        ticketNumberOrId: { type: 'string', description: 'Ticket number (TKT-YYYYMMDD-XXXX), demo ID (SD-DEMO-XXXX), or UUID' },
      },
      required: ['ticketNumberOrId'],
    },
    permission: 'OWNER_OR_ADMIN',
  },
  {
    name: 'get_sla_explanation',
    description: 'Explain target SLA deadlines, elapsed status, and any escalation state for a ticket without unverified promises. Requires authenticated student ownership.',
    parameters: {
      type: 'object',
      properties: {
        ticketNumberOrId: { type: 'string', description: 'Ticket number (TKT-YYYYMMDD-XXXX), demo ID, or UUID' },
      },
      required: ['ticketNumberOrId'],
    },
    permission: 'OWNER_OR_ADMIN',
  },
  {
    name: 'get_ticket_resolution',
    description: 'Retrieve public resolution summary and staff updates for a resolved ticket. Internal staff notes are strictly excluded. Requires authenticated student ownership.',
    parameters: {
      type: 'object',
      properties: {
        ticketNumberOrId: { type: 'string', description: 'Ticket number (TKT-YYYYMMDD-XXXX), demo ID, or UUID' },
      },
      required: ['ticketNumberOrId'],
    },
    permission: 'OWNER_OR_ADMIN',
  },
  {
    name: 'get_info_request_details',
    description: 'Explain what information the assigned department team requested on an AWAITING_INFO ticket. Requires authenticated student ownership.',
    parameters: {
      type: 'object',
      properties: {
        ticketNumberOrId: { type: 'string', description: 'Ticket number (TKT-YYYYMMDD-XXXX), demo ID, or UUID' },
      },
      required: ['ticketNumberOrId'],
    },
    permission: 'OWNER_OR_ADMIN',
  },
  {
    name: 'reply_to_ticket',
    description: 'Submit student information or clarification reply to an active ticket. Requires authenticated student ownership.',
    parameters: {
      type: 'object',
      properties: {
        ticketNumberOrId: { type: 'string', description: 'Ticket number (TKT-YYYYMMDD-XXXX), demo ID, or UUID' },
        message: { type: 'string', description: 'The student reply or requested details (min 3 chars)' },
      },
      required: ['ticketNumberOrId', 'message'],
    },
    permission: 'OWNER',
  },
  {
    name: 'prepare_ticket_draft',
    description: 'Analyze inquiry, collect missing information, predict category and department, explain priority and routing, and show complete draft requiring confirmation.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Proposed ticket title' },
        description: { type: 'string', description: 'Full description of the student inquiry or issue' },
        categoryHint: { type: 'string', description: 'Optional student category preference or correction' },
        departmentHint: { type: 'string', description: 'Optional student department preference or correction' },
        isSensitive: { type: 'boolean', description: 'Flag if the inquiry involves sensitive grievance, harassment, or confidential welfare' },
      },
      required: ['description'],
    },
    permission: 'STUDENT_OR_ADMIN',
  },
  {
    name: 'confirm_and_create_ticket',
    description: 'Execute official ticket submission ONLY after explicit student review and confirmation. Requires confirmed=true.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Confirmed title' },
        description: { type: 'string', description: 'Confirmed description' },
        categoryId: { type: 'string', description: 'Confirmed category ID' },
        assignedDepartmentId: { type: 'string', description: 'Confirmed department ID' },
        priority: { type: 'string', description: 'Priority level (Low, Medium, High, Urgent)' },
        isConfidential: { type: 'boolean', description: 'Confidential grievance flag' },
        confirmed: { type: 'boolean', description: 'Must be explicitly true to confirm submission' },
      },
      required: ['title', 'description', 'confirmed'],
    },
    permission: 'STUDENT_OR_ADMIN',
  },
  {
    name: 'handoff_to_human',
    description: 'Route student to human staff when evidence is insufficient, confidence is low, or sensitive review is required.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for human handoff (low_confidence, insufficient_evidence, sensitive_grievance, explicit_request)' },
        departmentCode: { type: 'string', description: 'Suggested department code' },
        categoryId: { type: 'string', description: 'Category ID' },
      },
      required: ['reason'],
    },
    permission: 'PUBLIC',
  },
  {
    name: 'search_faqs_offline',
    description: 'Deterministic non-AI keyword search over approved FAQs when LLM or embeddings are unavailable.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term or keywords' },
      },
      required: ['query'],
    },
    permission: 'PUBLIC',
  },
];

export class AiWorkflowToolsService {
  /**
   * Verify authenticated student ticket ownership
   * Returns { isOwner: boolean, ticket: Object | null, error?: string }
   */
  async verifyOwnership(ticketNumberOrId, userProfile) {
    if (!ticketNumberOrId) {
      return { isOwner: false, ticket: null, error: 'Ticket identifier is required.' };
    }

    const ticket = await ticketRepository.findById(ticketNumberOrId);
    if (!ticket) {
      return { isOwner: false, ticket: null, error: `Ticket '${ticketNumberOrId}' not found.` };
    }

    if (!userProfile) {
      return { isOwner: false, ticket, error: 'Authentication required. Please sign in to access ticket details.' };
    }

    const isOwner = ticket.created_by === userProfile.id || userProfile.role === 'SUPER_ADMIN';
    return { isOwner, ticket };
  }

  /**
   * Workflow 3: Ticket Status with Ownership Verification
   */
  async getTicketStatus({ ticketNumberOrId }, userProfile) {
    const { isOwner, ticket, error } = await this.verifyOwnership(ticketNumberOrId, userProfile);

    if (error && !ticket) {
      return {
        success: false,
        code: 'NOT_FOUND',
        message: error,
      };
    }

    if (!isOwner) {
      logger.warn('[AiWorkflowTools] Unauthorized access attempt to ticket status', {
        ticketRef: ticketNumberOrId,
        userId: userProfile?.id || 'anonymous',
      });
      return {
        success: false,
        isAuthorized: false,
        code: 'FORBIDDEN',
        error: `Unauthorized: You do not own ticket ${ticket.ticket_number || ticket.demo_id}.`,
        message: `For student privacy and security, I cannot disclose details about ticket ${ticket.ticket_number || ticket.demo_id}. Ticket status information can only be viewed by the student who created the ticket or authorized departmental staff.`,
        suggestedActions: [
          { label: 'View My Tickets', action: 'VIEW_MY_TICKETS', description: 'Go to your student tickets dashboard' },
        ],
      };
    }

    const statusExplanations = {
      OPEN: 'Your ticket is currently queued and awaiting triage assignment by the department.',
      IN_PROGRESS: 'Your ticket is actively being investigated and worked on by departmental staff.',
      AWAITING_INFO: 'Department staff have reviewed your ticket and requested additional clarification or supporting documents from you.',
      RESOLVED: `Your ticket has been marked resolved by departmental staff.${ticket.resolution_summary ? ` Resolution summary: "${ticket.resolution_summary}"` : ''}`,
      CLOSED: 'This ticket is closed. If your issue persists, you may request reopening within 7 calendar days of resolution.',
      REJECTED: `This ticket was rejected.${ticket.rejection_reason ? ` Reason: "${ticket.rejection_reason}"` : ''}`,
    };

    const explanation = statusExplanations[ticket.status] || `Current status is ${ticket.status}.`;
    const assignedDeptName = ticket.assigned_department?.name || 'Assigned Department';

    return {
      success: true,
      isAuthorized: true,
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number || ticket.demo_id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        department: assignedDeptName,
        createdAtIST: ticket.created_at ? formatToIST(ticket.created_at) : null,
        updatedAtIST: ticket.updated_at ? formatToIST(ticket.updated_at) : null,
        explanation,
        statusExplanation: explanation,
      },
      message: `Here is the current status of your ticket **${ticket.demo_id && ticket.ticket_number && ticket.ticket_number !== ticket.demo_id ? `${ticket.ticket_number} (${ticket.demo_id})` : (ticket.ticket_number || ticket.demo_id)}** ("${ticket.title}"):\n\n• **Status**: ${ticket.status}\n• **Priority**: ${ticket.priority}\n• **Assigned Department**: ${assignedDeptName}\n• **Progress**: ${explanation}`,
    };
  }

  /**
   * Workflow 6: SLA Explanation
   * Reads active ticket's actual SLA fields without promising an unverified outcome.
   */
  async getSlaExplanation({ ticketNumberOrId }, userProfile) {
    const { isOwner, ticket, error } = await this.verifyOwnership(ticketNumberOrId, userProfile);

    if (error && !ticket) {
      return { success: false, code: 'NOT_FOUND', error, message: error };
    }

    if (!isOwner) {
      return {
        success: false,
        isAuthorized: false,
        code: 'FORBIDDEN',
        error: `Unauthorized: You do not own ticket ${ticket.ticket_number || ticket.demo_id}.`,
        message: 'For student privacy, SLA details can only be viewed by the student who raised this ticket.',
      };
    }

    const evaluation = slaService.evaluateTicketSlaStatus(ticket);
    const assignedDeptName = ticket.assigned_department?.name || 'Department Staff';

    const resolutionDueIst = ticket.resolution_due_at || ticket.sla_due_at
      ? formatToIST(ticket.resolution_due_at || ticket.sla_due_at)
      : 'Standard policy window';

    const firstResponseDueIst = ticket.first_response_due_at
      ? formatToIST(ticket.first_response_due_at)
      : 'Within 8 business hours';

    let healthStatusText = 'On Track';
    if (evaluation.isOverdue) healthStatusText = 'Exceeded Resolution Target (Flagged as Overdue for priority attention)';
    else if (evaluation.isEscalated) healthStatusText = 'Escalated to Department Supervision (Level 1 Escalation)';
    else if (evaluation.isApproaching) healthStatusText = 'Approaching Resolution Target (80% window elapsed)';

    // Strict Anti-Promise Constraint (Requirement 6)
    const disclaimer = 'Please note: This represents active institutional SLA service targets and triage priority. Resolution depends on verified administrative processing, and does not promise or guarantee an unverified outcome.';

    const message = `SLA and Timeline Details for ticket **${ticket.ticket_number || ticket.demo_id}** ("${ticket.title}"):

• **Priority Level**: ${ticket.priority} (${ticket.policy_label || 'Demonstration Target (sla_policies.json)'})
• **Target Resolution Deadline**: ${resolutionDueIst} (Asia/Kolkata)
• **First Response Target**: ${firstResponseDueIst} (Asia/Kolkata)
• **Current SLA Health**: ${healthStatusText}
• **Assigned Resolving Unit**: ${assignedDeptName}

${disclaimer}`;

    return {
      success: true,
      isAuthorized: true,
      slaDetails: {
        ticketNumber: ticket.ticket_number || ticket.demo_id,
        priority: ticket.priority,
        policyLabel: ticket.policy_label || 'Demonstration Target (sla_policies.json)',
        policyName: ticket.sla_policy?.name || ticket.policy_label || 'Standard Institutional Policy',
        resolutionDueAtUTC: ticket.resolution_due_at || ticket.sla_due_at,
        resolutionDueAtIST: resolutionDueIst,
        resolutionTargetIST: resolutionDueIst,
        firstResponseDueAtIST: firstResponseDueIst,
        isOverdue: Boolean(ticket.is_overdue || evaluation.isOverdue),
        isEscalated: Boolean(ticket.is_escalated || evaluation.isEscalated),
        escalationLevel: ticket.escalation_level ?? (ticket.is_escalated ? 1 : 0),
        slaHealth: evaluation.status === 'ON_TRACK' ? 'HEALTHY' : (evaluation.status || 'HEALTHY'),
        healthStatus: evaluation.status === 'ON_TRACK' ? 'HEALTHY' : (evaluation.status || 'HEALTHY'),
        elapsedPercentage: evaluation.elapsedPercentage,
        timeRemainingMinutes: evaluation.timeRemainingMinutes,
        disclaimer,
      },
      message,
    };
  }

  /**
   * Workflow 5: Resolution Communication
   * Summarizes staff-approved public updates in clear language. Never reveals internal notes.
   */
  async getTicketResolution({ ticketNumberOrId }, userProfile) {
    const { isOwner, ticket, error } = await this.verifyOwnership(ticketNumberOrId, userProfile);

    if (error && !ticket) {
      return { success: false, code: 'NOT_FOUND', message: error };
    }

    if (!isOwner) {
      return {
        success: false,
        isAuthorized: false,
        code: 'FORBIDDEN',
        message: 'Resolution details can only be viewed by the student who raised this ticket.',
      };
    }

    if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
      return {
        success: true,
        isResolved: false,
        status: ticket.status,
        message: `Ticket ${ticket.ticket_number || ticket.demo_id} is currently ${ticket.status} and has not yet been marked resolved by staff.`,
      };
    }

    // Retrieve public comments strictly isolating internal notes (Requirement 13)
    let publicComments = [];
    try {
      publicComments = await CommentService.getTicketComments(
        ticket.id,
        userProfile,
        'STUDENT',
        userProfile.department_id
      );
      // Double check filter: never leak internal notes
      publicComments = publicComments.filter((c) => !c.is_internal);
    } catch {
      publicComments = [];
    }

    const resolvedAtIst = ticket.resolved_at ? formatToIST(ticket.resolved_at) : 'Recently';
    const resolutionSummary = ticket.resolution_summary || 'The assigned department has completed triage and resolved the issue.';

    // Explain 7-day single reopen policy (Requirement 15)
    const reopenNotice = 'If this resolution does not fully address your issue, college policy permits you to request reopening this ticket once within 7 days (7-day window) of the resolution date.';

    const latestPublicNote = publicComments.length > 0 ? publicComments[publicComments.length - 1].content : '';
    const publicSummary = latestPublicNote || resolutionSummary;

    const message = `Official Resolution for Ticket **${ticket.ticket_number || ticket.demo_id}** ("${ticket.title}"):

• **Status**: ${ticket.status} (Resolved on ${resolvedAtIst})
• **Official Resolution Summary**: "${resolutionSummary}"
• **Public Updates from Staff**: ${publicSummary}

${reopenNotice}`;

    return {
      success: true,
      isResolved: true,
      resolution: {
        ticketNumber: ticket.ticket_number || ticket.demo_id,
        status: ticket.status,
        resolvedAtIST: resolvedAtIst,
        resolutionSummary,
        publicSummary,
        reopenPermitted: true,
        reopenNotice,
        reopenPolicy: reopenNotice,
      },
      message,
    };
  }

  /**
   * Workflow 4: Request for More Information
   * Explains what the assigned team needs and allows a student reply.
   */
  async getInfoRequestDetails({ ticketNumberOrId }, userProfile) {
    const { isOwner, ticket, error } = await this.verifyOwnership(ticketNumberOrId, userProfile);

    if (error && !ticket) {
      return { success: false, code: 'NOT_FOUND', message: error };
    }

    if (!isOwner) {
      return {
        success: false,
        isAuthorized: false,
        code: 'FORBIDDEN',
        message: 'Ticket details can only be viewed by the ticket creator.',
      };
    }

    if (ticket.status !== 'AWAITING_INFO') {
      return {
        success: true,
        isAwaitingInfo: false,
        status: ticket.status,
        message: `Ticket ${ticket.ticket_number || ticket.demo_id} is currently in status ${ticket.status}, not awaiting information.`,
      };
    }

    // Retrieve public staff comments to extract what information was requested
    let publicComments = [];
    try {
      publicComments = await CommentService.getTicketComments(
        ticket.id,
        userProfile,
        'STUDENT',
        userProfile.department_id
      );
      publicComments = publicComments.filter((c) => !c.is_internal);
    } catch {
      publicComments = [];
    }

    const latestRequest = publicComments.length > 0
      ? publicComments[publicComments.length - 1].content
      : 'Please provide supporting documents, challan receipts, or roll number clarification as requested by the department.';

    const assignedDept = ticket.assigned_department?.name || 'Department Team';

    const message = `The **${assignedDept}** has reviewed ticket **${ticket.ticket_number || ticket.demo_id}** and requested additional clarification from you:

• **Information Needed**: "${latestRequest}"

You can reply directly in this chat or on your ticket dashboard to send the requested details back to the department staff.`;

    return {
      success: true,
      isAwaitingInfo: true,
      details: {
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number || ticket.demo_id,
        department: assignedDept,
        status: ticket.status,
        requestSummary: latestRequest,
        requestedInformation: latestRequest,
      },
      suggestedActions: [
        { label: 'Submit Reply', action: 'REPLY_TICKET', description: 'Send your reply directly to the department' },
      ],
      message,
    };
  }

  /**
   * Workflow 4 (Reply): Allow student reply to ticket
   */
  async replyToTicket({ ticketNumberOrId, message }, userProfile) {
    if (!message || message.trim().length < 3) {
      return {
        success: false,
        code: 'INVALID_ARGUMENTS',
        message: 'Your reply message must be at least 3 characters long.',
      };
    }

    const { isOwner, ticket, error } = await this.verifyOwnership(ticketNumberOrId, userProfile);

    if (error && !ticket) {
      return { success: false, code: 'NOT_FOUND', message: error };
    }

    if (!isOwner) {
      return {
        success: false,
        isAuthorized: false,
        code: 'FORBIDDEN',
        message: 'You can only reply to tickets that you created.',
      };
    }

    if (['CLOSED', 'REJECTED'].includes(ticket.status)) {
      return {
        success: false,
        code: 'TICKET_CLOSED',
        message: `Cannot reply to a ${ticket.status.toLowerCase()} ticket. Please request reopening first.`,
      };
    }

    // Add public comment
    const comment = await CommentService.addComment({
      ticketId: ticket.id,
      content: message.trim(),
      isInternal: false,
      user: userProfile,
      role: 'STUDENT',
      departmentId: userProfile.department_id,
    });

    return {
      success: true,
      commentId: comment.id,
      ticketNumber: ticket.ticket_number || ticket.demo_id,
      message: `Your reply has been submitted to ticket **${ticket.ticket_number || ticket.demo_id}**. Department staff will be notified of your update.`,
    };
  }

  /**
   * Workflow 2 & 7 & 9: Ticket Creation (Collect missing info, predict category & department, explain priority & routing, show draft)
   */
  async prepareTicketDraft({ title, description, categoryHint = null, departmentHint = null, isSensitive = false }, userProfile) {
    if (!description || description.trim().length === 0) {
      return {
        success: false,
        requiresMissingInfo: true,
        missingFields: ['description'],
        prompt: 'To prepare a support ticket draft, please describe what issue you are experiencing or what assistance you need.',
      };
    }

    const cleanDesc = description.trim();

    // 1. Check for missing information (Requirement 2)
    const missingInfoItems = [];
    if (cleanDesc.length < 15) {
      missingInfoItems.push('More details regarding the specific issue or error message encountered');
    }

    const isWifiQuery = /wifi|network|router|internet/i.test(cleanDesc);
    const hasLocation = /\b(hostel|block|room|hall|building|floor|lab|library)\b/i.test(cleanDesc);
    if (isWifiQuery && !hasLocation) {
      missingInfoItems.push('Hostel block / room number or campus building location');
    }

    const isFeeQuery = /fee|scholarship|payment|receipt|refund/i.test(cleanDesc);
    const hasReference = /\b(txn|transaction|challan|receipt|ref|sem|semester|roll|id)\b/i.test(cleanDesc);
    if (isFeeQuery && !hasReference) {
      missingInfoItems.push('Semester, transaction reference, or receipt number');
    }

    const isExamQuery = /exam|hall ticket|admit card|result|grade/i.test(cleanDesc);
    const hasSubjectCode = /\b(subject|course|sem|code|paper|date)\b/i.test(cleanDesc);
    if (isExamQuery && !hasSubjectCode) {
      missingInfoItems.push('Subject name, course code, or examination date');
    }

    // 2. Sensitive Grievance Detection (Requirement 9)
    const isSensitiveCase = Boolean(
      isSensitive || SENSITIVE_GRIEVANCE_REGEX.test(cleanDesc) || SENSITIVE_GRIEVANCE_REGEX.test(title || '')
    );

    // 3. Department Routing & Classification (Requirement 2 & 7)
    let routingOutcome;
    try {
      routingOutcome = await ticketClassificationService.classifyAndRoute({
        title: title || cleanDesc.slice(0, 60),
        description: cleanDesc,
      }, { userProfile });
    } catch {
      routingOutcome = {
        category: 'OTHER',
        confidence: 0.5,
        department: 'STU',
        priority: 'P3',
        departmentName: 'Student Affairs',
      };
    }

    const isWifiIssue = /wifi|wi-fi|router|campus-secure|laptop.*connect|mac address|network/i.test(cleanDesc);
    if (isWifiIssue && !departmentHint) {
      routingOutcome.department = 'IT';
      routingOutcome.departmentName = 'Information Technology (IT Services)';
      routingOutcome.category = 'HOSTEL_WIFI';
      routingOutcome.priority = 'P3';
    }

    // Apply student corrections if provided (Requirement 7)
    if (departmentHint) {
      const allDepts = await adminService.listDepartments();
      const matchedDept = allDepts.find(
        (d) => d.code?.toUpperCase() === departmentHint.toUpperCase() ||
          d.name?.toLowerCase().includes(departmentHint.toLowerCase())
      );
      if (matchedDept) {
        routingOutcome.department = matchedDept.code;
        routingOutcome.departmentName = matchedDept.name;
        routingOutcome.departmentId = matchedDept.id;
        routingOutcome.routingReason = `Department adjusted to ${matchedDept.name} based on your preference.`;
      }
    }

    // Match database UUIDs for department and category
    const allDepartments = await adminService.listDepartments();
    const allCategories = await adminService.listCategories();

    let matchedDept = allDepartments.find((d) => {
      if (d.code === routingOutcome.department) return true;
      if (d.name?.toLowerCase() === routingOutcome.departmentName?.toLowerCase()) return true;
      if (routingOutcome.department === 'FEE' && (d.code === 'FIN' || /finance|fee|accounts/i.test(d.name))) return true;
      if (routingOutcome.department === 'IT' && (d.code === 'IT' || d.code === 'CSE' || /it|computer|technology/i.test(d.name))) return true;
      if (routingOutcome.department === 'EXAM' && (d.code === 'EXAM' || /exam/i.test(d.name))) return true;
      if (routingOutcome.department === 'HOSTEL' && (d.code === 'HOSTEL' || /hostel/i.test(d.name))) return true;
      if (routingOutcome.department === 'LIB' && (d.code === 'LIB' || /library/i.test(d.name))) return true;
      if (routingOutcome.department === 'STU' && (d.code === 'STU' || /student affairs|grievance/i.test(d.name))) return true;
      return false;
    });

    if (!matchedDept) {
      if (isFeeQuery) {
        matchedDept = allDepartments.find((d) => d.code === 'FIN' || /finance|fee|accounts/i.test(d.name));
      }
    }
    if (!matchedDept) {
      matchedDept = allDepartments[0];
    }

    let matchedCat = allCategories.find((c) => {
      if (c.code === routingOutcome.category || c.name === routingOutcome.category) return true;
      if (isFeeQuery && /fee|payment|scholarship|dues/i.test((c.code || '') + ' ' + (c.name || ''))) return true;
      if (/wifi|network|router|internet|login|lms/i.test(cleanDesc) && /wifi|network/i.test((c.code || '') + ' ' + (c.name || ''))) return true;
      if (/exam|grade|hall ticket|admit card|result/i.test(cleanDesc) && /exam|grade/i.test((c.code || '') + ' ' + (c.name || ''))) return true;
      return false;
    });

    if (!matchedCat) {
      matchedCat = allCategories[0];
    }

    // Priority mapping & explanation
    let priority = 'Medium';
    let priorityExplanation = 'Standard resolution target within 72 hours under institutional SLA guidelines.';

    if (isSensitiveCase) {
      // Sensitive Grievance: Force confidential workflow (Requirement 9)
      priority = 'Urgent';
      priorityExplanation = 'Urgent priority — Sensitive grievance or welfare concern requiring expedited human review by the Student Affairs Grievance Officer.';
      matchedDept = allDepartments.find((d) => d.code === 'STU' || /affairs|grievance/i.test(d.name)) || {
        id: '77777777-7777-7777-7777-777777777777',
        name: 'Student Affairs & Grievance Cell',
        code: 'STU',
        is_active: true,
      };
      matchedCat = allCategories.find((c) => c.code === 'GRIEVANCE' || /grievance/i.test(c.name)) || {
        id: 'cat-grievance',
        name: 'Sensitive Grievance & Student Welfare',
        code: 'GRIEVANCE',
        is_active: true,
      };
      routingOutcome.department = 'STU';
      routingOutcome.departmentName = matchedDept.name;
      routingOutcome.departmentId = matchedDept.id;
      routingOutcome.category = 'GRIEVANCE';
      routingOutcome.routingReason = 'Strictly routed to Student Affairs and Grievance Cell under confidential grievance protocol.';
    } else if (FEE_DISCREPANCY_REGEX.test(cleanDesc)) {
      priority = 'High';
      priorityExplanation = 'High priority — Financial transaction or fee discrepancy requiring reconciliation by Accounts Section.';
    } else if (EXAM_DEADLINE_REGEX.test(cleanDesc)) {
      priority = 'Urgent';
      priorityExplanation = 'Urgent priority — Urgent examination deadline or missing hall ticket requiring emergency triage.';
    } else if (routingOutcome.priority === 'P1') {
      priority = 'Urgent';
      priorityExplanation = 'Urgent priority — Time-sensitive case assigned P1 under institutional routing rules.';
    } else if (routingOutcome.priority === 'P2') {
      priority = 'High';
      priorityExplanation = 'High priority — Standard high priority item under departmental triage policies.';
    }

    const proposedTitle = title?.trim() || cleanDesc.split('\n')[0].slice(0, 75);

    // Routing explanation (Requirement 7)
    const routingExplanation = routingOutcome.routingReason ||
      `Routed to ${matchedDept.name} because this inquiry pertains to ${matchedCat.name || 'this domain'}.`;

    const draft = {
      title: proposedTitle,
      description: cleanDesc,
      categoryId: matchedCat.id,
      categoryName: matchedCat.name,
      category: matchedCat.code || routingOutcome.category,
      assignedDepartmentId: matchedDept.id,
      departmentId: matchedDept.id,
      departmentName: matchedDept.name,
      departmentCode: matchedDept.code,
      priority,
      priorityCode: priority === 'Urgent' ? 'P1' : priority === 'High' ? 'P2' : priority === 'Medium' ? 'P3' : 'P4',
      priorityExplanation,
      routingExplanation,
      isConfidential: isSensitiveCase,
      isSensitive: isSensitiveCase,
      requiresConfirmation: true,
      confirmed: false,
      missingInformation: missingInfoItems.length > 0 ? missingInfoItems : null,
    };

    let introText = `I have prepared a complete support ticket draft for you:`;
    if (isSensitiveCase) {
      introText = `**Confidential Grievance Protocol Activated**:
To protect your privacy and personal safety, do NOT share distressing or sensitive personal details in this general chat. I have prepared a safe and confidential grievance ticket draft that will be routed strictly to authorized Student Affairs & Grievance Officers.`;
    }

    const message = `${introText}

• **Proposed Title**: ${draft.title}
• **Predicted Category**: ${draft.categoryName}
• **Suggested Department**: ${draft.departmentName}
  *Routing Reason*: ${draft.routingExplanation}
• **Priority Level**: ${draft.priority}
  *Priority Reason*: ${draft.priorityExplanation}
• **Confidential Mode**: ${draft.isConfidential ? 'YES (Restricted to Grievance Officers & Creator)' : 'Standard'}
${draft.missingInformation ? `\n*Note*: The department may ask for: ${draft.missingInformation.join('; ')}.` : ''}

**Important**: AI drafts never submit automatically. Please review and confirm your details before submission before this ticket is officially created.`;

    return {
      success: true,
      requiresConfirmation: true,
      draft,
      suggestedActions: [
        { label: 'Confirm & Submit Ticket', action: 'CONFIRM_TICKET', description: 'Submit this ticket directly to the department' },
        { label: 'Edit Draft in Ticket Form', action: 'OPEN_TICKET', description: 'Open creation form to modify details' },
      ],
      message,
    };
  }

  /**
   * Workflow 2 (Submission): Confirm and create ticket
   * Server validates student confirmation before executing.
   */
  async confirmAndCreateTicket(draftData, userProfile) {
    if (!draftData || draftData.confirmed !== true) {
      return {
        success: false,
        code: 'CONFIRMATION_REQUIRED',
        error: 'Explicit student confirmation is required before submitting a ticket. Please confirm the draft.',
        message: 'Explicit student confirmation is required before submitting a ticket. Please confirm the draft.',
      };
    }

    if (!userProfile) {
      return {
        success: false,
        code: 'AUTHENTICATION_REQUIRED',
        error: 'You must be signed in with your student account to submit a ticket.',
        message: 'You must be signed in with your student account to submit a ticket.',
      };
    }

    if (!draftData.title || draftData.title.trim().length < 3) {
      return { success: false, code: 'INVALID_TITLE', error: 'Ticket title must be at least 3 characters.', message: 'Ticket title must be at least 3 characters.' };
    }

    if (!draftData.description || draftData.description.trim().length < 5) {
      return { success: false, code: 'INVALID_DESCRIPTION', error: 'Ticket description must be at least 5 characters.', message: 'Ticket description must be at least 5 characters.' };
    }

    const assignedDeptId = draftData.assignedDepartmentId || draftData.departmentId || draftData.department_id;
    const catId = draftData.categoryId || draftData.category;

    const newTicket = await ticketService.createTicket(
      {
        title: draftData.title.trim(),
        description: draftData.description.trim(),
        categoryId: catId,
        category_id: catId,
        assignedDepartmentId: assignedDeptId,
        department_id: assignedDeptId,
        priority: draftData.priority || 'Medium',
        isConfidential: Boolean(draftData.isConfidential),
        tags: draftData.isConfidential ? ['confidential', 'grievance'] : [],
      },
      userProfile
    );

    return {
      success: true,
      ticket: {
        ...newTicket,
        id: newTicket.id,
        ticketNumber: newTicket.ticket_number,
        ticket_number: newTicket.ticket_number,
        title: newTicket.title,
        status: newTicket.status,
        priority: newTicket.priority,
        isConfidential: newTicket.is_confidential,
        is_confidential: newTicket.is_confidential,
        department_id: newTicket.department_id || newTicket.assigned_department_id,
        slaDueAtIST: newTicket.sla_due_at ? formatToIST(newTicket.sla_due_at) : null,
      },
      message: `Your ticket **#${newTicket.ticket_number}** has been successfully created and submitted to the department! You can track its live progress on your student dashboard.`,
    };
  }

  /**
   * Workflow 8: Human Handoff
   * Provides a clear route to staff when evidence is insufficient or confidence is low.
   */
  async handoffToHuman({ reason = 'insufficient_evidence', departmentCode = null, categoryId = null }, userProfile) {
    const contactDirectory = {
      IT: { name: 'IT Help Desk', location: 'Computing Center, Ground Floor', email: 'it-helpdesk@college.edu', hours: 'Mon-Fri 09:00 - 17:00 IST' },
      EXAM: { name: 'Examinations Cell', location: 'Administrative Block, Room 204', email: 'exams@college.edu', hours: 'Mon-Fri 10:00 - 16:30 IST' },
      FEE: { name: 'Accounts & Fee Counter', location: 'Accounts Section, Window 3 & 4', email: 'fees@college.edu', hours: 'Mon-Fri 09:30 - 15:30 IST' },
      HOSTEL: { name: 'Hostel Administration', location: 'Chief Warden Office, Campus Block B', email: 'hostel@college.edu', hours: 'All days 08:00 - 20:00 IST' },
      STU: { name: 'Student Affairs & Grievance Cell', location: 'Dean Office, Student Center', email: 'grievance@college.edu', hours: 'Mon-Fri 10:00 - 17:00 IST' },
    };

    const target = (departmentCode && contactDirectory[departmentCode.toUpperCase()]) || contactDirectory.STU;

    const reasonExplanations = {
      insufficient_evidence: 'The approved college knowledge base does not contain verified guidelines for this specific query.',
      low_confidence: 'Our automated system could not classify your inquiry with sufficient confidence.',
      sensitive_grievance: 'This matter involves personal safety or confidential welfare and requires human officer handling.',
      explicit_request: 'You requested direct assistance from college staff.',
    };

    const reasonText = reasonExplanations[reason] || 'Direct departmental assistance is recommended for this inquiry.';

    const message = `**Connecting you with college staff**:

${reasonText}

• **Responsible Office**: ${target.name}
• **Office Location**: ${target.location}
• **Working Hours**: ${target.hours}
• **Official Email**: ${target.email}

Would you like me to help you submit a formal support ticket so the department staff can review your case directly?`;

    return {
      success: true,
      handoff: {
        reason,
        department: target.name,
        location: target.location,
        email: target.email,
        hours: target.hours,
        contactEmail: target.email,
        workingHours: target.hours,
        departmentDirectory: Object.entries(contactDirectory).map(([code, d]) => ({
          code,
          name: d.name,
          location: d.location,
          contactEmail: d.email,
          workingHours: d.hours,
        })),
      },
      suggestedActions: [
        { label: 'Create Support Ticket', action: 'OPEN_TICKET', description: 'Submit a formal ticket for staff triage' },
        { label: 'Browse Public FAQs', action: 'FAQ', description: 'Search verified campus policies' },
      ],
      message,
    };
  }

  /**
   * Workflow 10: Failure Recovery & Offline FAQ Search
   * Preserves non-AI FAQ and manual ticket creation when LLM/embeddings are unavailable.
   */
  async searchFaqsOffline({ query }, userProfile) {
    if (!query || typeof query !== 'string') {
      return { success: false, items: [], results: [] };
    }

    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const results = [];

    // Search in-memory preloaded documents
    for (const doc of inMemoryKnowledgeDocs.values()) {
      const title = (doc.title || '').toLowerCase();
      const content = (doc.content || '').toLowerCase();
      let matchScore = 0;

      for (const term of terms) {
        if (title.includes(term)) matchScore += 3;
        if (content.includes(term)) matchScore += 1;
      }

      if (matchScore > 0) {
        results.push({
          sourceId: doc.sourceId || doc.id,
          title: doc.title,
          snippet: (doc.content || '').slice(0, 200) + '...',
          score: matchScore,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const topMatches = results.slice(0, 3);

    const message = topMatches.length > 0
      ? `**Offline Help Recovery**:
The AI assistant is operating in offline recovery mode. Here are the approved college policies matching your keywords:

${topMatches.map((m, idx) => `${idx + 1}. **[${m.sourceId}] ${m.title}**\n   ${m.snippet}`).join('\n\n')}

You can also submit a support ticket directly to campus staff.`
      : `**Offline Help Recovery**:
The AI assistant is temporarily operating in offline mode. Please create a direct support ticket or visit your department helpdesk.`;

    return {
      success: true,
      isOfflineRecovery: true,
      items: topMatches,
      results: topMatches,
      suggestedActions: [
        { label: 'Create Support Ticket', action: 'OPEN_TICKET', description: 'Direct non-AI ticket submission' },
        { label: 'Campus Help Center', action: 'HELP_CENTER', description: 'Access student help portal' },
      ],
      message,
    };
  }

  /**
   * Universal Structured Tool Dispatcher
   * Validates arguments and permissions before executing (Prompt 6 Architecture Requirement).
   */
  async executeTool(toolName, args = {}, userProfile = null) {
    const toolDef = TOOL_DEFINITIONS.find((t) => t.name === toolName);
    if (!toolDef) {
      return {
        success: false,
        code: 'INVALID_TOOL_NAME',
        error: `Unrecognized or unauthorized tool '${toolName}'. Supported tools: ${TOOL_DEFINITIONS.map((t) => t.name).join(', ')}`,
      };
    }

    // 1. Validate required parameters
    for (const reqField of toolDef.parameters.required || []) {
      if (args[reqField] === undefined || args[reqField] === null) {
        return {
          success: false,
          code: 'INVALID_ARGUMENTS',
          error: `Missing required argument '${reqField}' for tool '${toolName}'.`,
        };
      }
    }

    // 2. Validate permissions
    if (toolDef.permission === 'OWNER_OR_ADMIN' || toolDef.permission === 'OWNER') {
      if (!userProfile) {
        return {
          success: false,
          isAuthorized: false,
          code: 'UNAUTHENTICATED',
          error: `Authentication required to execute '${toolName}'.`,
        };
      }
    }

    // 3. Dispatch to tool handler
    switch (toolName) {
      case 'get_ticket_status':
        return await this.getTicketStatus(args, userProfile);
      case 'get_sla_explanation':
        return await this.getSlaExplanation(args, userProfile);
      case 'get_ticket_resolution':
        return await this.getTicketResolution(args, userProfile);
      case 'get_info_request_details':
        return await this.getInfoRequestDetails(args, userProfile);
      case 'reply_to_ticket':
        return await this.replyToTicket(args, userProfile);
      case 'prepare_ticket_draft':
        return await this.prepareTicketDraft(args, userProfile);
      case 'confirm_and_create_ticket':
        return await this.confirmAndCreateTicket(args, userProfile);
      case 'handoff_to_human':
        return await this.handoffToHuman(args, userProfile);
      case 'search_faqs_offline':
        return await this.searchFaqsOffline(args, userProfile);
      default:
        throw new Error(`Execution handler for '${toolName}' not implemented.`);
    }
  }
}

export const aiWorkflowToolsService = new AiWorkflowToolsService();
