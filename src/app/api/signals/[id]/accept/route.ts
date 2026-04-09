import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: signalId } = await params;
  const body = await req.json();
  const { userId, amount } = body;

  if (!userId || !signalId) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 });
  }

  // Fetch signal (must belong to this user)
  const { data: signal, error: sigErr } = await supabaseAdmin
    .from('signals')
    .select('*')
    .eq('id', signalId)
    .eq('user_id', userId)
    .single();

  if (sigErr || !signal) {
    return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
  }

  if (signal.status !== 'pending') {
    return NextResponse.json({ error: 'Signal already processed' }, { status: 409 });
  }

  // ── BUY: create position ─────────────────────────────────────────────────
  if (signal.signal_type === 'buy') {
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Amount required for buy' }, { status: 400 });
    }
    const buyPrice = signal.current_price;
    const quantity = amount / buyPrice;
    const today = new Date().toISOString().split('T')[0];
    const assetType = signal.ticker.includes('-USD')
      ? 'crypto'
      : ['GLD', 'SLV', 'FCX', 'NEM', 'XOM', 'CVX'].includes(signal.ticker)
      ? 'commodity'
      : 'stock';

    const { error: posErr } = await supabaseAdmin.from('positions').insert({
      user_id: userId,
      ticker: signal.ticker,
      name: signal.ticker,
      buy_price: buyPrice,
      quantity,
      buy_date: today,
      order_fee: 0.99,
      asset_type: assetType,
      from_signal_id: signalId,
    });

    if (posErr) {
      return NextResponse.json({ error: posErr.message }, { status: 500 });
    }

    await supabaseAdmin.from('signals').update({ status: 'accepted' }).eq('id', signalId);
    return NextResponse.json({ status: 'accepted', quantity, buyPrice });
  }

  // ── SELL: remove position from portfolio ─────────────────────────────────
  if (signal.signal_type === 'sell') {
    await supabaseAdmin
      .from('positions')
      .delete()
      .eq('user_id', userId)
      .eq('ticker', signal.ticker);

    await supabaseAdmin.from('signals').update({ status: 'accepted' }).eq('id', signalId);
    return NextResponse.json({ status: 'accepted', action: 'sold', ticker: signal.ticker });
  }

  // ── HOLD: acknowledge only, no portfolio change ──────────────────────────
  await supabaseAdmin.from('signals').update({ status: 'accepted' }).eq('id', signalId);
  return NextResponse.json({ status: 'accepted', action: 'held', ticker: signal.ticker });
}
