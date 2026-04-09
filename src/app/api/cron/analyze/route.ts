import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getQuote, getHistorical } from '@/lib/yahoo';
import { analyzeMarket } from '@/lib/openrouter';
import { fetchAllNews } from '@/lib/rss';
import { sendPushNotification } from '@/lib/push';
import { WATCHLIST_TICKERS, STOCKS } from '@/lib/stocks';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  const validSecret = process.env.CRON_SECRET;
  if (authHeader !== `Bearer ${validSecret}` && querySecret !== validSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: users } = await supabaseAdmin
      .from('user_settings')
      .select('user_id, push_subscription');

    if (!users?.length) return NextResponse.json({ status: 'no users' });

    const debugLog: any[] = [];

    for (const user of users) {
      const { data: positions } = await supabaseAdmin
        .from('positions')
        .select('*')
        .eq('user_id', user.user_id);

      const positionTickers = positions?.length
        ? [...new Set(positions.map((p: any) => p.ticker))]
        : [];

      // Merge portfolio tickers + watchlist (deduplicated)
      const tickers = [...new Set([...positionTickers, ...WATCHLIST_TICKERS])];

      // 1. Live-Kurse + History
      const quotes = await Promise.all(tickers.map(getQuote));
      const histories = await Promise.all(
        tickers.map(async (t) => ({
          ticker: t,
          prices: (await getHistorical(t, 30)).map((h) => h.close ?? 0),
          changePct: quotes.find((q) => q.ticker === t)?.change ?? 0,
        }))
      );

      // 2. Kurse speichern
      for (const q of quotes) {
        await supabaseAdmin.from('market_snapshots').insert({
          ticker: q.ticker, price: q.price, change_pct: q.change, volume: q.volume,
        });
      }

      // 3. News via RSS
      const news = await fetchAllNews(tickers);

      // 4. News archivieren für Backtesting
      for (const n of news.slice(0, 30)) {
        await supabaseAdmin.from('news_archive').upsert(
          { title: n.title, source: n.source, link: n.link, pub_date: n.pubDate || new Date().toISOString(), snippet: n.snippet },
          { onConflict: 'link' }
        ).catch(() => {});
      }

      // 5. KI-Analyse via OpenRouter
      const portfolio = (positions ?? []).map((p: any) => ({
        ticker: p.ticker,
        buyPrice: p.buy_price,
        quantity: p.quantity,
        currentPrice: quotes.find((q) => q.ticker === p.ticker)?.price ?? 0,
      }));

      const signals = await analyzeMarket({
        portfolio,
        news: news.map((n) => ({ title: n.title, source: n.source, snippet: n.snippet })),
        marketData: histories,
      });

      // 6. Signale speichern (mit user_id + status)
      const savedSignals: { id: string; ticker: string; action: string; confidence: number; reasoning: string }[] = [];
      for (const sig of signals) {
        const { data: saved } = await supabaseAdmin.from('signals').insert({
          ticker: sig.ticker, signal_type: sig.action, confidence: sig.confidence,
          reasoning: sig.reasoning, current_price: quotes.find((q) => q.ticker === sig.ticker)?.price,
          target_price: sig.targetPrice,
          user_id: user.user_id,
          status: 'pending',
        }).select('id').single();
        if (saved) savedSignals.push({ id: saved.id, ticker: sig.ticker, action: sig.action, confidence: sig.confidence, reasoning: sig.reasoning });
      }

      // 7. Push für jeden BUY mit hoher Konfidenz (Accept/Decline)
      const pushResults: any[] = [];
      if (user.push_subscription) {
        const buySignals = savedSignals.filter((s) => s.action === 'buy' && s.confidence > 0.6);
        for (const sig of buySignals.slice(0, 3)) {
          const ok = await sendPushNotification(user.push_subscription, {
            title: `KAUFEN: ${sig.ticker}`,
            body: sig.reasoning.slice(0, 120),
            ticker: sig.ticker,
            signal: 'buy',
            signal_id: sig.id,
            url: '/dashboard',
          });
          pushResults.push({ ticker: sig.ticker, type: 'buy', sent: ok });
        }
        // SELL signals without accept/decline (just info)
        const sellSignals = savedSignals.filter((s) => s.action === 'sell' && s.confidence > 0.65);
        for (const sig of sellSignals.slice(0, 2)) {
          const ok = await sendPushNotification(user.push_subscription, {
            title: `VERKAUFEN: ${sig.ticker}`,
            body: sig.reasoning.slice(0, 120),
            ticker: sig.ticker,
            signal: 'sell',
            signal_id: sig.id,
            url: '/dashboard',
          });
          pushResults.push({ ticker: sig.ticker, type: 'sell', sent: ok });
        }
      }

      debugLog.push({
        user_id: user.user_id,
        positions: positions.length,
        tickers,
        signals: savedSignals.map((s) => ({ ticker: s.ticker, action: s.action, confidence: s.confidence })),
        hasPushSub: !!user.push_subscription,
        push: pushResults,
      });
    }

    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString(), debug: debugLog });
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
