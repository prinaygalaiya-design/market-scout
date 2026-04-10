import { NextRequest, NextResponse } from 'next/server';
import { getQuote } from '@/lib/market-data';

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');

  if (!ticker || !ticker.trim()) {
    return NextResponse.json(
      { error: 'Missing required query parameter: ticker' },
      { status: 400 }
    );
  }

  try {
    const quote = await getQuote(ticker.trim());
    return NextResponse.json(quote);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch quote';
    const isNotFound = message.toLowerCase().includes('not found');
    return NextResponse.json(
      { error: message },
      { status: isNotFound ? 404 : 502 }
    );
  }
}
