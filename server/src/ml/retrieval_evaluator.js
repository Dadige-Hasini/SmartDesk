import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { semanticSearchService } from '../services/ai/semantic_search.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BENCHMARK_PATH = path.join(__dirname, 'data', 'faq_retrieval_benchmark.json');

export async function evaluateFaqRetrieval(customBenchmark = null) {
  let benchmark = customBenchmark;
  if (!benchmark) {
    const raw = fs.readFileSync(BENCHMARK_PATH, 'utf-8');
    benchmark = JSON.parse(raw);
  }

  const testQueries = benchmark.test_queries || [];
  if (testQueries.length === 0) {
    throw new Error('No test queries found in retrieval benchmark');
  }

  let hitsAt1 = 0;
  let hitsAt3 = 0;
  let hitsAt5 = 0;
  let reciprocalRankSum = 0;
  const detailedResults = [];

  for (const item of testQueries) {
    const targetId = item.relevant_faq_id;
    const retrieved = await semanticSearchService.searchSimilarFaqs({
      query: item.query,
      limit: 10,
      minSimilarity: 0.20, // Low threshold to inspect ranks
    });

    let rank = -1;
    for (let r = 0; r < retrieved.length; r++) {
      if (retrieved[r].id === targetId) {
        rank = r + 1; // 1-based index
        break;
      }
    }

    const isHit1 = rank === 1;
    const isHit3 = rank >= 1 && rank <= 3;
    const isHit5 = rank >= 1 && rank <= 5;
    const rr = rank >= 1 && rank <= 5 ? 1 / rank : 0;

    if (isHit1) hitsAt1++;
    if (isHit3) hitsAt3++;
    if (isHit5) hitsAt5++;
    reciprocalRankSum += rr;

    detailedResults.push({
      query: item.query,
      targetId,
      retrievedRank: rank !== -1 ? rank : '>10',
      isHitAt5: isHit5,
      reciprocalRank: parseFloat(rr.toFixed(4)),
      topResult: retrieved[0] ? { id: retrieved[0].id, question: retrieved[0].question, similarity: retrieved[0].similarity } : null,
    });
  }

  const n = testQueries.length;
  const recallAt1 = n > 0 ? hitsAt1 / n : 0;
  const recallAt3 = n > 0 ? hitsAt3 / n : 0;
  const recallAt5 = n > 0 ? hitsAt5 / n : 0;
  const mrrAt5 = n > 0 ? reciprocalRankSum / n : 0;

  return {
    num_queries: n,
    recall_at_1: parseFloat(recallAt1.toFixed(4)),
    recall_at_3: parseFloat(recallAt3.toFixed(4)),
    recall_at_5: parseFloat(recallAt5.toFixed(4)),
    mrr_at_5: parseFloat(mrrAt5.toFixed(4)),
    detailed_results: detailedResults,
  };
}
