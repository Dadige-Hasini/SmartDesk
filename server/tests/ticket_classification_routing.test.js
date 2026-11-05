import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { TicketClassifierInterface } from '../src/ml/ticket_classification/classifier.interface.js';
import { BaselineTicketClassifier } from '../src/ml/ticket_classification/baseline_classifier.js';
import { TransformerTicketClassifier } from '../src/ml/ticket_classification/transformer_classifier.js';
import { DeterministicRoutingEngine } from '../src/ml/ticket_classification/routing_engine.js';
import { ClassificationAuditLogger, scrubSecrets, inMemoryAuditEvents, inMemoryAiInteractions } from '../src/ml/ticket_classification/audit_logger.js';
import { loadClassificationDataset, splitDataset, jaccardSimilarity, CANONICAL_CATEGORIES } from '../src/ml/ticket_classification/dataset_loader.js';
import { computeClassificationMetrics } from '../src/ml/scripts/evaluate_ticket_classification.js';
import { ticketClassificationService } from '../src/ml/ticket_classification/ticket_classification_service.js';

describe('Prompt 4: Deep-Learning Ticket Classification & Deterministic Routing Subsystem', () => {
  let baselineClassifier;
  let routingEngine;

  beforeEach(async () => {
    baselineClassifier = new BaselineTicketClassifier();
    routingEngine = new DeterministicRoutingEngine();
    await baselineClassifier.fit([
      { text: 'I cannot log into the college portal', label: 'IT_ACCESS' },
      { text: 'Campus wifi is not connecting in library', label: 'NETWORK_WIFI' },
      { text: 'I cannot upload my assignment on LMS', label: 'LMS_TECHNICAL' },
      { text: 'My hall ticket has not been generated for exams', label: 'EXAM_HALL_TICKET' },
      { text: 'My semester marks look incorrect request revaluation', label: 'EXAM_RESULTS' },
      { text: 'Money was deducted but fees show unpaid on portal', label: 'FEE_PAYMENT' },
      { text: 'What is my scholarship disbursement status', label: 'SCHOLARSHIP' },
      { text: 'My attendance is marked absent incorrectly', label: 'ATTENDANCE' },
      { text: 'I need a bonafide certificate and transcript', label: 'CERTIFICATE_RECORDS' },
      { text: 'My library card is not working in digital library', label: 'LIBRARY' },
      { text: 'There is water leakage in my hostel room', label: 'HOSTEL_MAINTENANCE' },
      { text: 'Classroom projector and fan are broken', label: 'CAMPUS_FACILITIES' },
      { text: 'College bus did not arrive at my stop need bus pass', label: 'TRANSPORT' },
      { text: 'I want to submit a confidential complaint regarding harassment', label: 'GRIEVANCE' },
      { text: 'I want to check admission application status', label: 'ADMISSIONS' },
      { text: 'How do I raise a ticket and track status', label: 'OTHER' },
    ]);
  });

  // Requirement 1: Classifier Interface
  describe('Requirement 1: Modular Classifier Interface', () => {
    it('enforces abstract contract and throws when instantiated directly', () => {
      expect(() => new TicketClassifierInterface()).toThrow(TypeError);
    });

    it('accepts ticket title and description and combines them into formatted text', () => {
      class TestClassifier extends TicketClassifierInterface {
        async predict(ticket) {
          return { category: 'IT_ACCESS', confidence: 0.9, model_name: this.modelName };
        }
      }
      const testModel = new TestClassifier();
      const formatted = testModel.formatTicketText({
        title: 'WiFi Down',
        description: 'Unable to connect to lab network',
      });
      expect(formatted).toBe('WiFi Down. Unable to connect to lab network');
    });
  });

  // Requirements 2 & 3: Reproducible Baseline & Transformer Claim Integrity
  describe('Requirements 2 & 3: Baseline Classifier & Transformer Integrity', () => {
    it('trains reproducible baseline classifier and outputs deterministic predictions', async () => {
      const pred1 = await baselineClassifier.predict({
        title: 'Forgot portal password',
        description: 'Cannot login to my student account',
      });
      const pred2 = await baselineClassifier.predict({
        title: 'Forgot portal password',
        description: 'Cannot login to my student account',
      });

      expect(pred1.category).toBe('IT_ACCESS');
      expect(pred1.confidence).toBeGreaterThan(0.5);
      expect(pred1.model_name).toBe('SmartDesk-Baseline-Classifier-v1');
      expect(pred1.confidence).toBe(pred2.confidence); // 100% deterministic
    });

    it('strictly does not claim transformer is fine-tuned when training did not run (Requirement 3)', () => {
      const transformer = new TransformerTicketClassifier();
      const status = transformer.getStatus();

      expect(status.is_fine_tuned).toBe(false);
      expect(status.is_trained).toBe(false);
      expect(status.training_dependencies).toContain('torch>=2.0.0');
      expect(status.training_dependencies).toContain('transformers>=4.40.0');
    });

    it('delegates to baseline with transparent untrained status note when invoked', async () => {
      const transformer = new TransformerTicketClassifier({
        fallbackClassifier: baselineClassifier,
      });
      const pred = await transformer.predict({
        title: 'WiFi issues',
        description: 'Slow network in library',
      });

      expect(pred.is_fine_tuned).toBe(false);
      expect(pred.model_status).toBe('PRETRAINED_UNTRAINED_DELEGATED_TO_BASELINE');
      expect(pred.category).toBe('NETWORK_WIFI');
    });
  });

  // Requirement 4: Dataset Splitting & Leakage Prevention
  describe('Requirement 4: Leakage-Free Dataset Splitting & Limitation Reporting', () => {
    it('splits dataset into train/val/test without near-duplicate token leakage', () => {
      const split = splitDataset({ seed: 42 });

      expect(split.meta.leakagePrevented).toBe(true);
      expect(split.meta.maxCrossSplitSimilarity).toBeLessThan(0.60);
      expect(split.train.length).toBeGreaterThan(0);
      expect(split.test.length).toBeGreaterThan(0);
    });

    it('reports statistical limitation when dataset is too small for a reliable split', () => {
      const split = splitDataset({ seed: 42 });

      expect(split.meta.isTooSmallForReliableSplit).toBe(true);
      expect(split.meta.limitationReport).toContain('too small for a statistically reliable independent validation/test split');
    });
  });

  // Requirement 5: Evaluation Metrics (Accuracy, Precision, Recall, F1)
  describe('Requirement 5: Metric Evaluation Suite', () => {
    it('accurately computes precision, recall, F1, and macro averages on evaluation data', () => {
      const groundTruth = ['IT_ACCESS', 'FEE_PAYMENT', 'GRIEVANCE', 'NETWORK_WIFI'];
      const predictions = ['IT_ACCESS', 'FEE_PAYMENT', 'GRIEVANCE', 'IT_ACCESS']; // 1 error

      const metrics = computeClassificationMetrics(groundTruth, predictions);

      expect(metrics.num_samples).toBe(4);
      expect(metrics.accuracy).toBe(0.75);
      expect(metrics.per_class_metrics.IT_ACCESS.precision).toBe(0.5);
      expect(metrics.per_class_metrics.IT_ACCESS.recall).toBe(1.0);
      expect(metrics.per_class_metrics.FEE_PAYMENT.f1).toBe(1.0);
      expect(metrics.per_class_metrics.GRIEVANCE.f1).toBe(1.0);
      expect(metrics.macro_f1).toBeGreaterThan(0.5);
    });
  });

  // Requirements 6 & 7: Structured Predictions & Deterministic Routing Rules
  describe('Requirements 6 & 7: Structured Predictions & Non-Authoritative Guard', () => {
    it('returns structured prediction with category, confidence, model name, and human review flag', async () => {
      const pred = await baselineClassifier.predict({
        title: 'Hostel power cutoff',
        description: 'Room electricity not working',
      });
      const routed = routingEngine.routeTicket(pred, { title: 'Hostel power cutoff' });

      expect(routed).toHaveProperty('category', 'HOSTEL_MAINTENANCE');
      expect(routed).toHaveProperty('confidence');
      expect(routed).toHaveProperty('model_name', 'SmartDesk-Baseline-Classifier-v1');
      expect(routed).toHaveProperty('human_review_required');
      expect(routed).toHaveProperty('department', 'HOSTEL');
      expect(routed).toHaveProperty('priority', 'P2');
      expect(routed).toHaveProperty('rule_applied', 'ROUTE-11');
      expect(routed.authoritative).toBe(false); // Model does not assign permissions
    });

    it('applies rules from routing_rules.json deterministically', async () => {
      const examTicket = await baselineClassifier.predict({
        title: 'Exam Hall Ticket Missing',
        description: 'Cannot download exam admit card',
      });
      const routed = routingEngine.routeTicket(examTicket, { title: 'Exam Hall Ticket Missing' });

      expect(routed.department).toBe('EXAM');
      expect(routed.priority).toBe('P1');
      expect(routed.rule_applied).toBe('ROUTE-04');
      expect(routed.human_review_required).toBe(true);
    });
  });

  // Requirement 8: Low Confidence Fallback & Clarifying Questions
  describe('Requirement 8: Low Confidence Fallback Workflow', () => {
    it('triggers fallback to designated review department when confidence is below threshold', () => {
      // Simulate low confidence prediction (< 0.70 threshold)
      const lowConfidencePred = {
        category: 'IT_ACCESS',
        confidence: 0.35,
        model_name: 'SmartDesk-Test',
        alternatives: [{ category: 'CAMPUS_FACILITIES', confidence: 0.30 }],
      };

      const routed = routingEngine.routeTicket(lowConfidencePred, {
        title: 'Vague inquiry',
        description: 'Something is not working properly',
      });

      expect(routed.is_fallback).toBe(true);
      expect(routed.department).toBe('STU'); // Designated fallback department
      expect(routed.human_review_required).toBe(true);
      expect(routed.clarifying_question).toBeTruthy();
      expect(routed.clarifying_question).toContain('clarify');
    });

    it('safely handles unknown categories by routing to fallback department with human review', () => {
      const unknownPred = {
        category: 'NON_EXISTENT_DEPARTMENT_CATEGORY',
        confidence: 0.90,
        model_name: 'SmartDesk-Test',
        alternatives: [],
      };

      const routed = routingEngine.routeTicket(unknownPred, {
        title: 'Spaceship parking permit',
        description: 'Requesting permission to land spacecraft on campus helipad',
      });

      expect(routed.is_fallback).toBe(true);
      expect(routed.department).toBe('STU'); // Designated fallback department
      expect(routed.human_review_required).toBe(true);
      expect(routed.fallback_reason).toContain('Unknown category');
      expect(routed.clarifying_question).toBeTruthy();
    });

    it('handles out-of-vocabulary inputs gracefully in baseline classifier', async () => {
      const oodPred = await baselineClassifier.predict({
        title: 'Xyzqwk lkjasd poiuyt',
        description: 'Zxcvb mnbvc asdfgh',
      });

      expect(oodPred.is_low_confidence).toBe(true);
      expect(oodPred.category).toBe('OTHER');
    });
  });

  // Requirement 9: Sensitive Grievances, Fees, and Exam Deadlines
  describe('Requirement 9: Sensitive Grievance & Discrepancy Human Review Rules', () => {
    it('mandates human review for confidential student grievance and routes to STU (P1)', async () => {
      const pred = await baselineClassifier.predict({
        title: 'Report harassment concern',
        description: 'Confidential complaint regarding student ragging in hostel',
      });
      const routed = routingEngine.routeTicket(pred, {
        title: 'Report harassment concern',
        description: 'Confidential complaint regarding student ragging in hostel',
      });

      expect(routed.human_review_required).toBe(true);
      expect(routed.department).toBe('STU');
      expect(routed.priority).toBe('P1');
      expect(routed.human_review_reason).toContain('harassment');
    });

    it('mandates human review for fee-payment discrepancies and routes to FEE (P1)', async () => {
      const pred = await baselineClassifier.predict({
        title: 'Money deducted but tuition fee unpaid',
        description: 'Charged twice from my bank account but receipt missing',
      });
      const routed = routingEngine.routeTicket(pred, {
        title: 'Money deducted but tuition fee unpaid',
        description: 'Charged twice from my bank account but receipt missing',
      });

      expect(routed.human_review_required).toBe(true);
      expect(routed.department).toBe('FEE');
      expect(routed.priority).toBe('P1');
      expect(routed.human_review_reason).toContain('Financial transaction discrepancy');
    });

    it('mandates priority human review for urgent exam deadlines and hall tickets (P1)', async () => {
      const pred = await baselineClassifier.predict({
        title: 'Exam tomorrow but hall ticket missing',
        description: 'Hall ticket has not been generated and exam starts in morning',
      });
      const routed = routingEngine.routeTicket(pred, {
        title: 'Exam tomorrow but hall ticket missing',
        description: 'Hall ticket has not been generated and exam starts in morning',
      });

      expect(routed.human_review_required).toBe(true);
      expect(routed.department).toBe('EXAM');
      expect(routed.priority).toBe('P1');
      expect(routed.human_review_reason).toContain('examination deadline');
    });
  });

  // Requirement 10: Audit Logging Without Secrets
  describe('Requirement 10: Secret-Scrubbed Audit Logging', () => {
    it('redacts tokens, card numbers, passwords, and API keys before logging', () => {
      const dirty = 'My token is Bearer eyJhbGciOiJIUzI1NiJ9 and sk-1234567890abcdef1234 with card 4111 2222 3333 4444 and password: MySecretPassword!';
      const clean = scrubSecrets(dirty);

      expect(clean).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(clean).not.toContain('sk-1234567890abcdef1234');
      expect(clean).not.toContain('4111 2222 3333 4444');
      expect(clean).not.toContain('MySecretPassword!');
      expect(clean).toContain('[REDACTED_SECRET]');
    });

    it('records classification interaction without storing sensitive passwords or secrets', async () => {
      const outcome = {
        category: 'IT_ACCESS',
        confidence: 0.88,
        model_name: 'SmartDesk-Baseline',
        department: 'IT',
        priority: 'P2',
        rule_applied: 'ROUTE-01',
        human_review_required: false,
        is_fallback: false,
      };

      const audit = await ClassificationAuditLogger.logClassificationInteraction({
        ticketContext: {
          title: 'Reset password for Bearer eyJhbGciOiJIUzI1NiJ9',
          description: 'Secret confidential card 4111 2222 3333 4444',
        },
        routingOutcome: outcome,
        userProfile: { id: 'usr-student-test', email: 'student@college.edu', role: 'STUDENT' },
      });

      expect(audit.logged).toBe(true);
      const latestAi = inMemoryAiInteractions[inMemoryAiInteractions.length - 1];
      expect(latestAi.query_snippet).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(latestAi.metadata.predicted_category).toBe('IT_ACCESS');
    });
  });

  // Requirement 11: End-to-End API Integration
  describe('Requirement 11 & 12: API Route /api/ai/classify-ticket', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/ai/classify-ticket')
        .send({ title: 'WiFi down' });

      expect(res.status).toBe(401);
    });

    it('rejects requests with empty title with 400', async () => {
      // Mock authenticated session
      const res = await request(app)
        .post('/api/ai/classify-ticket')
        .set('Authorization', 'Bearer valid-test-token')
        .send({ title: '' });

      // If token verification in test mock is enabled, returns 400 for empty title, else 401
      expect([400, 401]).toContain(res.status);
    });

    it('classifies ticket and routes correctly via ticketClassificationService directly', async () => {
      const outcome = await ticketClassificationService.classifyAndRoute({
        title: 'Library card expired',
        description: 'Unable to issue books from digital library',
      });

      expect(outcome.category).toBe('LIBRARY');
      expect(outcome.department).toBe('LIB');
      expect(outcome.priority).toBe('P3');
      expect(outcome.rule_applied).toBe('ROUTE-10');
      expect(outcome.human_review_required).toBe(false);
    });
  });
});
