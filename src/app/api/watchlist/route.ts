import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  const rows = await query(
    'SELECT * FROM market_watchlist ORDER BY added_at DESC'
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ticker, assetType, displayName } = body ?? {};

  if (!ticker || !assetType) {
    return NextResponse.json(
      { error: 'ticker and assetType are required' },
      { status: 400 }
    );
  }

  try {
    const rows = await query(
      `INSERT INTO market_watchlist (ticker, asset_type, display_name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [ticker.toUpperCase(), assetType, displayName ?? null]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err: any) {
    // Postgres unique_violation code
    if (err?.code === '23505') {
      return NextResponse.json(
        { error: `Ticker "${ticker.toUpperCase()}" is already on the watchlist` },
        { status: 409 }
      );
    }
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json(
      { error: 'Missing required query parameter: ticker' },
      { status: 400 }
    );
  }

  await query(
    'DELETE FROM market_watchlist WHERE ticker = $1',
    [ticker.toUpperCase()]
  );
  return NextResponse.json({ success: true });
}
