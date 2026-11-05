import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CANONICAL_CATEGORIES = [
  'IT_ACCESS',
  'NETWORK_WIFI',
  'LMS_TECHNICAL',
  'EXAM_HALL_TICKET',
  'EXAM_RESULTS',
  'FEE_PAYMENT',
  'SCHOLARSHIP',
  'ATTENDANCE',
  'CERTIFICATE_RECORDS',
  'LIBRARY',
  'HOSTEL_MAINTENANCE',
  'CAMPUS_FACILITIES',
  'TRANSPORT',
  'GRIEVANCE',
  'ADMISSIONS',
  'OTHER',
];

/**
 * Locate demo data directory containing ticket_classification_train.jsonl
 */
export function findDemoDataPath() {
  const candidates = [
    path.resolve(process.cwd(), 'SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl'),
    path.resolve(process.cwd(), 'SmartDesk_AI_Demo_Data_Pack/SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl'),
    path.resolve(__dirname, '../../../../SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl'),
    path.resolve(__dirname, '../../../../SmartDesk_AI_Demo_Data_Pack/SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl'),
    path.resolve(__dirname, '../../../SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl'),
    path.resolve(__dirname, '../../../SmartDesk_AI_Demo_Data_Pack/SmartDesk_AI_Demo_Data/data/ticket_classification_train.jsonl'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`ticket_classification_train.jsonl not found. Checked paths:\n${candidates.join('\n')}`);
}

/**
 * Locate routing_rules.json
 */
export function findRoutingRulesPath() {
  const candidates = [
    path.resolve(process.cwd(), 'SmartDesk_AI_Demo_Data/data/routing_rules.json'),
    path.resolve(process.cwd(), 'SmartDesk_AI_Demo_Data_Pack/SmartDesk_AI_Demo_Data/data/routing_rules.json'),
    path.resolve(__dirname, '../../../../SmartDesk_AI_Demo_Data/data/routing_rules.json'),
    path.resolve(__dirname, '../../../../SmartDesk_AI_Demo_Data_Pack/SmartDesk_AI_Demo_Data/data/routing_rules.json'),
    path.resolve(__dirname, '../../../SmartDesk_AI_Demo_Data/data/routing_rules.json'),
    path.resolve(__dirname, '../../../SmartDesk_AI_Demo_Data_Pack/SmartDesk_AI_Demo_Data/data/routing_rules.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`routing_rules.json not found. Checked paths:\n${candidates.join('\n')}`);
}

/**
 * Tokenize string for lexical similarity check
 */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Jaccard token similarity
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
 * Load raw samples from ticket_classification_train.jsonl
 */
export function loadClassificationDataset(filePath = null) {
  const resolvedPath = filePath || findDemoDataPath();
  const rawLines = fs.readFileSync(resolvedPath, 'utf-8').split(/\r?\n/).filter((l) => l.trim().length > 0);

  const samples = [];
  const classCounts = {};
  for (const code of CANONICAL_CATEGORIES) {
    classCounts[code] = 0;
  }

  for (let idx = 0; idx < rawLines.length; idx++) {
    const line = rawLines[idx];
    try {
      const parsed = JSON.parse(line);
      const sample = {
        id: `sample-${idx + 1}`,
        text: (parsed.text || '').trim(),
        label: (parsed.label || '').trim(),
        split: parsed.split || 'train_demo',
      };
      if (sample.text && sample.label) {
        samples.push(sample);
        classCounts[sample.label] = (classCounts[sample.label] || 0) + 1;
      }
    } catch {
      // Ignore invalid JSON lines
    }
  }

  return {
    filePath: resolvedPath,
    totalSamples: samples.length,
    classCounts,
    samples,
  };
}

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
 * Split dataset into train, validation, and test sets without data leakage.
 * 
 * Requirement 4 check:
 * If dataset is too small for a statistically reliable independent test split
 * (e.g., 43 samples across 16 categories, avg 2.6 per category), report this
 * limitation explicitly and treat as a functional demonstration dataset.
 */
export function splitDataset(options = {}) {
  const { seed = 42, customSamples = null, trainRatio = 0.70, valRatio = 0.15 } = options;
  const rawData = customSamples ? { samples: customSamples, totalSamples: customSamples.length } : loadClassificationDataset();
  const samples = rawData.samples;
  const rng = createSeededRandom(seed);

  // Group by label
  const byLabel = {};
  for (const code of CANONICAL_CATEGORIES) {
    byLabel[code] = [];
  }
  for (const s of samples) {
    if (!byLabel[s.label]) byLabel[s.label] = [];
    byLabel[s.label].push(s);
  }

  // Check statistical reliability threshold
  // With 16 classes, having fewer than 5 samples per class (< 80 total) makes standard 70/15/15 unreliable.
  const isTooSmallForReliableSplit = samples.length < 80;
  const limitationReport = isTooSmallForReliableSplit
    ? `Dataset size (${samples.length} samples across ${Object.keys(byLabel).length} categories) is too small for a statistically reliable independent validation/test split without classes having 0 test samples. Reported as a functional demonstration dataset.`
    : null;

  const train = [];
  const val = [];
  const test = [];

  for (const [label, classSamples] of Object.entries(byLabel)) {
    const list = [...classSamples];
    // Seeded shuffle
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }

    if (list.length === 1) {
      train.push(list[0]);
    } else if (list.length === 2) {
      train.push(list[0]);
      test.push(list[1]);
    } else if (list.length === 3) {
      train.push(list[0]);
      train.push(list[1]);
      test.push(list[2]);
    } else {
      const nTrain = Math.max(1, Math.floor(list.length * trainRatio));
      const nVal = Math.max(1, Math.floor(list.length * valRatio));
      train.push(...list.slice(0, nTrain));
      val.push(...list.slice(nTrain, nTrain + nVal));
      test.push(...list.slice(nTrain + nVal));
    }
  }

  // Leakage verification: compute max pairwise cross-split Jaccard similarity
  let maxCrossSplitSimilarity = 0;
  let leakageDetected = false;
  const testAndVal = [...val, ...test];

  for (const tr of train) {
    for (const tv of testAndVal) {
      const sim = jaccardSimilarity(tr.text, tv.text);
      if (sim > maxCrossSplitSimilarity) {
        maxCrossSplitSimilarity = sim;
      }
      if (sim >= 0.60) {
        leakageDetected = true;
      }
    }
  }

  return {
    meta: {
      totalSamples: samples.length,
      trainCount: train.length,
      valCount: val.length,
      testCount: test.length,
      seed,
      maxCrossSplitSimilarity: parseFloat(maxCrossSplitSimilarity.toFixed(4)),
      leakagePrevented: !leakageDetected,
      isTooSmallForReliableSplit,
      limitationReport,
    },
    train,
    val,
    test,
    allSamples: samples,
  };
}
