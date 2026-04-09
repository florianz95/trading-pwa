import { NextRequest, NextResponse } from 'next/server';
import { getMultipleQuotes } from '@/lib/yahoo';

export async function GET(req: NextRequest) {
  const tickers = req.nextUrl.searchParams.get('tickers')?.split(',').filter(Boolean) ?? [];

  if (tickers.length === 0) {
    return NextResponse.json({ error: 'No tickers' }, { status: 400 });
  }

  try {
    const quotes = await getMultipleQuotes(tickers.slice(0, 20));
    return NextResponse.json({ quotes });
  } catch (err) {
    console.error('Quote fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
  }
}
