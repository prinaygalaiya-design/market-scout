import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ASSET_UNIVERSE, getAssetByTicker } from '@/lib/asset-universe';
import { createRateLimiter, getClientIp } from '@/lib/rate-limiter';

export const maxDuration = 300;

const rateLimiter = createRateLimiter(3, 10 * 60 * 1000); // 3 per 10 min

const VALID_HORIZONS = new Set(['1 day', '1 week', '1 month']);

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

// ── Claude call ───────────────────────────────────────────────────────────────

async function callScout(predictionsText: string, horizon: string): Promise<any> {
  const system = `You are a senior portfolio manager reviewing analyst reports on 35 different assets. \
Your job is to identify the 10 highest-conviction opportunities from this universe for the specified \
investment horizon. You are optimising for: highest probability of being correct, best risk/reward \
ratio, and diversity across asset types. Do not just pick the highest confidence scores — consider \
the quality of the reasoning, the strength of the deciding factor, and whether the technical and \
fundamental cases align.`;

  const user = `Investment horizon: ${horizon}

Here are the latest analyst predictions for assets in the universe:

${predictionsText}

Select exactly 10 top picks from this universe. Return ONLY a JSON object with this exact structure:
{
  "picks": [
    {
      "ticker": "string",
      "rank": 1,
      "verdict": "BULLISH" | "BEARISH" | "NEUTRAL",
      "action": "BUY" | "SELL" | "HOLD" | "WATCH",
      "conviction": 0-100,
      "thesis": "2-3 sentences explaining WHY this is a top pick right now",
      "edge": "One sentence — what makes this opportunity better than the others",
      "risk": "One sentence — the main thing that could go wrong",
      "category": "forex" | "mega-cap" | "sector" | "etf"
    }
  ],
  "portfolioNote": "2-3 sentences on the overall market picture and how these picks fit together as a portfolio",
  "staleTickers": ["list of tickers that had no recent prediction data and were excluded"]
}

Rank 1 is the highest conviction pick. Ensure good diversity across categories where the data supports it.`;

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
  const textBlock = (data.content as any[])?.find((b: any) => b.type === 'text');
  if (!textBlock) throw new Error('No text block found in Anthropic response');

  const raw = textBlock.text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  return JSON.parse(raw);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Rate limit
  const ip = getClientIp(req);
  const { allowed, retryAfter } = rateLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  const body = await req.json().catch(() => null);
  const { horizon } = body ?? {};

  if (!horizon || !VALID_HORIZONS.has(horizon)) {
    return NextResponse.json(
      { error: 'horizon must be "1 day", "1 week", or "1 month"' },
      { status: 400 }
    );
  }

  const universeTickers = ASSET_UNIVERSE.map(a => a.ticker);

  // Fetch latest prediction per ticker (all universe assets)
  const predRows = await query(
    `SELECT DISTINCT ON (ticker)
       id, ticker, asset_type, verdict, confidence, action,
       summary, verdict_detail, bull_case, bear_case, created_at
     FROM market_predictions
     WHERE ticker = ANY($1)
     ORDER BY ticker, created_at DESC`,
    [universeTickers]
  );

  // Per-ticker accuracy from outcomes
  const accuracyRows = await query(
    `SELECT ticker,
       COUNT(*) FILTER (WHERE correct = true)::int  AS wins,
       COUNT(*) FILTER (WHERE correct = false)::int AS losses,
       COUNT(*)::int                                 AS total
     FROM market_prediction_outcomes
     WHERE ticker = ANY($1)
     GROUP BY ticker`,
    [universeTickers]
  );
  const accuracyMap = new Map<string, { wins: number; losses: number; total: number }>();
  for (const r of accuracyRows) {
    accuracyMap.set(r.ticker, { wins: r.wins, losses: r.losses, total: r.total });
  }

  // Determine stale tickers (no prediction in last 48 hours)
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const predMap = new Map<string, any>();
  for (const r of predRows) predMap.set(r.ticker, r);

  const staleTickers: string[] = [];
  const freshPreds: any[] = [];

  for (const ticker of universeTickers) {
    const pred = predMap.get(ticker);
    if (!pred || new Date(pred.created_at).getTime() < cutoff) {
      staleTickers.push(ticker);
    } else {
      freshPreds.push(pred);
    }
  }

  // Build structured summary for the prompt
  const summaryLines: string[] = [];
  for (const pred of freshPreds) {
    const asset = getAssetByTicker(pred.ticker);
    const acc = accuracyMap.get(pred.ticker);
    const accNote = acc && acc.total >= 3
      ? ` | Historical accuracy: ${Math.round((acc.wins / acc.total) * 100)}% (${acc.wins}/${acc.total})`
      : '';

    let verdictDetail: any = {};
    try { verdictDetail = JSON.parse(pred.verdict_detail ?? '{}'); } catch {}
    let bullCase: any = {};
    try { bullCase = JSON.parse(pred.bull_case ?? '{}'); } catch {}
    let bearCase: any = {};
    try { bearCase = JSON.parse(pred.bear_case ?? '{}'); } catch {}

    const category = asset?.category === 'megacap' ? 'mega-cap' : (asset?.category ?? 'unknown');

    summaryLines.push([
      `TICKER: ${pred.ticker} (${asset?.displayName ?? pred.ticker}) [${category}]`,
      `  Verdict: ${pred.verdict} | Action: ${pred.action} | Confidence: ${pred.confidence}%${accNote}`,
      pred.summary ? `  Summary: ${pred.summary}` : '',
      verdictDetail.decidingFactor ? `  Deciding factor: ${verdictDetail.decidingFactor}` : '',
      verdictDetail.keyLevels?.length
        ? `  Key levels: ${verdictDetail.keyLevels.map((kl: any) => `${kl.label} ${kl.level}`).join(', ')}`
        : '',
      bullCase.summary ? `  Bull thesis: ${bullCase.summary}` : '',
      bearCase.summary ? `  Bear thesis: ${bearCase.summary}` : '',
    ].filter(Boolean).join('\n'));
  }

  if (freshPreds.length < 5) {
    return NextResponse.json(
      {
        error: `Not enough fresh predictions to run the scout (found ${freshPreds.length}, need at least 5). Run the cron job first.`,
        staleTickers,
      },
      { status: 422 }
    );
  }

  const predictionsText = summaryLines.join('\n\n');

  // Call Claude
  const scoutResult = await callScout(predictionsText, horizon);

  // Merge displayName / assetType into picks from asset universe
  const enrichedPicks = (scoutResult.picks ?? []).map((pick: any) => {
    const asset = getAssetByTicker(pick.ticker);
    return {
      ...pick,
      displayName: asset?.displayName ?? pick.ticker,
      assetType: asset?.assetType ?? 'stock',
      category: asset?.category === 'megacap' ? 'mega-cap' : (asset?.category ?? pick.category),
    };
  });

  const result = {
    picks: enrichedPicks,
    portfolioNote: scoutResult.portfolioNote ?? '',
    staleTickers: scoutResult.staleTickers ?? staleTickers,
    horizon,
    freshCount: freshPreds.length,
    timestamp: new Date().toISOString(),
  };

  // Persist to market_system_insights
  try {
    await query(
      `INSERT INTO market_system_insights (insight_type, ticker, content, accuracy_stats)
       VALUES ('scout_result', 'SYSTEM', $1, $2)`,
      [
        JSON.stringify(result),
        JSON.stringify({ horizon, timestamp: result.timestamp, totalAssets: ASSET_UNIVERSE.length }),
      ]
    );
  } catch (err) {
    console.error('[scout] failed to persist result:', (err as Error).message);
  }

  return NextResponse.json(result);
}
