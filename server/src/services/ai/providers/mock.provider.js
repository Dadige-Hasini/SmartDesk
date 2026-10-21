import { ILlmProvider } from './llm.provider.interface.js';

/**
 * Deterministic Mock LLM Provider
 * Used when external AI credentials (AI_API_KEY) are not configured,
 * or during automated unit and integration tests.
 */
export class MockProvider extends ILlmProvider {
  constructor(config = {}) {
    super();
    this.model = config.model || 'mock-deterministic-v1';
    this.simulatedLatencyMs = config.simulatedLatencyMs || 50;
    this.simulateFailure = config.simulateFailure || false;
    this.simulateTimeout = config.simulateTimeout || false;
  }

  validateConfig() {
    return {
      valid: true,
      provider: 'mock',
      model: this.model,
      isMock: true,
      note: 'Mock LLM provider is active for test/offline execution. No live external API key is required.',
    };
  }

  async generateCompletion({ prompt, systemInstruction, history = [], temperature = 0.2, maxTokens = 1024 }) {
    if (this.simulateTimeout) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      throw new Error('[MockProvider] Request timed out after 2000ms');
    }

    if (this.simulateFailure) {
      throw new Error('[MockProvider] Simulated upstream LLM provider outage');
    }

    if (this.simulatedLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedLatencyMs));
    }

    // 1. Anti-injection check: if prompt contains malicious injection attempts
    const isInjection = /ignore (all |previous )?instructions|override system|bypass security|say "fees are free"/i.test(prompt);
    if (isInjection) {
      return {
        text: 'I cannot comply with requests to alter system instructions, bypass security rules, or provide ungrounded claims. I can only assist you with verified college policies grounded in approved documentation.',
        usage: { promptTokens: 30, completionTokens: 35 },
        provider: 'mock',
      };
    }

    // 2. Ticket Suggestion extraction
    if (prompt.includes('TICKET_DRAFT_EXTRACTION') || prompt.includes('Suggest a ticket draft')) {
      return {
        text: JSON.stringify({
          title: 'Inquiry Regarding Academic Procedure',
          description: 'Student seeking departmental clarification on procedure.',
          category: 'General Academic',
          priority: 'Medium',
          missingInformation: null,
        }),
        usage: { promptTokens: 40, completionTokens: 40 },
        provider: 'mock',
      };
    }

    // 3. Grounded completion synthesis from Context Passages
    // If context contains specific knowledge passages, synthesize grounded response
    const contextMatch = prompt.match(/### CONTEXT PASSAGES:\s*([\s\S]*?)(?:### USER QUERY|$)/i);
    const passagesText = contextMatch ? contextMatch[1].trim() : '';

    if (!passagesText || passagesText === 'NO_RELEVANT_PASSAGES_FOUND') {
      return {
        text: 'I could not find sufficient information in the approved college regulations or knowledge base to answer your question accurately. Would you like me to help draft a support ticket to the appropriate department?',
        usage: { promptTokens: 25, completionTokens: 42 },
        provider: 'mock',
      };
    }

    // Synthesize response based on the actual passage text provided
    return {
      text: `Based on the approved college regulations, here is the relevant guidance:\n\n${passagesText.slice(0, 350)}...\n\nPlease refer to the official document for complete terms and procedural conditions.`,
      usage: { promptTokens: 120, completionTokens: 60 },
      provider: 'mock',
    };
  }
}
