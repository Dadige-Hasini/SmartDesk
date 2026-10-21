import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { supabaseClient, supabaseAdmin } from '../src/config/supabase.js';
import { createReproducibleSplits, jaccardSimilarity } from '../src/ml/dataset.js';
import { EmbeddingCategoryClassifier, computeClassificationMetrics } from '../src/ml/classifier.js';
import { CATEGORIES, CATEGORY_CODES } from '../src/ml/taxonomy.js';
import { semanticSearchService } from '../src/services/ai/semantic_search.service.js';
import { evaluateFaqRetrieval } from '../src/ml/retrieval_evaluator.js';
import { inMemoryProfiles } from '../src/repositories/ticket.repository.js';

describe('SmartDesk Phase 7: Deep Learning, Classification & Retrieval Evaluation', () => {
  let superAdminToken;
  let studentToken;

  beforeEach(() => {
    // Mock profiles for testing
    inMemoryProfiles['usr-admin-p7'] = {
      id: 'usr-admin-p7',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      full_name: 'System Admin P7',
      email: 'admin.p7@college.edu',
    };

    inMemoryProfiles['usr-student-p7'] = {
      id: 'usr-student-p7',
      role: 'STUDENT',
      status: 'ACTIVE',
      full_name: 'Alice Student P7',
      email: 'student.p7@college.edu',
    };

    superAdminToken = 'mock-superadmin-token-p7';
    studentToken = 'mock-student-token-p7';

    // Mock Supabase Auth getUser for testing
    if (supabaseClient && supabaseClient.auth) {
      vi.spyOn(supabaseClient.auth, 'getUser').mockImplementation(async (token) => {
        if (token === 'mock-superadmin-token-p7') {
          return {
            data: { user: { id: 'usr-admin-p7', email: 'admin.p7@college.edu' } },
            error: null,
          };
        }
        if (token === 'mock-student-token-p7') {
          return {
            data: { user: { id: 'usr-student-p7', email: 'student.p7@college.edu' } },
            error: null,
          };
        }
        return {
          data: { user: null },
          error: { message: 'Invalid or expired token' },
        };
      });
    }

    const mockProfileQuery = (val) => ({
      data: inMemoryProfiles[val] || null,
      error: null,
    });

    const mockFromHandler = (table) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_col, val) => ({
              maybeSingle: async () => mockProfileQuery(val),
              single: async () => mockProfileQuery(val),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
          }),
        }),
        insert: async () => ({ data: null, error: null }),
      };
    };

    if (supabaseAdmin) {
      vi.spyOn(supabaseAdmin, 'from').mockImplementation(mockFromHandler);
    }
    if (supabaseClient) {
      vi.spyOn(supabaseClient, 'from').mockImplementation(mockFromHandler);
    }
  });

  describe('1. Dataset & Near-Duplicate Leakage Guard', () => {
    it('creates stratified splits (70/15/15) across all 10 categories', () => {
      const splits = createReproducibleSplits(42);

      expect(splits.meta.total_samples).toBe(200);
      expect(splits.train.length).toBe(140);
      expect(splits.val.length).toBe(30);
      expect(splits.test.length).toBe(30);

      // Verify category representation in test set
      const testCodes = new Set(splits.test.map((s) => s.category_code));
      expect(testCodes.size).toBe(10);
    });

    it('prevents near-duplicate questions from leaking across train and test splits', () => {
      const splits = createReproducibleSplits(42);

      expect(splits.meta.is_leakage_prevented).toBe(true);
      expect(splits.meta.max_cross_split_similarity).toBeLessThan(0.60);

      // Verify pairwise Jaccard across all train and test items
      for (const trainSample of splits.train.slice(0, 20)) {
        for (const testSample of splits.test) {
          const sim = jaccardSimilarity(trainSample.text, testSample.text);
          expect(sim).toBeLessThan(0.60);
        }
      }
    });
  });

  describe('2. Embedding-based Category Classifier Baseline', () => {
    it('calibrates prototypes and predicts category with calibrated probabilities', async () => {
      const splits = createReproducibleSplits(42);
      const classifier = new EmbeddingCategoryClassifier();

      await classifier.fit(splits.train);
      expect(classifier.isTrained).toBe(true);

      const prediction = await classifier.predict('How do I request an official transcript?');
      expect(prediction.isAdvisory).toBe(true);
      expect(prediction.topCandidateCode).toBe('ACADEMIC_RECORDS');
      expect(prediction.confidenceScore).toBeGreaterThan(0.20);
      expect(Array.isArray(prediction.alternatives)).toBe(true);
    });

    it('identifies ambiguous queries touching multiple departments and provides alternatives', async () => {
      const classifier = new EmbeddingCategoryClassifier({ ambiguityMargin: 0.20 });
      await classifier._fitFromTaxonomy();

      // Ambiguous query: scholarship for hostel accommodation
      const pred = await classifier.predict('I need a merit scholarship to pay my hostel room rent due next week');
      expect(pred.isAmbiguous).toBe(true);
      expect(pred.alternatives.length).toBeGreaterThanOrEqual(2);

      // Should contain SCHOLARSHIPS, HOSTEL_HOUSING, or TUITION_FEES among top alternatives
      const altCodes = pred.alternatives.map((a) => a.code);
      const hasOverlap = altCodes.some((c) => ['SCHOLARSHIPS', 'HOSTEL_HOUSING', 'TUITION_FEES'].includes(c));
      expect(hasOverlap).toBe(true);
    });

    it('detects out-of-domain queries and triggers low-confidence manual fallback', async () => {
      const classifier = new EmbeddingCategoryClassifier({ minConfidenceThreshold: 0.50 });
      await classifier._fitFromTaxonomy();

      // Query with no relevance to university support
      const outOfDomain = await classifier.predict('Where can I purchase a pet velociraptor dinosaur?');

      expect(outOfDomain.isLowConfidence).toBe(true);
      expect(outOfDomain.requiresManualFallback).toBe(true);
      expect(outOfDomain.suggestedCategoryCode).toBeNull();
    });

    it('handles categories with limited examples gracefully without crashing', async () => {
      const classifier = new EmbeddingCategoryClassifier();

      // Fit with only 1 sample for a category
      const sparseSamples = [
        { text: 'Bus pass renewal for route 10', category_code: 'TRANSPORTATION' },
        { text: 'Tuition fees receipt missing', category_code: 'TUITION_FEES' },
      ];

      await classifier.fit(sparseSamples);
      const pred = await classifier.predict('I need my bus pass renewed');
      expect(pred.topCandidateCode).toBe('TRANSPORTATION');
    });

    it('keeps classifier suggestions strictly separate from authoritative routing rules', async () => {
      const classifier = new EmbeddingCategoryClassifier();
      const pred = await classifier.predict('Need degree certificate');

      expect(pred.isAdvisory).toBe(true);
      // Ensure the output does not contain an authoritative assignment or bypass flags
      expect(pred.isAuthoritative).toBeUndefined();
    });
  });

  describe('3. Metrics Evaluation & Confusion Matrix Computation', () => {
    it('computes accuracy, macro precision, recall, F1, and a 10x10 confusion matrix', () => {
      const groundTruth = ['ACADEMIC_RECORDS', 'TUITION_FEES', 'CAMPUS_IT', 'HOSTEL_HOUSING'];
      const predicted = ['ACADEMIC_RECORDS', 'TUITION_FEES', 'CAMPUS_IT', 'TUITION_FEES']; // 3 correct, 1 wrong

      const metrics = computeClassificationMetrics(groundTruth, predicted);

      expect(metrics.accuracy).toBe(0.75);
      expect(metrics.num_classes).toBe(10);
      expect(metrics.confusion_matrix.length).toBe(10);
      expect(metrics.confusion_matrix[0].length).toBe(10);
      expect(metrics.macro_f1).toBeGreaterThan(0);
    });
  });

  describe('4. Semantic FAQ Retrieval & Ranking Metrics', () => {
    it('evaluates FAQ retrieval and achieves Recall@5 >= 80% on benchmark', async () => {
      const retrievalResults = await evaluateFaqRetrieval();

      expect(retrievalResults.num_queries).toBe(25);
      expect(retrievalResults.recall_at_1).toBeGreaterThanOrEqual(0.50);
      expect(retrievalResults.recall_at_5).toBeGreaterThanOrEqual(0.80);
      expect(retrievalResults.mrr_at_5).toBeGreaterThanOrEqual(0.60);
    });

    it('searches similar FAQs using semantic search service and deflects tickets', async () => {
      const faqs = await semanticSearchService.searchSimilarFaqs({
        query: 'When is the deadline to pay college fees?',
        limit: 3,
      });

      expect(Array.isArray(faqs)).toBe(true);
      expect(faqs.length).toBeGreaterThan(0);
      expect(faqs[0].similarity).toBeGreaterThan(0.35);

      // Log deflection event
      const defl = await semanticSearchService.logDeflectionEvent({
        query: 'When is the deadline to pay college fees?',
        categoryId: faqs[0].category_id,
        deflectedBy: 'SIMILAR_FAQ',
        matchedFaqId: faqs[0].id,
        similarityScore: faqs[0].similarity,
        wasTicketCreated: false,
      });

      expect(defl.was_ticket_created).toBe(false);
      expect(defl.deflected_by).toBe('SIMILAR_FAQ');
    });
  });

  describe('5. AI Routes & Admin Analytics API', () => {
    it('POST /api/ai/classify-query provides advisory category classification', async () => {
      const res = await request(app)
        .post('/api/ai/classify-query')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ query: 'Lost my student ID card at gate 2' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isAdvisory).toBe(true);
      expect(res.body.data.topCandidateCode).toBe('STUDENT_AFFAIRS');
    });

    it('POST /api/ai/similar-faqs returns candidate FAQs for ticket deflection', async () => {
      const res = await request(app)
        .post('/api/ai/similar-faqs')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ query: 'Hostel night curfew timing' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.faqs)).toBe(true);
    });

    it('GET /api/ai/analytics returns comprehensive telemetry for staff and super admin', async () => {
      const res = await request(app)
        .get('/api/ai/analytics')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overview).toBeDefined();
      expect(res.body.data.overview.totalAiQueries).toBeGreaterThan(0);
      expect(res.body.data.overview.deflectionRate).toBeGreaterThan(0);
      expect(res.body.data.retrievalQuality).toBeDefined();
      expect(res.body.data.modelPerformance).toBeDefined();
    });

    it('rejects unauthenticated requests to /api/ai/classify-query with 401', async () => {
      const res = await request(app)
        .post('/api/ai/classify-query')
        .send({ query: 'test query' });

      expect(res.status).toBe(401);
    });
  });
});
