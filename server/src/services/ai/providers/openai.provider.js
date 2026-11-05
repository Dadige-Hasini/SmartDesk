import { ILlmProvider } from './llm.provider.interface.js';
import { logger } from '../../../utils/logger.js';

export class OpenAiProvider extends ILlmProvider {
  constructor(config = {}) {
    super();
    this.apiKey = (config.apiKey || process.env.LLM_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    let model = (config.model || process.env.LLM_MODEL || process.env.AI_MODEL_CHAT || 'gpt-4o-mini').trim();
    if (!model || model.startsWith('sk-')) {
      model = 'gpt-4o-mini';
    }
    this.model = model;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.timeoutMs = config.timeoutMs || 25000;
  }

  validateConfig() {
    const hasKey = Boolean(this.apiKey && this.apiKey.trim().length > 0 && this.apiKey !== 'your-ai-api-key-here');
    return {
      valid: hasKey,
      provider: 'openai',
      model: this.model,
      error: hasKey ? null : 'Missing valid LLM_API_KEY for OpenAI provider.',
    };
  }

  async generateCompletion({ prompt, systemInstruction, history = [], temperature = 0.2, maxTokens = 1024 }) {
    const configStatus = this.validateConfig();
    if (!configStatus.valid) {
      throw new Error(`[OpenAiProvider] ${configStatus.error}`);
    }

    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    for (const msg of history) {
      messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
    }
    messages.push({ role: 'user', content: prompt });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        logger.error('[OpenAiProvider] API Error Response', { status: response.status, body: errText });
        throw new Error(`OpenAI API returned status ${response.status}: ${errText.slice(0, 200)}`);
      }

      const json = await response.json();
      const text = json?.choices?.[0]?.message?.content || '';
      const usage = json?.usage ? {
        promptTokens: json.usage.prompt_tokens,
        completionTokens: json.usage.completion_tokens,
      } : undefined;

      return {
        text,
        usage,
        provider: 'openai',
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`[OpenAiProvider] Request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    }
  }
}
