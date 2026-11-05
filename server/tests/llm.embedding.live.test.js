import { describe, it, expect, beforeAll } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, validateEnv } from '../src/config/env.js';
import { EmbeddingService } from '../src/services/ai/embedding.service.js';
import { OpenAiProvider } from '../src/services/ai/providers/openai.provider.js';
import { GeminiProvider } from '../src/services/ai/providers/gemini.provider.js';
import { llmService } from '../src/services/ai/llm.service.js';
import { sanitizeMeta } from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure local server/.env is loaded for tests
dotenv.config({ path: path.resolve(__dirname, '../.env') });

describe('SmartDesk Server-Side LLM & Embedding Service Integration', () => {
  let apiKey;
  let llmModel;
  let embeddingModel;
  let hasLiveCredentials = false;

  beforeAll(() => {
    apiKey = (process.env.LLM_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    llmModel = (process.env.LLM_MODEL || process.env.AI_MODEL_CHAT || 'gpt-4o-mini').trim();
    if (llmModel.startsWith('sk-')) {
      llmModel = 'gpt-4o-mini';
    }
    embeddingModel = (process.env.EMBEDDING_MODEL || process.env.AI_MODEL_EMBEDDING || 'text-embedding-3-small').trim();
    hasLiveCredentials = Boolean(apiKey && apiKey.length > 20 && apiKey !== 'your-ai-api-key-here');
  });

  describe('1. Environment Configuration & Secret Protection', () => {
    it('reads LLM_API_KEY, LLM_MODEL, and EMBEDDING_MODEL safely', () => {
      expect(config.ai).toBeDefined();
      expect(config.ai.embeddingDimension).toBe(768);
      expect(config.ai.chatModel).toBeDefined();
      expect(config.ai.embeddingModel).toBeDefined();
      if (hasLiveCredentials) {
        expect(config.ai.apiKey.length).toBeGreaterThan(10);
      }
    });

    it('validates environment at startup and returns safe diagnostics without leaking secrets', () => {
      const diagnostics = validateEnv();
      expect(diagnostics).toHaveProperty('isValid');
      expect(diagnostics).toHaveProperty('hasLiveAi');
      expect(diagnostics).toHaveProperty('provider');
      expect(diagnostics).toHaveProperty('chatModel');
      expect(diagnostics).toHaveProperty('embeddingModel');
      expect(diagnostics).toHaveProperty('embeddingDimension', 768);

      // Verify that no secret value is exposed in warnings or errors
      const diagnosticStr = JSON.stringify(diagnostics);
      if (apiKey) {
        expect(diagnosticStr).not.toContain(apiKey);
      }
    });

    it('redacts LLM_API_KEY, api_key, and secrets in structured logger metadata', () => {
      const sensitivePayload = {
        llm_api_key: apiKey || 'sk-test-secret-12345',
        api_key: 'secret-key-abc',
        password: 'mypassword',
        user: 'student@college.edu',
      };

      const sanitized = sanitizeMeta(sensitivePayload);
      expect(sanitized.llm_api_key).toBe('[REDACTED]');
      expect(sanitized.api_key).toBe('[REDACTED]');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.user).toBe('student@college.edu');
    });
  });

  describe('2. Vector Embedding Schema & Dimension Matching (768d)', () => {
    it('guarantees 768 dimensions matching Supabase pgvector schema under all conditions', async () => {
      const service = new EmbeddingService({
        dimension: 768,
        model: embeddingModel,
        apiKey: apiKey || 'mock-key',
      });

      expect(service.dimension).toBe(768);

      const queryVector = await service.embedText('How do I apply for bonafide certificate?');
      expect(Array.isArray(queryVector)).toBe(true);
      expect(queryVector.length).toBe(768);

      let sumSquares = 0;
      for (const val of queryVector) {
        expect(Number.isFinite(val)).toBe(true);
        sumSquares += val * val;
      }
      expect(Math.sqrt(sumSquares)).toBeCloseTo(1.0, 3);
    });

    it('uses the identical embedding model and dimension for both document indexing and query search', async () => {
      const service = new EmbeddingService({
        dimension: 768,
        model: embeddingModel,
        apiKey: apiKey || 'mock-key',
      });

      const docChunk = 'Hostel curfew for first-year undergraduate students is strictly 9:00 PM.';
      const studentQuery = 'What is the hostel curfew time?';

      const docEmbedding = await service.embedText(docChunk);
      const queryEmbedding = await service.embedText(studentQuery);

      expect(docEmbedding.length).toBe(service.dimension);
      expect(queryEmbedding.length).toBe(service.dimension);

      const similarity = service.cosineSimilarity(docEmbedding, queryEmbedding);
      expect(similarity).toBeGreaterThan(0.0);
    });
  });

  describe('3. Remote API Connectivity & Graceful Resilience Verification', () => {
    it('executes remote API call to OpenAI embedding endpoint and handles response or quota status', async () => {
      if (!hasLiveCredentials) {
        console.log('[Live AI Test] Skipped: No live LLM_API_KEY configured.');
        return;
      }

      const service = new EmbeddingService({
        dimension: 768,
        model: embeddingModel,
        apiKey,
        provider: 'openai',
      });

      try {
        const liveEmbedding = await service.fetchOpenAiEmbedding('SmartDesk official tuition fee refund policy');
        expect(Array.isArray(liveEmbedding)).toBe(true);
        expect(liveEmbedding.length).toBe(768);
      } catch (err) {
        // If OpenAI returns 429 quota exhausted, verify that the error was authentically returned by OpenAI API
        expect(err.message).toMatch(/(status 429|insufficient_quota|quota|credits)/i);
      }
    }, 30000);

    it('executes remote API call to OpenAI chat completion endpoint and handles response or quota status', async () => {
      if (!hasLiveCredentials) {
        console.log('[Live AI Test] Skipped: No live LLM_API_KEY configured.');
        return;
      }

      const provider = new OpenAiProvider({
        apiKey,
        model: llmModel,
      });

      try {
        const response = await provider.generateCompletion({
          prompt: 'Confirm SmartDesk AI service online in one short sentence.',
          temperature: 0.1,
          maxTokens: 50,
        });

        expect(response).toBeDefined();
        expect(typeof response.text).toBe('string');
        expect(response.provider).toBe('openai');
      } catch (err) {
        // If OpenAI returns 429 quota exhausted, verify that the error was authentically returned by OpenAI API
        expect(err.message).toMatch(/(status 429|insufficient_quota|quota|credits)/i);
      }
    }, 30000);

    it('verifies that LlmService and EmbeddingService fall back gracefully without crashing when quota is exhausted', async () => {
      // EmbeddingService fallback test
      const embedding = await new EmbeddingService({ dimension: 768, apiKey }).embedText('Query during quota limit');
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(768);

      // LlmService fallback test
      const completion = await llmService.generateCompletion({
        prompt: 'Student question during quota limit',
      });
      expect(completion).toBeDefined();
      expect(typeof completion.text).toBe('string');
      expect(completion.text.length).toBeGreaterThan(0);
    });
  });
});
