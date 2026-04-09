import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getQuote, getHistorical } from '@/lib/yahoo';
import { analyzeMarket } from '@/lib/openrouter';
import { fetchAllNews } from '@/lib/rss';
import { sendPushNotification } from '@/lib/push';
import { WATCHLIST_TICKERS } from '@/lib/stocks';

export const maxDuration = 60;

// ── Marktregime berechnen (SPY-Trend + VIX) ──────────────────────────────────
async function getMarketRegime(): Promise<{ regime: 'RISK_OFF' | 'NORMAL' | 'RISK_ON'; spyTrend: number; vix: number }> {
  try {
    const [spyHistory, vixQuote] = await Promise.all([
      getHistorical('SPY', 12),
      getQuote('^VIX').catch(() => ({ price: 20, ticker: '^VIX', change: 0, volume: 0, name: 'VIX', currency: 'USD' })),
    ]);
    const spyPrices = spyHistory.map((h) => h.close ?? 0).filter((p) => p > 0);
    const spyTrend = spyPrices.length >= 2
      ? ((spyPrices[spyPrices.length - 1] - spyPrices[0]) / spyPrices[0]) * 100
      : 0;
    const vix = vixQuote.price;
    let regime: 'RISK_OFF' | 'NORMAL' | 'RISK_ON' = 'NORMAL';
    if (spyTrend < -5 && vix > 25) regime = 'RISK_OFF';
    else if (spyTrend > 3 && vix < 18) regime = 'RISK_ON';
    return { regime, spyTrend, vix };
  } catch {
    return { regime: 'NORMAL', spyTrend: 0, vix: 20 };
  }
}

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

    // Marktregime einmal für alle User berechnen
    const { regime, spyTrend, vix } = await getMarketRegime();

    const debugLog: any[] = [];

    for (const user of users) {
      const { data: positions } = await supabaseAdmin
        .from('positions')
        .select('*')
        .eq('user_id', user.user_id);

      const positionTickers = positions?.length
        ? [...new Set(positions.map((p: any) => p.ticker))]
        : [];

      // ── Vorfilter: Quotes für alle Watchlist-Tickers holen ───────────────
      const allWatchlistTickers = [...new Set([...WATCHLIST_TICKERS, ...positionTickers])];
      const allQuotes = await Promise.all(allWatchlistTickers.map(getQuote));

      // Top-12 Mover aus Watchlist (exkl. Portfolio-Tickers)
      const positionTickerSet = new Set(positionTickers);
      const watchlistQuotes = allQuotes.filter((q) => !positionTickerSet.has(q.ticker));
      watchlistQuotes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
      const topWatchlist = watchlistQuotes.slice(0, 12).map((q) => q.ticker);
      const tickers = [...new Set([...positionTickers, ...topWatchlist])];

      const quotes = allQuotes.filter((q) => tickers.includes(q.ticker));
      const histories = await Promise.all(
        tickers.map(async (t) => ({
          ticker: t,
          prices: (await getHistorical(t, 30)).map((h) => h.close ?? 0),
          changePct: quotes.find((q) => q.ticker === t)?.change ?? 0,
        }))
      );

      // Kurse speichern
      for (const q of quotes) {
        await supabaseAdmin.from('market_snapshots').insert({
          ticker: q.ticker, price: q.price, change_pct: q.change, volume: q.volume,
        });
      }

      // News
      const news = await fetchAllNews(tickers);
      for (const n of news.slice(0, 30)) {
        try {
          await supabaseAdmin.from('news_archive').upsert(
            { title: n.title, source: n.source, link: n.link, pub_date: n.pubDate || new Date().toISOString(), snippet: n.snippet },
            { onConflict: 'link' }
          );
        } catch {}
      }

      // ── Guard-Rail-Daten aus DB laden ─────────────────────────────────────
      const now = Date.now();
      const ago15d = new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString();
      const ago30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      const ago7d  = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
      const ago3d  = new Date(now - 3  * 24 * 60 * 60 * 1000).toISOString();

      const [{ data: recentSells }, { data: buys30d }, { data: buys7d }, { data: recentBuys3d }] = await Promise.all([
        // Tickers bei denen in letzten 15 Tagen ein SELL-Signal kam → Cooldown
        supabaseAdmin.from('signals').select('ticker').eq('user_id', user.user_id)
          .eq('signal_type', 'sell').gte('created_at', ago15d),
        // Käufe pro Ticker in letzten 30 Tagen (max 2)
        supabaseAdmin.from('signals').select('ticker').eq('user_id', user.user_id)
          .eq('signal_type', 'buy').eq('status', 'accepted').gte('created_at', ago30d),
        // Käufe in letzter Woche (max 5 neue Positionen/Woche)
        supabaseAdmin.from('signals').select('ticker').eq('user_id', user.user_id)
          .eq('signal_type', 'buy').eq('status', 'accepted').gte('created_at', ago7d),
        // Käufe in letzten 3 Tagen → Mindesthaltedauer für Sells
        supabaseAdmin.from('signals').select('ticker').eq('user_id', user.user_id)
          .eq('signal_type', 'buy').gte('created_at', ago3d),
      ]);

      const cooldownTickers = new Set((recentSells ?? []).map((s: any) => s.ticker));
      const buyCounts30d: Record<string, number> = {};
      for (const s of buys30d ?? []) buyCounts30d[s.ticker] = (buyCounts30d[s.ticker] ?? 0) + 1;
      const newPositionsThisWeek = new Set((buys7d ?? []).map((s: any) => s.ticker)).size;
      const recentBuyTickers3d = new Set((recentBuys3d ?? []).map((s: any) => s.ticker));

      // ── Hard Stop-Loss / Take-Profit (Code, nicht KI) ────────────────────
      // Langfristig: Stop-Loss -15%, Take-Profit +50%
      const forcedSignals: { ticker: string; action: 'sell'; reason: string }[] = [];
      for (const p of positions ?? []) {
        const currentPrice = quotes.find((q) => q.ticker === p.ticker)?.price ?? p.buy_price;
        const pnlPct = ((currentPrice - p.buy_price) / p.buy_price) * 100;
        if (pnlPct <= -15) {
          forcedSignals.push({ ticker: p.ticker, action: 'sell', reason: `Stop-Loss: ${pnlPct.toFixed(1)}% unter Einstieg (${p.buy_price.toFixed(2)}€ → ${currentPrice.toFixed(2)}€). These hat sich nicht bewahrheitet, Verluste begrenzen.` });
        } else if (pnlPct >= 50) {
          forcedSignals.push({ ticker: p.ticker, action: 'sell', reason: `Gewinnmitnahme: +${pnlPct.toFixed(1)}% über Einstieg (${p.buy_price.toFixed(2)}€ → ${currentPrice.toFixed(2)}€). Ziel erreicht, Gewinne sichern.` });
        }
      }

      // ── KI-Analyse ────────────────────────────────────────────────────────
      const portfolioPositions = (positions ?? []).map((p: any) => ({
        ticker: p.ticker,
        buyPrice: p.buy_price,
        quantity: p.quantity,
        currentPrice: quotes.find((q) => q.ticker === p.ticker)?.price ?? 0,
        buyDate: p.buy_date,
      }));
      const watchlistCandidates = topWatchlist
        .filter((t) => !cooldownTickers.has(t))    // Cooldown
        .filter((t) => (buyCounts30d[t] ?? 0) < 2) // Max 2/30d
        .map((t) => {
          const price = quotes.find((q) => q.ticker === t)?.price ?? 0;
          return { ticker: t, buyPrice: price, quantity: 0, currentPrice: price };
        });

      const portfolio = [...portfolioPositions, ...watchlistCandidates];

      const aiSignals = await analyzeMarket({
        portfolio,
        news: news.map((n) => ({ title: n.title, source: n.source, snippet: n.snippet })),
        marketData: histories,
        regime,
        spyTrend,
        vix,
      });

      // ── Signale zusammenführen + Guard Rails anwenden ─────────────────────
      const allSignals = [
        ...forcedSignals.map((s) => ({ ...s, confidence: 0.95, reasoning: s.reason, targetPrice: undefined })),
        ...aiSignals,
      ];

      const savedSignals: { id: string; ticker: string; action: string; confidence: number; reasoning: string }[] = [];

      for (const sig of allSignals) {
        if (sig.action === 'buy') {
          if (regime === 'RISK_OFF') continue;                // Kein Kauf bei RISK_OFF
          if (cooldownTickers.has(sig.ticker)) continue;      // Cooldown
          if ((buyCounts30d[sig.ticker] ?? 0) >= 2) continue; // Max 2/30d
          if (newPositionsThisWeek >= 5) continue;             // Max 5 neue/Woche
        }
        if (sig.action === 'sell') {
          if (recentBuyTickers3d.has(sig.ticker) && sig.confidence < 0.90) continue; // Mindesthaltedauer (außer Hard Stop)
        }

        const { data: saved } = await supabaseAdmin.from('signals').insert({
          ticker: sig.ticker,
          signal_type: sig.action,
          confidence: sig.confidence,
          reasoning: sig.reasoning,
          current_price: quotes.find((q) => q.ticker === sig.ticker)?.price,
          target_price: (sig as any).targetPrice ?? null,
          user_id: user.user_id,
          status: 'pending',
        }).select('id').single();
        if (saved) savedSignals.push({ id: saved.id, ticker: sig.ticker, action: sig.action, confidence: sig.confidence, reasoning: sig.reasoning });
      }

      // ── Push-Benachrichtigungen ────────────────────────────────────────────
      const pushResults: any[] = [];
      if (user.push_subscription) {
        const buySignals = savedSignals.filter((s) => s.action === 'buy' && s.confidence > 0.60);
        for (const sig of buySignals.slice(0, 2)) {
          const ok = await sendPushNotification(user.push_subscription, {
            title: `Kaufempfehlung: ${sig.ticker}`,
            body: sig.reasoning.slice(0, 120),
            ticker: sig.ticker, signal: 'buy', signal_id: sig.id, url: '/dashboard',
          });
          pushResults.push({ ticker: sig.ticker, type: 'buy', sent: ok });
        }
        const sellSignals = savedSignals.filter((s) => s.action === 'sell');
        for (const sig of sellSignals.slice(0, 2)) {
          const ok = await sendPushNotification(user.push_subscription, {
            title: sig.confidence >= 0.90 ? `Stop-Loss erreicht: ${sig.ticker}` : `Verkaufsempfehlung: ${sig.ticker}`,
            body: sig.reasoning.slice(0, 120),
            ticker: sig.ticker, signal: 'sell', signal_id: sig.id, url: '/dashboard',
          });
          pushResults.push({ ticker: sig.ticker, type: 'sell', sent: ok });
        }
        const holdSignals = savedSignals.filter((s) => s.action === 'hold');
        if (holdSignals.length > 0 && buySignals.length === 0 && sellSignals.length === 0) {
          const ok = await sendPushNotification(user.push_subscription, {
            title: `Tagesupdate: ${holdSignals.length} Position${holdSignals.length > 1 ? 'en' : ''} im Blick`,
            body: holdSignals.map((s) => s.ticker).join(', ') + ' — weiter halten.',
            ticker: holdSignals[0].ticker, signal: 'hold', signal_id: holdSignals[0].id, url: '/dashboard',
          });
          pushResults.push({ type: 'hold_summary', sent: ok });
        }
      }

      debugLog.push({
        user_id: user.user_id,
        regime, spyTrend: spyTrend.toFixed(1), vix,
        positions: (positions ?? []).length,
        tickers,
        forcedSignals: forcedSignals.map((s) => s.ticker + ':' + s.reason.split(':')[0]),
        filteredOut: { cooldown: [...cooldownTickers] },
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
