import fs from 'node:fs';
import { findRoutingRulesPath } from './dataset_loader.js';

export const DEPARTMENT_NAMES = {
  IT: 'IT Help Desk',
  EXAM: 'Examinations Cell',
  FEE: 'Accounts and Fee Section',
  ATT: 'Academic Coordinator',
  REG: 'Academic Administration',
  LIB: 'Library',
  HOSTEL: 'Hostel Administration',
  FAC: 'Facilities and Maintenance',
  TRAN: 'Transport Office',
  STU: 'Student Affairs and Grievance Cell',
  ADMISSIONS: 'Admissions Office',
};

// Sensitive grievance patterns requiring mandatory human review
const GRIEVANCE_SENSITIVE_REGEX = /\b(harassment|ragging|discrimination|sexual|assault|abuse|threat|bribe|confidential complaint|mental health|crisis|extortion)\b/i;

// Fee payment discrepancy patterns requiring mandatory human review
const FEE_DISCREPANCY_REGEX = /\b(charged twice|double debit|double charge|deducted.*unpaid|money deducted|unauthorized charge|payment failed|duplicate payment|refund)\b/i;

// Urgent examination deadline patterns requiring priority human review
const EXAM_DEADLINE_REGEX = /\b(exam today|exam tomorrow|missed exam|hall ticket not generated|hall ticket missing|examination clash|admit card missing|exam in.*hours|urgent hall ticket)\b/i;

export class DeterministicRoutingEngine {
  constructor(options = {}) {
    this.rules = new Map();
    this.rulesList = [];
    this._loadRules(options.rulesFilePath);
  }

  /**
   * Load deterministic rules from routing_rules.json
   */
  _loadRules(customPath) {
    try {
      const filePath = customPath || findRoutingRulesPath();
      const raw = fs.readFileSync(filePath, 'utf-8');
      const rules = JSON.parse(raw);
      this.rulesList = rules;

      for (const rule of rules) {
        this.rules.set(rule.category, {
          ruleId: rule.rule_id,
          category: rule.category,
          department: rule.department,
          priority: rule.priority || 'P2',
          confidenceThreshold: typeof rule.confidence_threshold === 'number' ? rule.confidence_threshold : 0.7,
          fallbackDepartment: rule.fallback_department || 'STU',
          humanReview: Boolean(rule.human_review),
        });
      }
    } catch (err) {
      // In-memory fallback rules
      this._loadFallbackRules();
    }
  }

  _loadFallbackRules() {
    const fallbackRules = [
      { rule_id: 'ROUTE-01', category: 'IT_ACCESS', department: 'IT', priority: 'P2', confidence_threshold: 0.7, fallback_department: 'STU', human_review: false },
      { rule_id: 'ROUTE-02', category: 'NETWORK_WIFI', department: 'IT', priority: 'P2', confidence_threshold: 0.7, fallback_department: 'STU', human_review: false },
      { rule_id: 'ROUTE-03', category: 'LMS_TECHNICAL', department: 'IT', priority: 'P2', confidence_threshold: 0.7, fallback_department: 'STU', human_review: false },
      { rule_id: 'ROUTE-04', category: 'EXAM_HALL_TICKET', department: 'EXAM', priority: 'P1', confidence_threshold: 0.7, fallback_department: 'STU', human_review: true },
      { rule_id: 'ROUTE-05', category: 'EXAM_RESULTS', department: 'EXAM', priority: 'P2', confidence_threshold: 0.7, fallback_department: 'STU', human_review: false },
      { rule_id: 'ROUTE-06', category: 'FEE_PAYMENT', department: 'FEE', priority: 'P1', confidence_threshold: 0.7, fallback_department: 'STU', human_review: true },
      { rule_id: 'ROUTE-07', category: 'SCHOLARSHIP', department: 'FEE', priority: 'P2', confidence_threshold: 0.7, fallback_department: 'STU', human_review: false },
      { rule_id: 'ROUTE-08', category: 'ATTENDANCE', department: 'ATT', priority: 'P2', confidence_threshold: 0.7, fallback_department: 'STU', human_review: false },
      { rule_id: 'ROUTE-09', category: 'CERTIFICATE_RECORDS', department: 'REG', priority: 'P3', confidence_threshold: 0.7, fallback_department: 'STU', human_review: false },
      { rule_id: 'ROUTE-10', category: 'LIBRARY', department: 'LIB', priority: 'P3', confidence_threshold: 0.7, fallback_department: 'STU', human_review: false },
      { rule_id: 'ROUTE-11', category: 'HOSTEL_MAINTENANCE', department: 'HOSTEL', priority: 'P2', confidence_threshold: 0.7, fallback_department: 'STU', human_review: false },
      { rule_id: 'ROUTE-12', category: 'CAMPUS_FACILITIES', department: 'FAC', priority: 'P3', confidence_threshold: 0.7, fallback_department: 'STU', human_review: false },
      { rule_id: 'ROUTE-13', category: 'TRANSPORT', department: 'TRAN', priority: 'P2', confidence_threshold: 0.7, fallback_department: 'STU', human_review: false },
      { rule_id: 'ROUTE-14', category: 'GRIEVANCE', department: 'STU', priority: 'P1', confidence_threshold: 0.8, fallback_department: 'STU', human_review: true },
      { rule_id: 'ROUTE-15', category: 'ADMISSIONS', department: 'ADMISSIONS', priority: 'P3', confidence_threshold: 0.7, fallback_department: 'STU', human_review: false },
      { rule_id: 'ROUTE-16', category: 'OTHER', department: 'STU', priority: 'P3', confidence_threshold: 0.7, fallback_department: 'STU', human_review: true },
    ];
    for (const r of fallbackRules) {
      this.rules.set(r.category, {
        ruleId: r.rule_id,
        category: r.category,
        department: r.department,
        priority: r.priority,
        confidenceThreshold: r.confidence_threshold,
        fallbackDepartment: r.fallback_department,
        humanReview: r.human_review,
      });
    }
  }

  /**
   * Apply deterministic routing rules after model prediction.
   * 
   * The model only provides predicted category and confidence score.
   * Permissions, department assignment, priority, and human review flags are strictly
   * enforced by this deterministic engine, NEVER by the AI model directly (Requirement 7).
   * 
   * @param {{
   *   category: string,
   *   confidence: number,
   *   model_name: string,
   *   alternatives?: Array
   * }} modelPrediction
   * @param {{ title: string, description?: string }} ticketContext
   */
  routeTicket(modelPrediction, ticketContext = {}) {
    const rawCategory = modelPrediction.category || 'OTHER';
    const confidence = typeof modelPrediction.confidence === 'number' ? modelPrediction.confidence : 0.0;
    const modelName = modelPrediction.model_name || 'SmartDesk-Classifier';

    // Retrieve deterministic rule for predicted category
    const isKnownCategory = this.rules.has(rawCategory);
    const rule = isKnownCategory ? this.rules.get(rawCategory) : this.rules.get('OTHER');

    const combinedText = `${ticketContext.title || ''} ${ticketContext.description || ''}`;

    // 1. Check content-based sensitive triggers (Requirement 9)
    const grievanceMatch = combinedText.match(GRIEVANCE_SENSITIVE_REGEX);
    const feeMatch = combinedText.match(FEE_DISCREPANCY_REGEX);
    const examMatch = combinedText.match(EXAM_DEADLINE_REGEX);

    const isSensitiveGrievance = Boolean(grievanceMatch);
    const isFeeDiscrepancy = Boolean(feeMatch);
    const isExamDeadline = Boolean(examMatch);

    let department = rule.department;
    let priority = rule.priority;
    let ruleApplied = rule.ruleId;
    let humanReviewRequired = rule.humanReview;
    let humanReviewReason = null;
    let isFallback = false;
    let fallbackReason = null;
    let clarifyingQuestion = null;

    // Apply special sensitive triggers
    if (isSensitiveGrievance) {
      department = 'STU';
      priority = 'P1';
      humanReviewRequired = true;
      const matchedTerm = grievanceMatch ? grievanceMatch[0].toLowerCase() : 'harassment';
      humanReviewReason = `Sensitive grievance or student welfare keyword (${matchedTerm}) detected. Mandatory confidential review by Student Affairs.`;
    } else if (isFeeDiscrepancy) {
      department = 'FEE';
      priority = 'P1';
      humanReviewRequired = true;
      const matchedTerm = feeMatch ? feeMatch[0].toLowerCase() : 'fee discrepancy';
      humanReviewReason = `Financial transaction discrepancy (${matchedTerm}) detected. Requires manual reconciliation by Accounts Section.`;
    } else if (isExamDeadline) {
      department = 'EXAM';
      priority = 'P1';
      humanReviewRequired = true;
      const matchedTerm = examMatch ? examMatch[0].toLowerCase() : 'examination deadline';
      humanReviewReason = `Critical examination deadline (${matchedTerm}) detected. Requires priority manual triage by Examinations Cell.`;
    } else if (rule.humanReview) {
      humanReviewReason = `Configured human-review rule for category: ${rule.category}`;
    }

    // 2. Check for unknown categories or low confidence threshold (Requirements 8 & 11)
    if (!isKnownCategory) {
      isFallback = true;
      department = rule.fallbackDepartment || 'STU';
      humanReviewRequired = true;
      fallbackReason = `Unknown category '${rawCategory}' not recognized by institutional routing rules; safely routed to review desk.`;
      if (!humanReviewReason) {
        humanReviewReason = `Unknown category '${rawCategory}' requires manual departmental triage.`;
      }
      clarifyingQuestion = 'We could not automatically identify a standard college department for your inquiry. Could you please specify which campus office you are trying to reach?';
    } else if (confidence < rule.confidenceThreshold) {
      isFallback = true;
      fallbackReason = `Confidence score (${(confidence * 100).toFixed(1)}%) is below the configured threshold of ${(rule.confidenceThreshold * 100).toFixed(1)}% for ${rule.category}.`;
      // Route to designated review / fallback department (e.g. STU)
      department = rule.fallbackDepartment || 'STU';
      humanReviewRequired = true;
      if (!humanReviewReason) {
        humanReviewReason = 'Low model confidence; routed to student affairs review desk.';
      }

      // Generate clarifying question for student fallback workflow
      clarifyingQuestion = this._generateClarifyingQuestion(rawCategory, modelPrediction.alternatives);
    }

    return {
      category: rawCategory,
      confidence: parseFloat(confidence.toFixed(4)),
      model_name: modelName,
      human_review_required: Boolean(humanReviewRequired),
      human_review_reason: humanReviewReason,
      department,
      department_name: DEPARTMENT_NAMES[department] || department,
      priority,
      rule_applied: ruleApplied,
      confidence_threshold: rule.confidenceThreshold,
      is_fallback: isFallback,
      fallback_reason: fallbackReason,
      fallback_department: rule.fallbackDepartment,
      clarifying_question: clarifyingQuestion,
      alternatives: modelPrediction.alternatives || [],
      // Authoritative security boundary (Requirement 7)
      authoritative: false, // Predictions and suggestions are non-authoritative
      requires_student_confirmation: true,
    };
  }

  /**
   * Helper: Generate context-aware clarifying questions when confidence is low
   */
  _generateClarifyingQuestion(predictedCategory, alternatives = []) {
    if (Array.isArray(alternatives) && alternatives.length > 0) {
      const topAlt = alternatives[0];
      const name1 = DEPARTMENT_NAMES[this.rules.get(predictedCategory)?.department] || predictedCategory;
      const name2 = DEPARTMENT_NAMES[this.rules.get(topAlt.category)?.department] || topAlt.category;
      return `We noticed your ticket could relate to either ${predictedCategory.replace(/_/g, ' ')} (${name1}) or ${topAlt.category.replace(/_/g, ' ')} (${name2}). Could you please clarify specific details so we can route it directly to the right department?`;
    }

    return 'Could you please provide a few more details about your inquiry to ensure it is routed directly to the appropriate department?';
  }
}

export const routingEngine = new DeterministicRoutingEngine();
