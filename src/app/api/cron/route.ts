import { NextRequest, NextResponse } from 'next/server';
import { getQuote } from '@/lib/market-data';
import { analyseMarket } from '@/lib/claude-debate';
import { query } from '@/lib/db';

// Runs sequential Claude analysis for every watchlist ticker — needs extended timeout
export const maxDuration = 120;

function isWeekend(): boolean {
  // UTC day: 0 = Sunday, 6 = Saturday
  const day = new Date().getUTCDay();
  return day === 0 || day === 6;
}

async function analyseAndSave(ticker: string, assetType: string): Promise<void> {
  const horizon = '1 day';

  const quote = await getQuote(ticker);
  const debate = await analyseMarket(quote, ticker, horizon);

  const priceAtPrediction =
    assetType === 'forex'
      ? (quote as any).currentRate
      : (quote as any).currentPrice;

  await query(
    `INSERT INTO market_predictions
       (ticker, asset_type, verdict, confidence, action, horizon,
        price_at_prediction, bull_case, bear_case, risk_analysis,
        verdict_detail, summary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isWeekend()) {
    return NextResponse.json({
      analysed: [],
      failed: [],
      skipped: ['weekend — markets closed'],
      timestamp: new Date().toISOString(),
    });
  }

  const watchlist = await query(
    'SELECT ticker, asset_type FROM market_watchlist ORDER BY added_at ASC'
  );

  const analysed: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  for (const row of watchlist) {
    const ticker: string = row.ticker;
    const assetType: string = row.asset_type;

    try {
      await analyseAndSave(ticker, assetType);
      console.log(`[cron] ✓ ${ticker}`);
      analysed.push(ticker);
    } catch (err) {
      console.error(`[cron] ✗ ${ticker}:`, (err as Error).message);
      failed.push(ticker);
    }
  }

  return NextResponse.json({
    analysed,
    failed,
    skipped,
    timestamp: new Date().toISOString(),
  });
}
