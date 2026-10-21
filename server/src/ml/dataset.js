import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CATEGORIES, CATEGORY_CODES } from './taxonomy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATASET_PATH = path.join(__dirname, 'data', 'student_queries_v1.json');
const MAX_LEAKAGE_THRESHOLD = 0.60; // Max allowed token Jaccard similarity between train and test/val

/**
 * Seeded pseudo-random number generator (Mulberry32) for exact reproducibility
 */
function createSeededRandom(seed = 42) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tokenize string into lowercase alphanumeric words
 */
export function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Compute Jaccard similarity between two token sets
 */
export function jaccardSimilarity(textA, textB) {
  const setA = new Set(tokenize(textA));
  const setB = new Set(tokenize(textB));

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Load raw dataset from disk
 */
export function loadDataset() {
  const raw = fs.readFileSync(DATASET_PATH, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Create deterministic Stratified Train/Val/Test Split with Leakage Guard
 * Split ratios: 70% Train, 15% Validation, 15% Test
 */
export function createReproducibleSplits(seed = 42, customDataset = null) {
  const dataset = customDataset || loadDataset();
  const allSamples = dataset.data;
  const rng = createSeededRandom(seed);

  // Group by category code
  const byCategory = {};
  for (const code of CATEGORY_CODES) {
    byCategory[code] = [];
  }

  for (const sample of allSamples) {
    if (byCategory[sample.category_code]) {
      byCategory[sample.category_code].push(sample);
    }
  }

  const train = [];
  const val = [];
  const test = [];

  // For each category, cluster near-duplicates then stratify
  for (const code of CATEGORY_CODES) {
    const samples = [...byCategory[code]];

    // Fisher-Yates shuffle with seeded RNG
    for (let i = samples.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [samples[i], samples[j]] = [samples[j], samples[i]];
    }

    // Cluster connected near-duplicates
    const clusters = [];
    const visited = new Set();

    for (let i = 0; i < samples.length; i++) {
      if (visited.has(i)) continue;
      const cluster = [samples[i]];
      visited.add(i);

      for (let j = i + 1; j < samples.length; j++) {
        if (visited.has(j)) continue;
        if (jaccardSimilarity(samples[i].text, samples[j].text) >= MAX_LEAKAGE_THRESHOLD) {
          cluster.push(samples[j]);
          visited.add(j);
        }
      }
      clusters.push(cluster);
    }

    // Flatten into split targets: roughly 14 train, 3 val, 3 test
    const categoryTrainTarget = Math.round(samples.length * 0.70);
    const categoryValTarget = Math.round(samples.length * 0.15);

    let catTrainCount = 0;
    let catValCount = 0;

    for (const cluster of clusters) {
      if (catTrainCount < categoryTrainTarget) {
        train.push(...cluster);
        catTrainCount += cluster.length;
      } else if (catValCount < categoryValTarget) {
        val.push(...cluster);
        catValCount += cluster.length;
      } else {
        test.push(...cluster);
      }
    }
  }

  // Leakage Audit: verify max cross-split similarity
  let maxLeakageScore = 0;
  let leakingPair = null;

  for (const t of train) {
    for (const te of test) {
      const sim = jaccardSimilarity(t.text, te.text);
      if (sim > maxLeakageScore) {
        maxLeakageScore = sim;
        leakingPair = { train: t.text, test: te.text, score: sim };
      }
    }
  }

  return {
    meta: {
      dataset_version: dataset.dataset_version,
      total_samples: allSamples.length,
      train_count: train.length,
      val_count: val.length,
      test_count: test.length,
      seed,
      max_cross_split_similarity: parseFloat(maxLeakageScore.toFixed(4)),
      is_leakage_prevented: maxLeakageScore < MAX_LEAKAGE_THRESHOLD,
    },
    train,
    val,
    test,
  };
}
