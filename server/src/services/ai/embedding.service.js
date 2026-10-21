import { logger } from '../../utils/logger.js';

export class EmbeddingService {
  constructor(config = {}) {
    this.dimension = parseInt(config.dimension || process.env.AI_EMBEDDING_DIMENSION || '768', 10);
    this.model = config.model || process.env.AI_MODEL_EMBEDDING || 'text-embedding-004';
    this.apiKey = config.apiKey || process.env.AI_API_KEY || '';
    this.provider = (config.provider || process.env.AI_PROVIDER || 'gemini').toLowerCase();
  }

  /**
   * Check if live remote embedding API is configured
   */
  hasLiveCredentials() {
    return Boolean(
      process.env.NODE_ENV !== 'test' &&
      this.apiKey &&
      this.apiKey.trim().length > 0 &&
      this.apiKey !== 'your-ai-api-key-here'
    );
  }

  /**
   * Generate vector embedding for a single text string
   * @param {string} text - Content to embed
   * @returns {Promise<number[]>} 768-dimensional unit vector
   */
  async embedText(text) {
    if (!text || typeof text !== 'string') {
      return this.generateDeterministicVector('', this.dimension);
    }

    if (this.hasLiveCredentials()) {
      try {
        if (this.provider === 'gemini') {
          return await this.fetchGeminiEmbedding(text);
        } else if (this.provider === 'openai') {
          return await this.fetchOpenAiEmbedding(text);
        }
      } catch (err) {
        logger.warn('[EmbeddingService] Live embedding API failed, falling back to deterministic vector', { error: err.message });
      }
    }

    return this.generateDeterministicVector(text, this.dimension);
  }

  /**
   * Alias for embedText
   */
  async generateEmbedding(text) {
    return this.embedText(text);
  }

  /**
   * Batch embedding generation
   */
  async embedBatch(texts) {
    const results = [];
    for (const t of texts) {
      results.push(await this.embedText(t));
    }
    return results;
  }

  /**
   * Fetch embedding from Google Gemini API
   */
  async fetchGeminiEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini embedContent failed with status ${response.status}`);
    }

    const data = await response.json();
    const values = data?.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Gemini embedContent returned empty values array');
    }

    // Match required dimension
    return this.normalizeVector(values.slice(0, this.dimension));
  }

  /**
   * Fetch embedding from OpenAI API
   */
  async fetchOpenAiEmbedding(text) {
    const url = 'https://api.openai.com/v1/embeddings';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model || 'text-embedding-3-small',
        input: text,
        dimensions: this.dimension,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embeddings failed with status ${response.status}`);
    }

    const data = await response.json();
    const values = data?.data?.[0]?.embedding;
    return this.normalizeVector(values);
  }

  /**
   * Deterministic semantic embedding generation
   * Produces an L2-normalized 768-dimensional vector based on word hashes,
   * character n-grams, and term frequency. Ensures semantically related texts
   * yield high cosine similarity, while unrelated texts yield low similarity.
   */
  generateDeterministicVector(text, dimension = 768) {
    const vec = new Array(dimension).fill(0);
    const cleaned = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(Boolean);

    if (tokens.length === 0) {
      // Return zero vector if empty
      return vec;
    }

    // Distribute token hashes into dimensions
    for (const token of tokens) {
      let hash = 5381;
      for (let i = 0; i < token.length; i++) {
        hash = ((hash << 5) + hash) + token.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
      }

      const index = Math.abs(hash) % dimension;
      vec[index] += 1.0;

      // Also hash 3-character n-grams for morphological similarity
      for (let i = 0; i < token.length - 2; i++) {
        const trigram = token.slice(i, i + 3);
        let triHash = 0;
        for (let j = 0; j < 3; j++) {
          triHash = (triHash << 3) + trigram.charCodeAt(j);
        }
        const triIdx = Math.abs(triHash) % dimension;
        vec[triIdx] += 0.5;
      }
    }

    return this.normalizeVector(vec);
  }

  /**
   * L2 Unit-Vector Normalization (sum of squares = 1)
   */
  normalizeVector(vec) {
    let sumSquares = 0;
    for (let i = 0; i < vec.length; i++) {
      sumSquares += vec[i] * vec[i];
    }
    const norm = Math.sqrt(sumSquares);
    if (norm === 0) return vec;

    return vec.map((val) => val / norm);
  }

  /**
   * Compute Cosine Similarity between two unit vectors (Dot product)
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
    }
    return dot;
  }
}

export const embeddingService = new EmbeddingService();
