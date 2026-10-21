import { embeddingService } from '../services/ai/embedding.service.js';
import { CATEGORIES, CATEGORY_CODES, getCategoryByCode } from './taxonomy.js';

export class EmbeddingCategoryClassifier {
  constructor(options = {}) {
    this.modelName = options.modelName || 'SmartDesk-Embedding-Prototype-v1';
    this.modelVersion = options.modelVersion || '1.0.0';
    this.temperature = options.temperature || 0.08;
    this.minConfidenceThreshold = options.minConfidenceThreshold || 0.40;
    this.ambiguityMargin = options.ambiguityMargin || 0.08;

    // Prototypes: Map of category_code -> 768-dim normalized Float64Array
    this.classPrototypes = new Map();
    this.classKeywords = new Map();
    this.isTrained = false;
    this.trainingMeta = null;

    // Initialize keyword lexicon from taxonomy
    for (const cat of CATEGORIES) {
      this.classKeywords.set(cat.code, new Set(cat.keywords.map((k) => k.toLowerCase())));
    }
  }

  /**
   * Train the classifier by computing centroid prototype vectors for each of the 10 categories
   */
  async fit(trainingSamples) {
    if (!Array.isArray(trainingSamples) || trainingSamples.length === 0) {
      throw new Error('Training samples array must not be empty');
    }

    const byCategory = {};
    for (const code of CATEGORY_CODES) {
      byCategory[code] = [];
    }

    // Embed all training samples
    for (const sample of trainingSamples) {
      const embedding = await embeddingService.generateEmbedding(sample.text);
      if (byCategory[sample.category_code]) {
        byCategory[sample.category_code].push(embedding);
      }
    }

    // Compute mean prototype vector for each category
    for (const code of CATEGORY_CODES) {
      const vectors = byCategory[code];
      if (vectors.length === 0) {
        // Cold-start fallback: embed category description
        const catObj = getCategoryByCode(code);
        const fallbackVec = await embeddingService.generateEmbedding(
          `${catObj.name}: ${catObj.description} ${catObj.keywords.join(' ')}`
        );
        this.classPrototypes.set(code, fallbackVec);
        continue;
      }

      const dim = vectors[0].length;
      const centroid = new Float64Array(dim);

      for (const vec of vectors) {
        for (let i = 0; i < dim; i++) {
          centroid[i] += vec[i];
        }
      }

      // L2 Normalize centroid
      let norm = 0;
      for (let i = 0; i < dim; i++) {
        centroid[i] /= vectors.length;
        norm += centroid[i] * centroid[i];
      }
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (let i = 0; i < dim; i++) {
          centroid[i] /= norm;
        }
      }

      this.classPrototypes.set(code, Array.from(centroid));
    }

    this.isTrained = true;
    this.trainingMeta = {
      trainedAt: new Date().toISOString(),
      numSamples: trainingSamples.length,
      numClasses: CATEGORY_CODES.length,
    };

    return this.trainingMeta;
  }

  /**
   * Predict category, confidence score, alternatives, and ambiguity flags
   */
  async predict(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return this._fallbackResponse('Empty query provided');
    }

    // If not fitted, lazily initialize with taxonomy definitions
    if (!this.isTrained) {
      await this._fitFromTaxonomy();
    }

    const queryEmbedding = await embeddingService.generateEmbedding(text.trim());
    const queryLower = text.toLowerCase();

    // Compute raw cosine similarities and lexical boost
    const scores = [];
    for (const code of CATEGORY_CODES) {
      const proto = this.classPrototypes.get(code);
      let dot = 0;
      for (let i = 0; i < proto.length; i++) {
        dot += queryEmbedding[i] * proto[i];
      }

      // Minor lexical overlap boost for high-precision college terms
      let lexicalHits = 0;
      const kwSet = this.classKeywords.get(code);
      if (kwSet) {
        for (const kw of kwSet) {
          if (queryLower.includes(kw)) lexicalHits++;
        }
      }
      const lexicalBoost = Math.min(lexicalHits * 0.04, 0.12);

      scores.push({
        code,
        category: getCategoryByCode(code),
        similarity: dot,
        effectiveScore: dot + lexicalBoost,
      });
    }

    // Sort by effective score descending
    scores.sort((a, b) => b.effectiveScore - a.effectiveScore);

    // Apply Temperature-scaled Softmax over effective scores
    const maxScore = scores[0].effectiveScore;
    let expSum = 0;
    const expScores = scores.map((s) => {
      const exp = Math.exp((s.effectiveScore - maxScore) / this.temperature);
      expSum += exp;
      return exp;
    });

    const probabilities = scores.map((s, idx) => ({
      ...s,
      probability: expSum > 0 ? parseFloat((expScores[idx] / expSum).toFixed(4)) : 0.1,
    }));

    const top1 = probabilities[0];
    const top2 = probabilities[1];

    const isLowConfidence =
      top1.probability < this.minConfidenceThreshold || top1.similarity < 0.15;
    const isAmbiguous =
      top2 && top1.probability - top2.probability < this.ambiguityMargin;

    return {
      isAdvisory: true, // Suggestions are strictly non-authoritative
      topCandidateCode: top1.code,
      suggestedCategoryCode: isLowConfidence ? null : top1.code,
      suggestedCategoryId: isLowConfidence ? null : top1.category?.id,
      suggestedCategoryName: isLowConfidence ? null : top1.category?.name,
      suggestedDepartmentCode: isLowConfidence ? null : top1.category?.defaultDepartmentCode,
      confidenceScore: top1.probability,
      cosineSimilarity: parseFloat(top1.similarity.toFixed(4)),
      isLowConfidence,
      isAmbiguous,
      requiresManualFallback: isLowConfidence,
      alternatives: probabilities.slice(0, 3).map((p) => ({
        code: p.code,
        name: p.category?.name,
        confidence: p.probability,
        similarity: parseFloat(p.similarity.toFixed(4)),
      })),
    };
  }

  async _fitFromTaxonomy() {
    const defaultSamples = [];
    for (const cat of CATEGORIES) {
      defaultSamples.push({
        text: `${cat.name}. ${cat.description} Keywords: ${cat.keywords.join(', ')}`,
        category_code: cat.code,
      });
    }
    await this.fit(defaultSamples);
  }

  _fallbackResponse(reason) {
    return {
      isAdvisory: true,
      suggestedCategoryCode: null,
      suggestedCategoryId: null,
      suggestedCategoryName: null,
      confidenceScore: 0,
      isLowConfidence: true,
      isAmbiguous: false,
      requiresManualFallback: true,
      reason,
      alternatives: [],
    };
  }
}

/**
 * Metric Evaluation Suite: Accuracy, Precision, Recall, Macro-F1 & Confusion Matrix
 */
export function computeClassificationMetrics(groundTruthCodes, predictedCodes) {
  if (groundTruthCodes.length !== predictedCodes.length) {
    throw new Error('Ground truth and predictions must have identical lengths');
  }

  const n = groundTruthCodes.length;
  const numClasses = CATEGORY_CODES.length;

  // 10x10 Confusion Matrix: [actual_idx][pred_idx]
  const matrix = Array.from({ length: numClasses }, () =>
    new Array(numClasses).fill(0)
  );

  let correct = 0;
  let unclassified = 0;

  for (let i = 0; i < n; i++) {
    const actualCode = groundTruthCodes[i];
    const predCode = predictedCodes[i];

    const actualIdx = CATEGORY_CODES.indexOf(actualCode);
    const predIdx = CATEGORY_CODES.indexOf(predCode);

    if (predCode === null || predIdx === -1) {
      unclassified++;
      continue;
    }

    if (actualIdx !== -1 && predIdx !== -1) {
      matrix[actualIdx][predIdx]++;
    }

    if (actualCode === predCode) {
      correct++;
    }
  }

  const accuracy = n > 0 ? correct / n : 0;

  // Per-Class Metrics
  const perClass = {};
  let macroPrecisionSum = 0;
  let macroRecallSum = 0;
  let macroF1Sum = 0;

  for (let c = 0; c < numClasses; c++) {
    const code = CATEGORY_CODES[c];
    const tp = matrix[c][c];

    // Total actual ground truth count for class c
    const totalActual = groundTruthCodes.filter((g) => g === code).length;

    // Total predicted positives for class c (column sum)
    let totalPredicted = 0;
    for (let i = 0; i < numClasses; i++) {
      totalPredicted += matrix[i][c];
    }

    const precision = totalPredicted > 0 ? tp / totalPredicted : 0;
    const recall = totalActual > 0 ? tp / totalActual : 0;
    const f1 =
      precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    perClass[code] = {
      precision: parseFloat(precision.toFixed(4)),
      recall: parseFloat(recall.toFixed(4)),
      f1: parseFloat(f1.toFixed(4)),
      support: totalActual,
    };

    macroPrecisionSum += precision;
    macroRecallSum += recall;
    macroF1Sum += f1;
  }

  const macroPrecision = macroPrecisionSum / numClasses;
  const macroRecall = macroRecallSum / numClasses;
  const macroF1 = macroF1Sum / numClasses;

  return {
    num_samples: n,
    num_classes: numClasses,
    unclassified_count: unclassified,
    accuracy: parseFloat(accuracy.toFixed(4)),
    macro_precision: parseFloat(macroPrecision.toFixed(4)),
    macro_recall: parseFloat(macroRecall.toFixed(4)),
    macro_f1: parseFloat(macroF1.toFixed(4)),
    per_class_metrics: perClass,
    confusion_matrix: matrix,
    category_labels: CATEGORY_CODES,
  };
}

export const classifierService = new EmbeddingCategoryClassifier();
