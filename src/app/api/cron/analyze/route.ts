import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getQuote, getHistorical } from '@/lib/yahoo';
import { analyzeMarket } from '@/lib/openrouter';
import { fetchAllNews } from '@/lib/rss';
import { sendPushNotification } from '@/lib/push';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: users } = await supabaseAdmin
      .from('user_settings')
      .select('user_id, push_subscription');

    if (!users?.length) return NextResponse.json({ status: 'no users' });

    for (const user of users) {
      const { data: positions } = await supabaseAdmin
        .from('positions')
        .select('*')
        .eq('user_id', user.user_id);

      if (!positions?.length) continue;

      const tickers = [...new Set(positions.map((p) => p.ticker))];

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
      const portfolio = positions.map((p) => ({
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

      // 6. Signale speichern
      for (const sig of signals) {
        await supabaseAdmin.from('signals').insert({
          ticker: sig.ticker, signal_type: sig.action, confidence: sig.confidence,
          reasoning: sig.reasoning, current_price: quotes.find((q) => q.ticker === sig.ticker)?.price,
          target_price: sig.targetPrice,
        });
      }

      // 7. Push bei buy/sell + hoher Konfidenz
      const actionable = signals.filter((s) => s.action !== 'hold' && s.confidence > 0.6);
      if (actionable.length > 0 && user.push_subscription) {
        const top = actionable[0];
        const label = top.action === 'buy' ? 'KAUFEN' : 'VERKAUFEN';
        await sendPushNotification(user.push_subscription, {
          title: `${label}: ${top.ticker}`,
          body: top.reasoning.slice(0, 120),
          ticker: top.ticker, signal: top.action,
          url: `/dashboard?signal=${top.ticker}`,
        });
      }
    }

    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
