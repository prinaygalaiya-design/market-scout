import { query } from '@/lib/db';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

interface AccuracyStats {
  overallAccuracy: number;
  totalEvaluated: number;
  bullAccuracy: number;
  bullTotal: number;
  bearAccuracy: number;
  bearTotal: number;
  neutralAccuracy: number;
  neutralTotal: number;
  highConfidenceAccuracy: number;  // confidence >= 70
  highConfidenceTotal: number;
  lowConfidenceAccuracy: number;   // confidence < 70
  lowConfidenceTotal: number;
  byTicker: Array<{
    ticker: string;
    accuracy: number;
    total: number;
    correct: number;
  }>;
}

interface MetaAnalysisResult {
  stats: AccuracyStats;
  insights: {
    patterns: string[];
    biases: string[];
    improvements: string[];
    strongestEdge: string;
    biggestBlindSpot: string;
    nextWeekFocus: string;
  };
}

async function callClaude(system: string, user: string): Promise<any> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 12000,
      thinking: { type: 'enabled', budget_tokens: 8000 },
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const textBlock = (data.content as any[])?.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text block found in Anthropic response');

  const raw = textBlock.text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  return JSON.parse(raw);
}

function pct(correct: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

export async function runMetaAnalysis(): Promise<MetaAnalysisResult | null> {
  // Load last 100 evaluated outcomes joined with prediction metadata
  const rows = await query(`
    SELECT
      o.id,
      o.ticker,
      o.verdict,
      o.confidence,
      o.correct,
      o.price_at_prediction,
      o.price_at_outcome,
      o.price_change_percent,
      o.horizon,
      o.evaluated_at,
      p.asset_type
    FROM market_prediction_outcomes o
    JOIN market_predictions p ON p.id = o.prediction_id
    ORDER BY o.evaluated_at DESC
    LIMIT 100
  `);

  if (rows.length < 5) {
    console.log(`[meta-analysis] only ${rows.length} outcomes — skipping (need ≥5)`);
    return null;
  }

  // ── Overall ──────────────────────────────────────────────────────────────
  const totalEvaluated = rows.length;
  const totalCorrect = rows.filter((r: any) => r.correct).length;

  // ── By verdict ───────────────────────────────────────────────────────────
  const bulls = rows.filter((r: any) => r.verdict === 'BULLISH');
  const bears = rows.filter((r: any) => r.verdict === 'BEARISH');
  const neutrals = rows.filter((r: any) => r.verdict === 'NEUTRAL');

  // ── By confidence bucket ─────────────────────────────────────────────────
  const highConf = rows.filter((r: any) => Number(r.confidence) >= 70);
  const lowConf = rows.filter((r: any) => Number(r.confidence) < 70);

  // ── By ticker (only tickers with ≥3 outcomes) ────────────────────────────
  const tickerMap = new Map<string, { correct: number; total: number }>();
  for (const r of rows) {
    const entry = tickerMap.get(r.ticker) ?? { correct: 0, total: 0 };
    entry.total++;
    if (r.correct) entry.correct++;
    tickerMap.set(r.ticker, entry);
  }

  const byTicker = Array.from(tickerMap.entries())
    .filter(([, v]) => v.total >= 3)
    .map(([ticker, v]) => ({
      ticker,
      accuracy: pct(v.correct, v.total),
      total: v.total,
      correct: v.correct,
    }))
    .sort((a, b) => b.total - a.total);

  const stats: AccuracyStats = {
    overallAccuracy: pct(totalCorrect, totalEvaluated),
    totalEvaluated,
    bullAccuracy: pct(bulls.filter((r: any) => r.correct).length, bulls.length),
    bullTotal: bulls.length,
    bearAccuracy: pct(bears.filter((r: any) => r.correct).length, bears.length),
    bearTotal: bears.length,
    neutralAccuracy: pct(neutrals.filter((r: any) => r.correct).length, neutrals.length),
    neutralTotal: neutrals.length,
    highConfidenceAccuracy: pct(highConf.filter((r: any) => r.correct).length, highConf.length),
    highConfidenceTotal: highConf.length,
    lowConfidenceAccuracy: pct(lowConf.filter((r: any) => r.correct).length, lowConf.length),
    lowConfidenceTotal: lowConf.length,
    byTicker,
  };

  // ── Last 20 incorrect predictions for pattern analysis ───────────────────
  const incorrect = rows
    .filter((r: any) => !r.correct)
    .slice(0, 20)
    .map((r: any) => ({
      ticker: r.ticker,
      verdict: r.verdict,
      confidence: r.confidence,
      priceChangePct: r.price_change_percent,
      horizon: r.horizon,
      assetType: r.asset_type,
    }));

  // ── Claude meta-analysis call ─────────────────────────────────────────────
  const system =
    'You are a quantitative trading system analyst. You have access to accuracy data from an ' +
    'AI market prediction system over its last evaluated predictions. Your job is to identify ' +
    'concrete, actionable patterns — not platitudes. Look for systematic biases (e.g., ' +
    'overconfident on bearish calls, poor on forex), directional blindspots, confidence ' +
    'miscalibration, and the most impactful improvement to make next week. Be specific and harsh.';

  const user =
    `Analyse the prediction accuracy data below for an AI market analysis system.\n\n` +
    `ACCURACY STATS (last ${totalEvaluated} evaluated predictions):\n` +
    JSON.stringify(stats, null, 2) +
    `\n\nLAST 20 INCORRECT PREDICTIONS:\n` +
    JSON.stringify(incorrect, null, 2) +
    `\n\nIdentify patterns, biases, and concrete improvements.\n` +
    `Respond with a raw JSON object only. No markdown, no code fences.\n\n` +
    `Return a JSON object with exactly these keys:\n` +
    `- patterns: array of 3-5 observed accuracy patterns with specific numbers from the data\n` +
    `- biases: array of 2-3 systematic biases the model exhibits (e.g., overconfident on X)\n` +
    `- improvements: array of 2-3 concrete, actionable changes to improve accuracy\n` +
    `- strongestEdge: one sentence — where the system performs best and why\n` +
    `- biggestBlindSpot: one sentence — the most costly systematic error\n` +
    `- nextWeekFocus: one sentence — single highest-priority improvement for next week`;

  const insights = await callClaude(system, user);

  // ── Persist to market_system_insights ────────────────────────────────────
  await query(
    `INSERT INTO market_system_insights
       (insight_type, content, accuracy_stats)
     VALUES ($1, $2, $3)`,
    [
      'meta-analysis',
      JSON.stringify(insights),
      JSON.stringify(stats),
    ]
  );

  console.log(
    `[meta-analysis] complete — ${totalEvaluated} predictions, ` +
      `${stats.overallAccuracy}% overall accuracy`
  );

  return { stats, insights };
}
