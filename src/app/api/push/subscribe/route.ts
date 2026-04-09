import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { subscription, userId } = await req.json();

  if (!subscription || !userId) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('user_settings')
    .upsert(
      { user_id: userId, push_subscription: subscription },
      { onConflict: 'user_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: 'subscribed' });
}
