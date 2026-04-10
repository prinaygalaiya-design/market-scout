import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');

  const rows = await query(
    `SELECT
       p.*,
       o.id                   AS outcome_id,
       o.price_at_outcome,
       o.correct,
       o.price_change_percent,
       o.evaluated_at
     FROM market_predictions p
     LEFT JOIN market_prediction_outcomes o ON o.prediction_id = p.id
     ${ticker ? 'WHERE p.ticker = $1' : ''}
     ORDER BY p.created_at DESC
     LIMIT 50`,
    ticker ? [ticker.toUpperCase()] : undefined
  );

  return NextResponse.json(rows);
}
