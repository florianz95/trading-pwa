import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: signalId } = await params;
  const { userId, amount } = await req.json();

  if (!userId || !signalId || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 });
  }

  // Fetch signal (must belong to this user)
  const { data: signal, error: sigErr } = await supabaseAdmin
    .from('signals')
    .select('*')
    .eq('id', signalId)
    .eq('user_id', userId)
    .eq('signal_type', 'buy')
    .single();

  if (sigErr || !signal) {
    return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
  }

  if (signal.status !== 'pending') {
    return NextResponse.json({ error: 'Signal already processed' }, { status: 409 });
  }

  const buyPrice = signal.current_price;
  const quantity = amount / buyPrice;
  const today = new Date().toISOString().split('T')[0];

  // Determine asset type from ticker
  const assetType = signal.ticker.includes('-USD')
    ? 'crypto'
    : ['GLD', 'SLV', 'FCX', 'NEM', 'XOM', 'CVX'].includes(signal.ticker)
    ? 'commodity'
    : 'stock';

  // Create position
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

  // Mark signal as accepted
  await supabaseAdmin
    .from('signals')
    .update({ status: 'accepted' })
    .eq('id', signalId);

  return NextResponse.json({ status: 'accepted', quantity, buyPrice });
}
