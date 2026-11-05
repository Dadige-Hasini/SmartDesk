import { ILlmProvider } from './llm.provider.interface.js';
import { logger } from '../../../utils/logger.js';

export class GeminiProvider extends ILlmProvider {
  constructor(config = {}) {
    super();
    this.apiKey = (config.apiKey || process.env.LLM_API_KEY || process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
    this.model = (config.model || process.env.LLM_MODEL || process.env.AI_MODEL_CHAT || 'gemini-1.5-flash').trim();
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.timeoutMs = config.timeoutMs || 25000;
  }

  validateConfig() {
    const hasKey = Boolean(this.apiKey && this.apiKey.trim().length > 0 && this.apiKey !== 'your-ai-api-key-here');
    return {
      valid: hasKey,
      provider: 'gemini',
      model: this.model,
      error: hasKey ? null : 'Missing valid LLM_API_KEY for Google Gemini provider.',
    };
  }

  async generateCompletion({ prompt, systemInstruction, history = [], temperature = 0.2, maxTokens = 1024 }) {
    const configStatus = this.validateConfig();
    if (!configStatus.valid) {
      throw new Error(`[GeminiProvider] ${configStatus.error}`);
    }

    const endpoint = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    // Convert history into Gemini contents format
    const contents = [];
    for (const msg of history) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    // Append current prompt
    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const requestBody = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        logger.error('[GeminiProvider] API Error Response', { status: response.status, body: errBody });
        throw new Error(`Gemini API returned status ${response.status}: ${errBody.slice(0, 200)}`);
      }

      const json = await response.json();
      const candidate = json?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || '';
      const usage = json?.usageMetadata ? {
        promptTokens: json.usageMetadata.promptTokenCount || 0,
        completionTokens: json.usageMetadata.candidatesTokenCount || 0,
      } : undefined;

      return {
        text,
        usage,
        provider: 'gemini',
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`[GeminiProvider] Request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    }
  }
}
