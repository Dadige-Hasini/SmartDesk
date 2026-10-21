import { GeminiProvider } from './providers/gemini.provider.js';
import { OpenAiProvider } from './providers/openai.provider.js';
import { MockProvider } from './providers/mock.provider.js';
import { logger } from '../../utils/logger.js';

class LlmService {
  constructor() {
    this.provider = null;
    this.providerName = 'mock';
    this.initProvider();
  }

  /**
   * Initialize configured provider based on env variables
   */
  initProvider(customProvider = null) {
    if (customProvider) {
      this.provider = customProvider;
      this.providerName = customProvider.constructor.name;
      return;
    }

    const providerChoice = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
    const apiKey = process.env.AI_API_KEY;
    const hasValidKey = Boolean(apiKey && apiKey.trim().length > 0 && apiKey !== 'your-ai-api-key-here');

    if (!hasValidKey || process.env.NODE_ENV === 'test') {
      logger.info('[LlmService] Using deterministic MockProvider (AI_API_KEY is not configured or in test mode)');
      this.provider = new MockProvider();
      this.providerName = 'mock';
      return;
    }

    switch (providerChoice) {
      case 'openai':
        this.provider = new OpenAiProvider({ apiKey });
        this.providerName = 'openai';
        break;
      case 'gemini':
      default:
        this.provider = new GeminiProvider({ apiKey });
        this.providerName = 'gemini';
        break;
    }

    logger.info(`[LlmService] Initialized LLM provider: ${this.providerName}`);
  }

  /**
   * Check provider configuration validity
   */
  getStatus() {
    return this.provider.validateConfig();
  }

  /**
   * Set custom provider (useful for test simulations of failure, timeouts)
   */
  setProvider(provider) {
    this.provider = provider;
    this.providerName = provider?.constructor?.name || 'custom';
  }

  /**
   * Generate completion with graceful fallback
   */
  async generateCompletion(options) {
    try {
      return await this.provider.generateCompletion(options);
    } catch (err) {
      logger.warn(`[LlmService] Provider ${this.providerName} failed: ${err.message}. Trying fallback.`);
      // If primary provider failed and it wasn't already the mock provider, attempt mock fallback
      if (this.providerName !== 'mock') {
        const fallback = new MockProvider();
        return await fallback.generateCompletion(options);
      }
      throw err;
    }
  }
}

export const llmService = new LlmService();
export { LlmService };
