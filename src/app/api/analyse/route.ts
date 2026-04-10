import { NextRequest, NextResponse } from 'next/server';
import { getQuote } from '@/lib/market-data';
import { analyseMarket } from '@/lib/claude-debate';
import { query } from '@/lib/db';

// 4 Claude calls with extended thinking — needs more than the 10s default
export const maxDuration = 120;

const VALID_HORIZONS = ['1 day', '1 week', '1 month'] as const;
type Horizon = typeof VALID_HORIZONS[number];

function validate(body: any): { ticker: string; horizon: Horizon } | { error: string } {
  const { ticker, horizon } = body ?? {};

  if (!ticker || typeof ticker !== 'string' || !ticker.trim()) {
    return { error: 'ticker is required and must be a non-empty string' };
  }
  if (ticker.trim().length > 20) {
    return { error: 'ticker must be 20 characters or fewer' };
  }
  if (!VALID_HORIZONS.includes(horizon)) {
    return { error: `horizon must be exactly one of: ${VALID_HORIZONS.join(', ')}` };
  }

  return { ticker: ticker.trim().toUpperCase(), horizon };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const validated = validate(body);

  if ('error' in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { ticker, horizon } = validated;

  const quote = await getQuote(ticker);
  const debate = await analyseMarket(quote, ticker, horizon);

  const priceAtPrediction =
    quote.assetType === 'forex'
      ? quote.currentRate
      : quote.currentPrice;

  const rows = await query(
    `INSERT INTO market_predictions
       (ticker, asset_type, verdict, confidence, action, horizon,
        price_at_prediction, bull_case, bear_case, risk_analysis,
        verdict_detail, summary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      ticker,
      quote.assetType,
      debate.verdict.verdict,
      debate.verdict.confidence,
      debate.verdict.action,
      horizon,
      priceAtPrediction ?? null,
      JSON.stringify(debate.bullCase),
      JSON.stringify(debate.bearCase),
      JSON.stringify(debate.riskAnalysis),
      JSON.stringify(debate.verdict),
      debate.verdict.summary ?? null,
    ]
  );

  const predictionId = rows[0].id;

  return NextResponse.json({
    prediction: {
      id: predictionId,
      ticker,
      verdict: debate.verdict.verdict,
      confidence: debate.verdict.confidence,
      action: debate.verdict.action,
      summary: debate.verdict.summary,
      keyLevels: debate.verdict.keyLevels,
      decidingFactor: debate.verdict.decidingFactor,
      horizon,
    },
    quote,
    debate: {
      bullCase: debate.bullCase,
      bearCase: debate.bearCase,
      riskAnalysis: debate.riskAnalysis,
    },
  });
}
