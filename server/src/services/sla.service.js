import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { formatToIST, toIstIsoString } from '../utils/date.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEMO_POLICY_LABEL = 'Demonstration Target (sla_policies.json)';
export const IS_DEMO_TARGET = true;

// Default fallback policies matching sla_policies.json
const DEFAULT_DEMO_POLICIES = [
  {
    priority: 'P1',
    name: 'Urgent',
    first_response_minutes: 60,
    resolution_hours: 8,
    escalate_hours: 2,
  },
  {
    priority: 'P2',
    name: 'High',
    first_response_minutes: 240,
    resolution_hours: 24,
    escalate_hours: 8,
  },
  {
    priority: 'P3',
    name: 'Normal',
    first_response_minutes: 480,
    resolution_hours: 72,
    escalate_hours: 24,
  },
  {
    priority: 'P4',
    name: 'Low',
    first_response_minutes: 1440,
    resolution_hours: 120,
    escalate_hours: 48,
  },
];

export class SlaService {
  constructor() {
    this.policies = this.loadDemoPolicies();
  }

  /**
   * Load SLA policies from sla_policies.json demo pack
   */
  loadDemoPolicies() {
    const candidatePaths = [
      path.resolve(__dirname, '../../../SmartDesk_AI_Demo_Data_Pack/SmartDesk_AI_Demo_Data/data/sla_policies.json'),
      path.resolve(__dirname, '../../../SmartDesk_AI_Demo_Data/data/sla_policies.json'),
      path.resolve(__dirname, '../ml/data/sla_policies.json'),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf-8');
          const data = JSON.parse(raw);
          if (Array.isArray(data) && data.length > 0) {
            logger.info(`[SlaService] Loaded demonstration SLA policies from ${p}`);
            return data;
          }
        } catch (err) {
          logger.warn(`[SlaService] Error reading SLA policies from ${p}: ${err.message}`);
        }
      }
    }

    logger.info('[SlaService] Using in-code default demonstration SLA policies');
    return DEFAULT_DEMO_POLICIES;
  }

  /**
   * Get all active demonstration SLA policies with explicit labeling
   */
  getPolicies() {
    return this.policies.map((p) => ({
      ...p,
      is_demo_target: IS_DEMO_TARGET,
      policy_label: DEMO_POLICY_LABEL,
    }));
  }

  /**
   * Resolve an SLA policy entry for a given priority name or tier code
   * Supports P1, P2, P3, P4 as well as Urgent, High, Normal, Medium, Low.
   * 
   * @param {string} priority
   * @returns {Object}
   */
  getPolicyForPriority(priority = 'Medium') {
    const norm = String(priority).trim().toUpperCase();

    // Map common aliases
    const aliasMap = {
      URGENT: 'P1',
      CRITICAL: 'P1',
      P1: 'P1',

      HIGH: 'P2',
      P2: 'P2',

      NORMAL: 'P3',
      MEDIUM: 'P3',
      P3: 'P3',

      LOW: 'P4',
      P4: 'P4',
    };

    const targetCode = aliasMap[norm] || 'P3';
    const policy = this.policies.find((p) => p.priority === targetCode) || this.policies[2]; // Default to Normal/Medium

    return {
      ...policy,
      is_demo_target: IS_DEMO_TARGET,
      policy_label: DEMO_POLICY_LABEL,
    };
  }

  /**
   * Calculate all SLA deadlines for a ticket from the active policy.
   * Timestamps are stored in canonical UTC ISO strings.
   * 
   * @param {string} priority - Ticket priority ('Urgent', 'High', 'Medium', 'Low' or 'P1'-'P4')
   * @param {Date|string|number} [baseDate=new Date()] - Ticket creation or base timestamp
   * @returns {Object} Calculated deadlines in UTC and display helpers
   */
  calculateDeadlines(priority = 'Medium', baseDate = new Date()) {
    const baseTime = new Date(baseDate).getTime();
    const policy = this.getPolicyForPriority(priority);

    const firstResponseDueMs = baseTime + policy.first_response_minutes * 60 * 1000;
    const resolutionDueMs = baseTime + policy.resolution_hours * 60 * 60 * 1000;
    const escalationDueMs = baseTime + policy.escalate_hours * 60 * 60 * 1000;

    const firstResponseDueUtc = new Date(firstResponseDueMs).toISOString();
    const resolutionDueUtc = new Date(resolutionDueMs).toISOString();
    const escalationDueUtc = new Date(escalationDueMs).toISOString();

    return {
      priority: policy.name,
      priority_tier: policy.priority,
      first_response_minutes: policy.first_response_minutes,
      resolution_hours: policy.resolution_hours,
      escalate_hours: policy.escalate_hours,
      
      // Canonical UTC storage timestamps
      first_response_due_at: firstResponseDueUtc,
      resolution_due_at: resolutionDueUtc,
      escalation_due_at: escalationDueUtc,
      sla_due_at: resolutionDueUtc, // Supabase schema standard column

      // Asia/Kolkata (IST) display helpers
      display_first_response_ist: formatToIST(firstResponseDueUtc),
      display_resolution_ist: formatToIST(resolutionDueUtc),
      display_escalation_ist: formatToIST(escalationDueUtc),
      display_sla_due_ist: formatToIST(resolutionDueUtc),

      // Demonstration target labels
      is_demo_target: IS_DEMO_TARGET,
      policy_label: DEMO_POLICY_LABEL,
      calculated_at: new Date().toISOString(),
    };
  }

  /**
   * Evaluate a ticket's current SLA health against targets.
   * 
   * @param {Object} ticket - Ticket data object
   * @param {Date} [now=new Date()]
   * @returns {Object} SLA status evaluation
   */
  evaluateTicketSlaStatus(ticket, now = new Date()) {
    const nowMs = now.getTime();
    const isCompleted = ['RESOLVED', 'CLOSED', 'REJECTED'].includes(ticket.status);

    if (isCompleted) {
      return {
        status: 'COMPLETED',
        isApproaching: false,
        isOverdue: false,
        isEscalated: false,
        timeRemainingMs: 0,
        timeRemainingMinutes: 0,
      };
    }

    const createdMs = new Date(ticket.created_at || nowMs).getTime();
    const resolutionDueMs = new Date(ticket.resolution_due_at || ticket.sla_due_at || createdMs + 72 * 3600000).getTime();
    const escalationDueMs = ticket.escalation_due_at
      ? new Date(ticket.escalation_due_at).getTime()
      : createdMs + 24 * 3600000;

    const totalDurationMs = Math.max(1, resolutionDueMs - createdMs);
    const elapsedMs = nowMs - createdMs;
    const timeRemainingMs = resolutionDueMs - nowMs;
    const timeRemainingMinutes = Math.round(timeRemainingMs / (60 * 1000));

    // Overdue resolution check
    const isOverdue = nowMs >= resolutionDueMs;

    // Approaching SLA check (elapsed >= 80% of target resolution time, and not yet overdue)
    const isApproaching = !isOverdue && elapsedMs >= 0.8 * totalDurationMs;

    // Escalation deadline check (e.g. ticket is still OPEN / unacknowledged past escalate_hours)
    const isEscalationBreached = nowMs >= escalationDueMs && ['OPEN', 'AWAITING_INFO'].includes(ticket.status);

    return {
      status: isOverdue ? 'BREACHED' : isApproaching ? 'APPROACHING' : 'ON_TRACK',
      isApproaching,
      isOverdue,
      isEscalated: isEscalationBreached || Boolean(ticket.is_escalated),
      elapsedPercentage: Math.min(100, Math.round((elapsedMs / totalDurationMs) * 100)),
      timeRemainingMs,
      timeRemainingMinutes,
      escalationDueMs,
      resolutionDueMs,
      display_due_ist: formatToIST(new Date(resolutionDueMs).toISOString()),
      policy_label: DEMO_POLICY_LABEL,
    };
  }
}

export const slaService = new SlaService();
