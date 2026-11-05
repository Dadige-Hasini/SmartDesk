import { supabaseAdmin, supabaseClient } from '../../config/supabase.js';
import { ticketRepository, inMemoryTickets } from '../../repositories/ticket.repository.js';
import { CommentService } from '../comment.service.js';
import { llmService } from './llm.service.js';
import { ticketClassificationService } from '../../ml/ticket_classification/ticket_classification_service.js';
import { CATEGORIES } from '../../ml/taxonomy.js';
import { DEFAULT_DEPARTMENTS } from '../../routes/auth.routes.js';
import { formatToIST } from '../../utils/date.js';
import { logger } from '../../utils/logger.js';

function getDbClient() {
  if (process.env.NODE_ENV === 'test') return null;
  return supabaseAdmin || supabaseClient;
}

export const WORKFLOW_MODES = {
  GENERAL_KNOWLEDGE: 'GENERAL_KNOWLEDGE',
  COLLEGE_KNOWLEDGE_VERIFIED: 'COLLEGE_KNOWLEDGE_VERIFIED',
  STAFF_INFORMATION_REQUEST: 'STAFF_INFORMATION_REQUEST',
  PERSONAL_TICKET_INFO: 'PERSONAL_TICKET_INFO',
  STAFF_APPROVAL_REQUEST: 'STAFF_APPROVAL_REQUEST',
};

// Patterns for official institutional decisions, permissions, refunds, attendance condonation, grievances
const OFFICIAL_APPROVAL_REGEX = /\b(attendance.*(shortage|condonation|exception|medical.*leave.*approval)|condonation|medical.*leave.*exception|approve.*(certificate|bonafide|refund|leave|request|pass|event|permission|admission|transfer)|approval.*for|request.*refund|refund.*fee|fee.*refund|double.*deduct|payment.*reversal|reimbursement|charge.*waiver|official permission|permission.*(organize|conduct|hall|auditorium|late entry|outpass)|special permission|formal grievance|disciplinary.*(appeal|waiver|hearing)|penalty.*waiver|drop.*course.*approval|elective.*change.*approval|branch.*change.*approval|approval request|request.*official approval|official authorization|official decision)\b/i;

// Patterns for student personal ticket information
const TICKET_ID_REGEX = /(?:TKT-\d{8}-\d{4}|SD-DEMO-\d{4}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

const PERSONAL_TICKET_QUERY_REGEX = /\b(status of my tickets?|my tickets? status|check my tickets?|view my tickets?|my open tickets?|how many days.*(certificate|ticket|request|application|grievance|scholarship).*take|when will (?:it|my (?:ticket|issue|request|grievance|certificate|scholarship|application|complaint)).*(resolve|ready|finish|complete|issue|issued|disbursed|arrive)|has my (grievance|ticket|request|application|issue|complaint|certificate|scholarship) been (reviewed|checked|seen|assigned|approved|processed)|who is handling (my|the) (ticket|issue|request|case|scholarship|application)|who is assigned to my|when can i expect a response|any update on (?:my )?(?:tickets?|requests?|scholarship|application|complaint|grievance)|tickets? update|my grievances?|my complaints?|my open issues|my requests?|i (?:had|have)? (?:raised|submitted|created|opened|filed|sent) a (?:ticket|request|query|application|complaint|grievance|issue)|tell me (?:the )?(?:current )?status|check the status|status of (?:my )?(?:scholarship|application|ticket|complaint|bonafide|certificate)|what happened to my)\b/i;

// Campus / college specific terms that distinguish college inquiries from general knowledge
const COLLEGE_SPECIFIC_TERMS_REGEX = /\b(college|university|campus|hostel|mess|fees?|tuition|bonafide|hall ticket|admit card|smartdesk|semester|principal|registrar|hod|attendance|bus pass|id card|warden|library|condonation|syllabus|regulation|cgpa|sgpa|ragging|grade card|re-evaluation|backlog|allotment|malla reddy|scholarship|application|complaint|grievance|bonafide certificate|transfer certificate|convocation|placements|internship)\b/i;

// Topic keywords extracted for personal ticket matching
const TOPIC_KEYWORDS = ['scholarship', 'bonafide', 'certificate', 'fees', 'fee', 'wifi', 'hostel', 'hall ticket', 'admit card', 'refund', 're-evaluation', 'grade card', 'bus pass', 'id card', 'mess', 'library', 'exam', 'attendance'];

export class AiWorkflowManagerService {
  /**
   * Intelligently classify incoming student queries into one of the required workflow modes:
   * 1. GENERAL_KNOWLEDGE
   * 2. COLLEGE_KNOWLEDGE
   * 3. PERSONAL_TICKET_INFO
   * 4. OFFICIAL_APPROVAL
   */
  classifyQueryMode(query, userProfile = null, conversationHistory = []) {
    const clean = (query || '').trim();
    const lower = clean.toLowerCase();

    // 1. Check for Official Approval / Institutional Authorization
    if (OFFICIAL_APPROVAL_REGEX.test(clean)) {
      return {
        mode: WORKFLOW_MODES.STAFF_APPROVAL_REQUEST,
        reason: 'institutional_approval_required',
        description: 'Requires official decision or authorization from authorized department staff.',
      };
    }

    // 2. Extract Topic Keyword (e.g. scholarship, bonafide, wifi) from current query or history
    let matchedTopic = null;
    for (const kw of TOPIC_KEYWORDS) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(clean)) {
        matchedTopic = kw;
        break;
      }
    }

    // Inspect recent conversation history for active ticket context or active topics
    let contextTicketRef = null;
    let contextTopic = null;
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const recentTurns = conversationHistory.slice(-4);
      for (const turn of recentTurns) {
        const text = typeof turn?.content === 'string' ? turn.content : (turn?.message || '');
        if (!contextTicketRef) {
          const m = text.match(TICKET_ID_REGEX);
          if (m) contextTicketRef = m[0];
        }
        if (!contextTopic) {
          for (const kw of TOPIC_KEYWORDS) {
            if (new RegExp(`\\b${kw}\\b`, 'i').test(text)) {
              contextTopic = kw;
              break;
            }
          }
        }
      }
    }

    const effectiveTopic = matchedTopic || contextTopic;
    const effectiveTicketRef = clean.match(TICKET_ID_REGEX)?.[0] || contextTicketRef || null;

    // Check for follow-up conversational ticket queries (e.g. "When will it be issued?", "What is the status?", "Any update?")
    const isFollowUpTimeline = /\b(when will (?:it|this|that|my [a-z]+) (?:be )?(?:issued|ready|approved|processed|resolved|completed|disbursed|delivered)|any update|has (?:anyone|staff) (?:replied|responded)|what is the status|tell me the status|is it done)\b/i.test(clean);

    // 2. Check for Personal Ticket & Grievance Information
    const hasTicketId = Boolean(clean.match(TICKET_ID_REGEX));
    const hasPersonalTicketPhrase = PERSONAL_TICKET_QUERY_REGEX.test(clean);
    const isContextualTicketFollowUp = Boolean(isFollowUpTimeline && (contextTicketRef || contextTopic));

    if (hasTicketId || hasPersonalTicketPhrase || isContextualTicketFollowUp) {
      return {
        mode: WORKFLOW_MODES.PERSONAL_TICKET_INFO,
        reason: 'student_ticket_inquiry',
        description: 'Queries personal ticket status and SLA from verified database records.',
        ticketRef: effectiveTicketRef,
        topicKeyword: effectiveTopic,
      };
    }

    // 3. Distinguish between College Knowledge (RAG) and General Knowledge (OpenAI)
    const hasCollegeContext = COLLEGE_SPECIFIC_TERMS_REGEX.test(clean) || Boolean(effectiveTopic);

    if (hasCollegeContext) {
      return {
        mode: 'COLLEGE_KNOWLEDGE',
        reason: 'college_regulations_query',
        description: 'College administrative or campus procedural question to be checked against knowledge base.',
        topicKeyword: effectiveTopic,
      };
    }

    // 4. Default to General Knowledge (Educational, Conceptual, Technical, Life Skills)
    return {
      mode: WORKFLOW_MODES.GENERAL_KNOWLEDGE,
      reason: 'general_knowledge_and_learning',
      description: 'General conceptual, technical, or educational question answered directly with OpenAI.',
    };
  }

  /**
   * MODE 1: General Knowledge Response
   * Uses OpenAI / configured LLM to generate clear conversational answers.
   * No staff involvement, no ticket creation, supports follow-up conversations.
   */
  async handleGeneralKnowledge({ query, conversationHistory = [] }) {
    const systemInstruction = `You are SmartDesk AI, an intelligent, helpful, and student-friendly college learning assistant.
Answer the student's general technical, conceptual, study skill, or programming question clearly, engagingly, and accurately.
- Provide intuitive explanations, structured steps, examples, or code snippets where appropriate.
- Maintain a warm, encouraging, and educational tone.
- Maintain conversational context for multi-turn follow-ups.
- Do NOT invent college policies or suggest creating support tickets for ordinary general questions.`;

    const prompt = query.trim();

    try {
      const completion = await llmService.generateCompletion({
        prompt,
        systemInstruction,
        history: Array.isArray(conversationHistory) ? conversationHistory.slice(-6) : [],
        temperature: 0.3,
        maxTokens: 1024,
      });

      return {
        answer: completion.text,
        workflowMode: WORKFLOW_MODES.GENERAL_KNOWLEDGE,
        workflowLabel: 'General Knowledge & Learning',
        workflowDescription: 'Answered directly by AI Assistant. No staff involvement required.',
        requiresStaffApproval: false,
        requiresStaffInformation: false,
        citations: [],
        suggestedActions: [
          {
            label: 'Ask a Follow-up',
            action: 'CONTINUE_CHAT',
            description: 'Ask for more details or code examples on this topic',
          },
        ],
        ticketDraft: null,
        hasSufficientEvidence: true,
        confidenceScore: 0.95,
      };
    } catch (err) {
      logger.error('[AiWorkflowManager] General knowledge generation failed', { error: err.message });
      throw err;
    }
  }

  /**
   * MODE 3: Personal Ticket & Service Information
   * Retrieves authenticated student's own ticket records directly from Supabase PostgreSQL.
   * Explains current status, department, assigned staff, and configured SLA targets without unverified promises.
   * No staff approval needed when records already exist in the database.
   */
  async handlePersonalTicketInfo({ query, ticketRef = null, topicKeyword = null, userProfile = null, conversationHistory = [] }) {
    // 1. Privacy barrier: Anonymous users cannot query personal student tickets
    if (!userProfile?.id) {
      return {
        answer: 'For student privacy and security, personal ticket and grievance information can only be accessed by authenticated students. Please sign in to view your tickets.',
        workflowMode: WORKFLOW_MODES.PERSONAL_TICKET_INFO,
        workflowLabel: 'Personal Student Records',
        workflowDescription: 'Authentication required to inspect confidential student records.',
        requiresStaffApproval: false,
        requiresStaffInformation: false,
        citations: [],
        suggestedActions: [
          { label: 'Sign In', action: 'LOGIN', description: 'Log in with your university account' },
        ],
        hasSufficientEvidence: false,
        confidenceScore: 0.0,
        isAuthorized: false,
      };
    }

    const db = getDbClient();
    let tickets = [];

    // 2. Fetch specific ticket or student's active tickets
    if (ticketRef) {
      try {
        const found = await ticketRepository.findById(ticketRef);
        if (found) {
          // Ownership verification
          const isOwner = found.created_by === userProfile.id || userProfile.role === 'SUPER_ADMIN';
          if (!isOwner) {
            return {
              answer: `For student privacy, I cannot disclose details about ticket **${found.ticket_number || found.demo_id || ticketRef}**. Support tickets can only be inspected by the student who raised them or authorized campus staff.`,
              workflowMode: WORKFLOW_MODES.PERSONAL_TICKET_INFO,
              workflowLabel: 'Personal Student Records',
              workflowDescription: 'Access restricted by ownership security policy.',
              requiresStaffApproval: false,
              requiresStaffInformation: false,
              citations: [],
              suggestedActions: [
                { label: 'View My Tickets', action: 'VIEW_MY_TICKETS', description: 'View your own submitted tickets' },
              ],
              hasSufficientEvidence: false,
              confidenceScore: 0.0,
              isAuthorized: false,
            };
          }
          tickets = [found];
        }
      } catch (e) {
        logger.warn('[AiWorkflowManager] Failed to find specific ticket', { ticketRef, error: e.message });
      }
    } else {
      // Query tickets of this student
      if (db) {
        try {
          const { data, error } = await db
            .from('tickets')
            .select(`
              *,
              category:categories(id, name, code),
              assigned_department:departments!tickets_assigned_department_id_fkey(id, name, code),
              assignee:profiles!tickets_assigned_to_fkey(id, full_name, email, role)
            `)
            .eq('created_by', userProfile.id)
            .order('created_at', { ascending: false })
            .limit(20);

          if (!error && Array.isArray(data)) {
            tickets = data;
          }
        } catch (e) {
          logger.warn('[AiWorkflowManager] Failed to query student tickets from database', { error: e.message });
        }
      }

      if (tickets.length === 0 && inMemoryTickets.size > 0) {
        tickets = Array.from(inMemoryTickets.values()).filter((t) => t.created_by === userProfile.id);
      }
    }

    // 3. Handle when student has no tickets at all
    if (tickets.length === 0) {
      return {
        answer: `You currently do not have any active support tickets registered under your account (**${userProfile.email}**).\n\nIf you have a question or need assistance with campus services, you can ask me anything about college procedures or open a new support ticket anytime.`,
        workflowMode: WORKFLOW_MODES.PERSONAL_TICKET_INFO,
        workflowLabel: 'Personal Student Records',
        workflowDescription: 'Direct database lookup confirmed no open tickets on record.',
        requiresStaffApproval: false,
        requiresStaffInformation: false,
        citations: [],
        suggestedActions: [
          { label: 'Create Support Ticket', action: 'OPEN_TICKET', description: 'Submit a new inquiry to department staff' },
          { label: 'Ask College Questions', action: 'FAQ', description: 'Search verified campus policies' },
        ],
        hasSufficientEvidence: true,
        confidenceScore: 1.0,
      };
    }

    // 4. Topic Keyword filtering (e.g. "scholarship", "bonafide", "fee")
    const effectiveTopic = (topicKeyword || '').toLowerCase().trim();
    if (effectiveTopic && !ticketRef) {
      const matchingTickets = tickets.filter((t) => {
        const titleMatch = (t.title || '').toLowerCase().includes(effectiveTopic);
        const descMatch = (t.description || '').toLowerCase().includes(effectiveTopic);
        const catNameMatch = (t.category?.name || '').toLowerCase().includes(effectiveTopic);
        const catCodeMatch = (t.category?.code || '').toLowerCase().includes(effectiveTopic);
        const tagMatch = Array.isArray(t.tags) && t.tags.some((tag) => tag.toLowerCase().includes(effectiveTopic));
        return titleMatch || descMatch || catNameMatch || catCodeMatch || tagMatch;
      });

      if (matchingTickets.length === 1) {
        tickets = matchingTickets;
      } else if (matchingTickets.length > 1) {
        const listText = matchingTickets
          .map((t, idx) => {
            const ticketNum = t.ticket_number || t.demo_id || t.id;
            const dept = t.assigned_department?.name || 'Department Office';
            return `${idx + 1}. Ticket **${ticketNum}**: "${t.title}" (Status: **${t.status}**, Dept: **${dept}**)`;
          })
          .join('\n');

        return {
          answer: `I found **${matchingTickets.length}** tickets matching "**${topicKeyword}**" under your account:\n\n${listText}\n\nWhich specific ticket would you like more information or status updates on?`,
          workflowMode: WORKFLOW_MODES.PERSONAL_TICKET_INFO,
          workflowLabel: 'Personal Student Records (Multiple Matches)',
          workflowDescription: 'Multiple tickets matched the queried topic. Student disambiguation requested.',
          requiresStaffApproval: false,
          requiresStaffInformation: false,
          citations: [],
          suggestedActions: matchingTickets.map((t) => ({
            label: `Check Ticket ${t.ticket_number || t.demo_id}`,
            action: 'INSPECT_TICKET',
            description: t.title,
          })),
          ticketDetails: matchingTickets.map((t) => ({
            id: t.id,
            ticketNumber: t.ticket_number || t.demo_id,
            title: t.title,
            status: t.status,
          })),
          hasSufficientEvidence: true,
          confidenceScore: 1.0,
          isAuthorized: true,
        };
      } else {
        // Zero matching tickets for this specific topic keyword
        const otherTicketsList = tickets.slice(0, 3).map((t, idx) => {
          const num = t.ticket_number || t.demo_id || t.id;
          return `${idx + 1}. Ticket **${num}**: "${t.title}" (${t.status})`;
        }).join('\n');

        return {
          answer: `I checked your registered support tickets, but could not find any active tickets regarding "**${topicKeyword}**" under your account (**${userProfile.email}**).\n\n${otherTicketsList ? `**Your other recent tickets:**\n${otherTicketsList}\n\n` : ''}If you need assistance regarding your ${topicKeyword}, I can help you draft and submit a new ticket directly to the appropriate department.`,
          workflowMode: WORKFLOW_MODES.PERSONAL_TICKET_INFO,
          workflowLabel: 'Personal Student Records (No Topic Match)',
          workflowDescription: 'No tickets matched the specified topic keyword.',
          requiresStaffApproval: false,
          requiresStaffInformation: false,
          citations: [],
          suggestedActions: [
            { label: `Raise ${topicKeyword.charAt(0).toUpperCase() + topicKeyword.slice(1)} Ticket`, action: 'OPEN_TICKET', description: `Submit inquiry for ${topicKeyword}` },
            { label: 'View All Tickets', action: 'VIEW_MY_TICKETS', description: 'Inspect all submitted tickets' },
          ],
          hasSufficientEvidence: true,
          confidenceScore: 0.95,
          isAuthorized: true,
        };
      }
    }

    // Default to at most 5 latest tickets if no specific filter narrowed it down
    if (tickets.length > 5) {
      tickets = tickets.slice(0, 5);
    }

    // 5. Format rich, honest explanation of actual database records
    const statusMeanings = {
      OPEN: 'Queued in department inbox; awaiting triage review by staff.',
      IN_PROGRESS: 'Under active investigation and processing by assigned departmental staff.',
      AWAITING_INFO: 'Staff have requested additional information or supporting documentation from you.',
      RESOLVED: 'Marked resolved by department staff. Official resolution summary is on file.',
      CLOSED: 'Formally closed after resolution window.',
      REJECTED: 'Reviewed and rejected with documented departmental rationale.',
    };

    const isAskingTimeline = /\b(when will|how long|completion date|issue date|disbursed|issued|expected date|timeline)\b/i.test(query || '');

    const summaries = await Promise.all(
      tickets.map(async (t, idx) => {
        const ticketNum = t.ticket_number || t.demo_id || t.id;
        const deptName = t.assigned_department?.name || 'Department Office';
        const staffName = t.assignee?.full_name ? `${t.assignee.full_name} (${t.assignee.email})` : 'Pending staff pickup in department queue';
        const statusText = statusMeanings[t.status] || `Currently in ${t.status} status.`;
        const slaTargetIst = t.sla_due_at ? formatToIST(t.sla_due_at) : 'Standard 24-hour SLA target';
        const createdIst = t.created_at ? formatToIST(t.created_at) : 'Recent';

        let publicUpdates = '';
        try {
          const comments = await CommentService.getComments(t.id, userProfile, userProfile?.role);
          const staffPublicComments = (comments || []).filter((c) => !c.is_internal && c.author_id !== userProfile?.id);
          if (staffPublicComments.length > 0) {
            const lastComment = staffPublicComments[staffPublicComments.length - 1];
            publicUpdates = `• **Staff Update**: "${lastComment.content}"\n`;
          }
        } catch {}

        let timelineNote = '';
        if (isAskingTimeline) {
          timelineNote = `• **Timeline / Issuance**: Department SLA resolution target is **${slaTargetIst}** (Operational target). Please note that SLA targets are departmental benchmarks and do not constitute an officially guaranteed issuance date until finalized by staff.\n`;
        }

        return `${tickets.length > 1 ? `### ${idx + 1}. Ticket **${ticketNum}**: "${t.title}"` : `### Ticket **${ticketNum}**: "${t.title}"`}
• **Status**: ${t.status} (${statusText})
• **Responsible Department**: ${deptName}
• **Assigned Officer**: ${staffName}
• **Priority**: ${t.priority}
• **Submitted On**: ${createdIst}
• **Target SLA Due Date**: ${slaTargetIst} (Operational Target)
${timelineNote}${t.resolution_summary ? `• **Official Resolution**: "${t.resolution_summary}"\n` : ''}${publicUpdates}${t.rejection_reason ? `• **Rejection Rationale**: "${t.rejection_reason}"\n` : ''}`;
      })
    );

    const disclaimer = `\n> [!NOTE]\n> **Operational Target Notice**: Target resolution deadlines represent departmental SLA benchmarks and operational targets. They do not constitute an officially confirmed final delivery guarantee until verified by department staff.`;

    const answer = `Here is the current status of your ticket records retrieved directly from verified database records:\n\n${summaries.join('\n\n')}\n${disclaimer}`;

    return {
      answer,
      workflowMode: WORKFLOW_MODES.PERSONAL_TICKET_INFO,
      workflowLabel: 'Personal Student Records (Verified DB Records)',
      workflowDescription: 'Retrieved directly from your verified database records. No staff approval needed.',
      requiresStaffApproval: false,
      requiresStaffInformation: false,
      citations: [],
      suggestedActions: [
        { label: 'Open Ticket Details', action: 'VIEW_MY_TICKETS', description: 'View full comment thread and attachments' },
        { label: 'Request Staff Update', action: 'INFORMATION_REQUEST', description: 'Send factual clarification ping to assigned staff' },
      ],
      ticketDetails: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticket_number || t.demo_id,
        title: t.title,
        status: t.status,
        department: t.assigned_department?.name,
        assignee: t.assignee?.full_name,
        slaDueAt: t.sla_due_at,
        isOverdue: t.is_overdue,
      })),
      hasSufficientEvidence: true,
      confidenceScore: 1.0,
      isAuthorized: true,
    };
  }

  /**
   * MODE 4: Official Approval or Authorization Request
   * Identifies requests requiring official decisions, financial transactions, attendance condonations,
   * certificate approvals, room changes, or formal grievance hearings.
   * Explains institutional policy and routes request to authorized department staff.
   */
  async handleOfficialApproval({ query, userProfile = null }) {
    await ticketClassificationService.initialize();
    const routeResult = await ticketClassificationService.classifyAndRoute({
      title: query.slice(0, 80),
      description: query,
    });

    // Resolve canonical category UUID and department UUID
    const catRaw = routeResult.category?.code || routeResult.category;
    const resolvedCat = CATEGORIES.find(
      (c) => c.code === catRaw || c.id === catRaw || (c.name && String(catRaw).toLowerCase().includes(c.name.toLowerCase()))
    ) || CATEGORIES[0];

    const deptRaw = routeResult.department?.code || routeResult.department;
    const resolvedDept = DEFAULT_DEPARTMENTS.find(
      (d) => d.code === deptRaw || d.id === deptRaw || (deptRaw === 'REG' && d.code === 'REGISTRAR') || (deptRaw === 'STU' && d.code === 'AFFAIRS') || (deptRaw === 'FEE' && d.code === 'FIN') || (deptRaw === 'ATT' && d.code === 'REGISTRAR')
    ) || DEFAULT_DEPARTMENTS[8];

    const categoryName = resolvedCat.name || routeResult.category?.name || 'Administrative Authorization';
    const deptName = resolvedDept.name || routeResult.department?.name || 'Academic Registrar Office';
    const deptCode = resolvedDept.code || routeResult.department?.code || 'REGISTRAR';

    const cleanTitle = query.length > 60 ? query.slice(0, 57) + '...' : query;

    const answer = `**Official Institutional Authorization Required**:

Requests involving official permissions, attendance shortage condonations, fee refunds, certificate approvals, and institutional exceptions cannot be authorized automatically by AI.

Only authorized department staff members holding approver privileges (\`can_approve_documents\`) can review and officially approve or reject these requests.

### Request Details:
• **Action Requested**: ${cleanTitle}
• **Responsible Department**: **${deptName}**
• **Classification**: ${categoryName} (Priority: ${routeResult.priority || 'High'})
• **Decision Workflow**: **Staff Approval Request** (Staff must explicitly approve or reject with a documented justification note).

I have pre-populated a formal **Staff Approval Request** draft for you. Review the draft below and submit it directly to the **${deptName}** approver queue.`;

    const ticketDraft = {
      title: `Official Approval Request: ${cleanTitle}`,
      description: `[Workflow: STAFF APPROVAL REQUEST - Requires Authorized Department Action]\n\nStudent Inquiry / Request:\n"${query}"\n\nNature of Request: Institutional Authorization / Official Approval\nReview Protocol: Staff with authorized approver privileges must explicitly Approve or Reject with a mandatory justification note.`,
      categoryId: resolvedCat.id,
      departmentId: resolvedDept.id,
      departmentName: deptName,
      departmentCode: deptCode,
      priority: routeResult.priority || 'High',
      requestType: 'APPROVAL_REQUEST',
      tags: ['WORKFLOW:APPROVAL_REQUEST', 'APPROVAL_STATUS:PENDING'],
      isConfidential: Boolean(routeResult.isConfidential),
      requiresConfirmation: true,
      requiresStaffApproval: true,
    };

    return {
      answer,
      workflowMode: WORKFLOW_MODES.STAFF_APPROVAL_REQUEST,
      workflowLabel: 'Official Department Approval Request',
      workflowDescription: 'Official institutional decision required. Staff must explicitly approve or reject with a documented reason.',
      requiresStaffApproval: true,
      requiresStaffInformation: false,
      citations: [],
      suggestedActions: [
        {
          label: 'Submit for Official Approval',
          action: 'CONFIRM_APPROVAL_TICKET',
          description: `Forward request to ${deptName} for formal staff review`,
        },
      ],
      ticketDraft,
      hasSufficientEvidence: true,
      confidenceScore: 0.95,
    };
  }

  /**
   * Helper for College Knowledge when information is unavailable in approved handbook.
   * Creates a Staff Information Request (NOT an approval request).
   * Staff provides factual confirmation; formal approval is not required.
   */
  async handleStaffInformationRequest({ query, userProfile = null }) {
    await ticketClassificationService.initialize();
    const routeResult = await ticketClassificationService.classifyAndRoute({
      title: query.slice(0, 80),
      description: query,
    });

    // Resolve canonical category UUID and department UUID
    const catRaw = routeResult.category?.code || routeResult.category;
    const resolvedCat = CATEGORIES.find(
      (c) => c.code === catRaw || c.id === catRaw || (c.name && String(catRaw).toLowerCase().includes(c.name.toLowerCase()))
    ) || CATEGORIES[0];

    const deptRaw = routeResult.department?.code || routeResult.department;
    const resolvedDept = DEFAULT_DEPARTMENTS.find(
      (d) => d.code === deptRaw || d.id === deptRaw || (deptRaw === 'REG' && d.code === 'REGISTRAR') || (deptRaw === 'STU' && d.code === 'AFFAIRS') || (deptRaw === 'FEE' && d.code === 'FIN') || (deptRaw === 'ATT' && d.code === 'REGISTRAR')
    ) || DEFAULT_DEPARTMENTS[8];

    const categoryName = resolvedCat.name || routeResult.category?.name || 'General Inquiry';
    const deptName = resolvedDept.name || routeResult.department?.name || 'Academic Registrar Office';
    const cleanTitle = query.length > 60 ? query.slice(0, 57) + '...' : query;

    const answer = `I searched the approved college knowledge base, but could not find sufficient information or verified evidence for this specific inquiry.

To ensure you receive accurate, verified guidance:
I can submit a **Staff Information Request** directly to the **${deptName}**. A staff member will check departmental procedures and provide factual confirmation.

*Note: Formal administrative approval is not required merely to answer an informational question.*`;

    const ticketDraft = {
      title: `Information Request: ${cleanTitle}`,
      description: `[Workflow: STAFF INFORMATION REQUEST - Requires Department Clarification]\n\nStudent Question:\n"${query}"\n\nWorkflow Nature: Information Request (Factual Confirmation / Procedure Clarification)\nNote: Department staff provides factual answer. Formal approval decision is not required.`,
      categoryId: resolvedCat.id,
      departmentId: resolvedDept.id,
      departmentName: deptName,
      departmentCode: resolvedDept.code,
      priority: 'Medium',
      requestType: 'INFORMATION_REQUEST',
      tags: ['WORKFLOW:INFORMATION_REQUEST'],
      requiresConfirmation: true,
      requiresStaffApproval: false,
      requiresStaffInformation: true,
    };

    return {
      answer,
      workflowMode: WORKFLOW_MODES.STAFF_INFORMATION_REQUEST,
      workflowLabel: 'Department Information Request',
      workflowDescription: 'Factual confirmation or timeline update needed from staff. Formal approval not required.',
      requiresStaffApproval: false,
      requiresStaffInformation: true,
      citations: [],
      suggestedActions: [
        {
          label: 'Send Information Request',
          action: 'SUBMIT_INFO_REQUEST',
          description: `Ask ${deptName} staff for official clarification`,
        },
      ],
      ticketDraft,
      handoff: { department: deptName, recommended: true, reason: 'unverified_inquiry' },
      hasSufficientEvidence: false,
      confidenceScore: 0.35,
    };
  }
}

export const aiWorkflowManager = new AiWorkflowManagerService();
