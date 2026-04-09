import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: signalId } = await params;
  const { userId } = await req.json();

  if (!userId || !signalId) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('signals')
    .update({ status: 'declined' })
    .eq('id', signalId)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: 'declined' });
}
