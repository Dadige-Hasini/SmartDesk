import { TicketClassifierInterface } from './classifier.interface.js';
import { CANONICAL_CATEGORIES, tokenize } from './dataset_loader.js';

// Domain keywords and semantic anchors for canonical categories
export const CATEGORY_KEYWORDS = {
  IT_ACCESS: ['login', 'account', 'password', 'portal', 'credentials', 'reset', 'unlock', 'locked', 'auth', 'student id'],
  NETWORK_WIFI: ['wifi', 'wi-fi', 'internet', 'network', 'connection', 'signal', 'disconnecting', 'router', 'bandwidth', 'ethernet'],
  LMS_TECHNICAL: ['lms', 'moodle', 'assignment', 'upload', 'submission', 'course page', 'portal error', 'quiz', 'online submission'],
  EXAM_HALL_TICKET: ['hall ticket', 'admit card', 'exam ticket', 'examination pass', 'seating', 'hallticket', 'exam registration'],
  EXAM_RESULTS: ['result', 'marks', 'grade', 'revaluation', 'rechecking', 'scorecard', 'transcript', 'semester result', 'cgpa'],
  FEE_PAYMENT: ['fee', 'payment', 'tuition', 'receipt', 'challan', 'transaction', 'paid', 'unpaid', 'deducted', 'charged twice', 'refund'],
  SCHOLARSHIP: ['scholarship', 'financial aid', 'stipend', 'grant', 'reimbursement', 'fellowship', 'waiver', 'concession'],
  ATTENDANCE: ['attendance', 'absent', 'present', 'percentage', 'shortage', 'medical leave', 'duty leave', 'biometric'],
  CERTIFICATE_RECORDS: ['bonafide', 'certificate', 'transcript', 'records', 'name correction', 'migration', 'degree', 'provisional'],
  LIBRARY: ['library', 'book', 'borrow', 'digital library', 'library card', 'fine', 'journal', 'catalog'],
  HOSTEL_MAINTENANCE: ['hostel', 'room', 'water', 'leakage', 'power', 'electricity', 'plumbing', 'mess', 'warden', 'geyser', 'curfew'],
  CAMPUS_FACILITIES: ['projector', 'fan', 'classroom', 'ac', 'air conditioner', 'whiteboard', 'desk', 'bench', 'lab equipment'],
  TRANSPORT: ['bus', 'transport', 'bus pass', 'route', 'pickup', 'stop', 'timing', 'driver', 'commute'],
  GRIEVANCE: ['grievance', 'complaint', 'harassment', 'ragging', 'discrimination', 'confidential', 'welfare concern', 'mental health'],
  ADMISSIONS: ['admission', 'enrollment', 'application', 'seat', 'counseling', 'eligibility', 'cutoff', 'intake'],
  OTHER: ['ticket', 'how do i', 'track', 'help desk', 'general query', 'support', 'status meaning', 'in progress'],
};

export class BaselineTicketClassifier extends TicketClassifierInterface {
  constructor(options = {}) {
    super({
      modelName: options.modelName || 'SmartDesk-Baseline-Classifier-v1',
      modelVersion: options.modelVersion || '1.0.0',
    });
    this.temperature = options.temperature || 0.12;
    this.minConfidenceThreshold = options.minConfidenceThreshold || 0.40;

    // Vocabulary: token -> index
    this.vocabulary = new Map();
    // IDF: tokenIndex -> float
    this.idf = [];
    // Category prototype vectors: Map of category_code -> Float64Array
    this.categoryPrototypes = new Map();
    // Class sample counts
    this.classCounts = new Map();
    this.isTrained = false;
    this.trainingMeta = null;
  }

  /**
   * Fit the classifier on training samples
   * 
   * @param {Array<{ text?: string, title?: string, description?: string, label: string }>} trainingSamples
   */
  async fit(trainingSamples) {
    if (!Array.isArray(trainingSamples) || trainingSamples.length === 0) {
      throw new Error('Training samples array must not be empty.');
    }

    // Reset state
    this.vocabulary.clear();
    this.categoryPrototypes.clear();
    this.classCounts.clear();

    for (const cat of CANONICAL_CATEGORIES) {
      this.classCounts.set(cat, 0);
    }

    // Step 1: Preprocess text and build vocabulary
    const documents = [];
    for (const sample of trainingSamples) {
      const text = this.formatTicketText(sample);
      const label = sample.label;
      const tokens = this._extractTokensAndNgrams(text);
      documents.push({ text, label, tokens });

      if (this.classCounts.has(label)) {
        this.classCounts.set(label, this.classCounts.get(label) + 1);
      }

      for (const token of tokens) {
        if (!this.vocabulary.has(token)) {
          this.vocabulary.set(token, this.vocabulary.size);
        }
      }
    }

    // Incorporate domain keywords into vocabulary
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const kw of keywords) {
        const kwTokens = this._extractTokensAndNgrams(kw);
        for (const t of kwTokens) {
          if (!this.vocabulary.has(t)) {
            this.vocabulary.set(t, this.vocabulary.size);
          }
        }
      }
    }

    const V = this.vocabulary.size;
    const N = documents.length;

    // Step 2: Compute IDF with smooth logarithmic weighting
    const docFreq = new Array(V).fill(0);
    for (const doc of documents) {
      const uniqueTokens = new Set(doc.tokens);
      for (const t of uniqueTokens) {
        const idx = this.vocabulary.get(t);
        if (idx !== undefined) docFreq[idx]++;
      }
    }

    this.idf = new Array(V);
    for (let i = 0; i < V; i++) {
      this.idf[i] = Math.log((N + 1) / (docFreq[i] + 1)) + 1.0;
    }

    // Step 3: Compute centroid prototype vectors for each category
    const categoryVectors = {};
    for (const cat of CANONICAL_CATEGORIES) {
      categoryVectors[cat] = new Float64Array(V);
    }

    for (const doc of documents) {
      const vec = this._vectorize(doc.tokens);
      const targetVec = categoryVectors[doc.label];
      if (targetVec) {
        for (let i = 0; i < V; i++) {
          targetVec[i] += vec[i];
        }
      }
    }

    // Keyword anchor reinforcement
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const targetVec = categoryVectors[cat];
      if (targetVec) {
        for (const kw of keywords) {
          const kwTokens = this._extractTokensAndNgrams(kw);
          const kwVec = this._vectorize(kwTokens);
          for (let i = 0; i < V; i++) {
            targetVec[i] += kwVec[i] * 1.5;
          }
        }
      }
    }

    // L2 Normalize each centroid prototype
    for (const cat of CANONICAL_CATEGORIES) {
      const vec = categoryVectors[cat];
      let norm = 0;
      for (let i = 0; i < V; i++) {
        norm += vec[i] * vec[i];
      }
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (let i = 0; i < V; i++) {
          vec[i] /= norm;
        }
      }
      this.categoryPrototypes.set(cat, vec);
    }

    this.isTrained = true;
    this.trainingMeta = {
      model_name: this.modelName,
      model_version: this.modelVersion,
      isTrained: true,
      trained_at: new Date().toISOString(),
      num_samples: trainingSamples.length,
      num_classes: CANONICAL_CATEGORIES.length,
      vocabulary_size: V,
    };

    return this.trainingMeta;
  }

  /**
   * Predict category from ticket title and description
   * 
   * @param {{ title: string, description?: string } | string} ticket
   */
  async predict(ticket) {
    const text = this.formatTicketText(ticket);
    if (!text || text.trim().length === 0) {
      return this._fallbackResponse('EMPTY_INPUT', 'Ticket title and description cannot be empty');
    }

    // Lazily train on keyword lexicon if not fitted yet
    if (!this.isTrained) {
      const coldStartSamples = [];
      for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        coldStartSamples.push({ text: keywords.join(' '), label: cat });
      }
      await this.fit(coldStartSamples);
    }

    const tokens = this._extractTokensAndNgrams(text);
    const queryVec = this._vectorize(tokens);

    // Check if query is completely out-of-vocabulary
    let queryNorm = 0;
    for (let i = 0; i < queryVec.length; i++) {
      queryNorm += queryVec[i] * queryVec[i];
    }
    if (queryNorm === 0) {
      return this._fallbackResponse('OUT_OF_VOCABULARY', 'Query tokens do not match any known college categories');
    }

    // Compute cosine similarities to category prototypes
    const scores = [];
    const textLower = text.toLowerCase();

    for (const cat of CANONICAL_CATEGORIES) {
      const proto = this.categoryPrototypes.get(cat);
      let dot = 0;
      if (proto) {
        for (let i = 0; i < proto.length; i++) {
          dot += queryVec[i] * proto[i];
        }
      }

      // Exact phrase / keyword lexical boost
      let lexicalHits = 0;
      const keywords = CATEGORY_KEYWORDS[cat] || [];
      for (const kw of keywords) {
        if (textLower.includes(kw.toLowerCase())) {
          lexicalHits++;
        }
      }
      const lexicalBoost = Math.min(lexicalHits * 0.08, 0.24);
      const effectiveScore = dot + lexicalBoost;

      scores.push({
        category: cat,
        rawSimilarity: parseFloat(dot.toFixed(4)),
        effectiveScore,
      });
    }

    // Sort descending by effective score
    scores.sort((a, b) => b.effectiveScore - a.effectiveScore);

    // Calibrated Temperature Softmax
    const maxScore = scores[0].effectiveScore;
    let expSum = 0;
    const expScores = scores.map((s) => {
      const exp = Math.exp((s.effectiveScore - maxScore) / this.temperature);
      expSum += exp;
      return exp;
    });

    const ranked = scores.map((s, idx) => ({
      category: s.category,
      confidence: expSum > 0 ? parseFloat((expScores[idx] / expSum).toFixed(4)) : 0.05,
      similarity: s.rawSimilarity,
    }));

    const top1 = ranked[0];
    const top2 = ranked[1];
    const isLowConfidence = top1.confidence < this.minConfidenceThreshold || top1.similarity < 0.05;

    return {
      category: top1.category,
      confidence: top1.confidence,
      model_name: this.modelName,
      model_version: this.modelVersion,
      is_low_confidence: isLowConfidence,
      cosine_similarity: top1.similarity,
      alternatives: ranked.slice(1, 4),
    };
  }

  /**
   * Helper: extract words + bigrams
   */
  _extractTokensAndNgrams(text) {
    const words = tokenize(text);
    const ngrams = [...words];

    for (let i = 0; i < words.length - 1; i++) {
      ngrams.push(`${words[i]}_${words[i + 1]}`);
    }
    return ngrams;
  }

  /**
   * Helper: Vectorize tokens into TF-IDF unit vector
   */
  _vectorize(tokens) {
    const V = this.vocabulary.size;
    const vec = new Float64Array(V);
    if (!tokens || tokens.length === 0) return vec;

    const tf = new Map();
    for (const t of tokens) {
      const idx = this.vocabulary.get(t);
      if (idx !== undefined) {
        tf.set(idx, (tf.get(idx) || 0) + 1);
      }
    }

    let norm = 0;
    for (const [idx, count] of tf.entries()) {
      const idfVal = this.idf[idx] || 1.0;
      const weight = (1 + Math.log(count)) * idfVal;
      vec[idx] = weight;
      norm += weight * weight;
    }

    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < V; i++) {
        vec[i] /= norm;
      }
    }
    return vec;
  }

  _fallbackResponse(code, message) {
    return {
      category: 'OTHER',
      confidence: 0.10,
      model_name: this.modelName,
      model_version: this.modelVersion,
      is_low_confidence: true,
      cosine_similarity: 0.0,
      reason: { code, message },
      alternatives: [
        { category: 'OTHER', confidence: 0.10 },
      ],
    };
  }
}
