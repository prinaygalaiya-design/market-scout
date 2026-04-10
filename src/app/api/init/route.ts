import { NextRequest, NextResponse } from 'next/server';
import { initDB } from '@/lib/db';

const TABLES = [
  'market_watchlist',
  'market_predictions',
  'market_prediction_outcomes',
  'market_system_insights',
];

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await initDB();
  return NextResponse.json({ success: true, tables: TABLES });
}
