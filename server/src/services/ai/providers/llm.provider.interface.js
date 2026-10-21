/**
 * Base LLM Provider Interface
 * Standard contract for provider-independent LLM interactions.
 */
export class ILlmProvider {
  /**
   * Validate provider configuration and credentials.
   * @returns {{ valid: boolean, provider: string, model: string, error?: string }}
   */
  validateConfig() {
    throw new Error('validateConfig() must be implemented by provider.');
  }

  /**
   * Generate conversational or grounded completion.
   * @param {Object} options
   * @param {string} options.prompt - Formatted user prompt or query.
   * @param {string} [options.systemInstruction] - System shielding and behavioral instructions.
   * @param {Array<{ role: string, content: string }>} [options.history] - Prior messages in context.
   * @param {number} [options.temperature=0.2] - Sampling temperature (lower = more deterministic/grounded).
   * @param {number} [options.maxTokens=1024] - Maximum tokens in generation.
   * @returns {Promise<{ text: string, usage?: { promptTokens: number, completionTokens: number }, provider: string }>}
   */
  async generateCompletion(options) {
    throw new Error('generateCompletion() must be implemented by provider.');
  }
}
