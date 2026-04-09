import 'dotenv/config';
import OpenAI from 'openai';
import YahooFinance from 'yahoo-finance2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const yf = new YahooFinance();
const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: { 'HTTP-Referer': 'https://trading-advisor.vercel.app' }
});

const MODEL = process.env.LLM_MODEL ?? 'anthropic/claude-haiku-4.5';
const BUDGET = 100;
const MAX_POSITIONS = 3;          // nur Top-N BUY-Signale
const DECISION_DATE = '2026-03-19';
const END_DATE_STOCKS = '2026-04-08';
const END_DATE_CRYPTO = '2026-04-09';

const SYSTEM_PROMPT = fs.readFileSync(path.resolve(__dirname, '../src/lib/openrouter.ts'), 'utf8')
  .match(/const SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`;/)[1];

const ASSETS = [
  { ticker: 'AAPL',    name: 'Apple',      type: 'Aktie'   },
  { ticker: 'MSFT',    name: 'Microsoft',  type: 'Aktie'   },
  { ticker: 'NVDA',    name: 'NVIDIA',     type: 'Aktie'   },
  { ticker: 'TSLA',    name: 'Tesla',      type: 'Aktie'   },
  { ticker: 'JPM',     name: 'JP Morgan',  type: 'Aktie'   },
  { ticker: 'XOM',     name: 'ExxonMobil', type: 'Aktie'   },
  { ticker: 'CVX',     name: 'Chevron',    type: 'Aktie'   },
  { ticker: 'GLD',     name: 'Gold ETF',   type: 'Rohstoff' },
  { ticker: 'FCX',     name: 'Freeport',   type: 'Rohstoff' },
  { ticker: 'NEM',     name: 'Newmont',    type: 'Rohstoff' },
  { ticker: 'BTC-USD', name: 'Bitcoin',    type: 'Krypto'  },
  { ticker: 'ETH-USD', name: 'Ethereum',   type: 'Krypto'  },
  { ticker: 'SOL-USD', name: 'Solana',     type: 'Krypto'  },
];

async function getPricesUpTo(ticker, endDate) {
  const end = new Date(endDate);
  end.setDate(end.getDate() + 1);
  const start = new Date(endDate);
  start.setDate(start.getDate() - 35);
  const r = await yf.chart(ticker, { period1: start, period2: end, interval: '1d' });
  return r.quotes.filter(q => q.close != null).map(q => ({
    date: q.date.toISOString().split('T')[0],
    close: q.close
  }));
}

async function getSignal(ticker, prices) {
  const last10 = prices.slice(-10);
  const ma10 = last10.reduce((s, p) => s + p.close, 0) / last10.length;
  const current = prices[prices.length - 1].close;
  const prev10 = prices[prices.length - 11];
  const trend10 = prev10
    ? ((current - prev10.close) / prev10.close * 100).toFixed(1)
    : 'n/a';
  const dailyChanges = prices.slice(-6)
    .map((p, i, a) => i === 0 ? null : ((p.close - a[i-1].close) / a[i-1].close * 100).toFixed(2) + '%')
    .filter(Boolean).join(' → ');
  const trendData = last10.map(p => `${p.date}: ${p.close.toFixed(2)}`).join('\n');
  const isCrypto = ticker.includes('-USD');

  // RSI proxy: count loss days in last 10
  const closes = last10.map(p => p.close);
  let lossDays = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] < closes[i - 1]) lossDays++;
  }
  const rsiLabel = lossDays >= 7 ? 'ÜBERVERKAUFT' : lossDays <= 3 ? 'ÜBERKAUFT' : 'NEUTRAL';

  // 10d high & distance
  const high10d = Math.max(...closes);
  const distFromHigh = ((current - high10d) / high10d * 100).toFixed(1);

  // MA10 distance
  const distFromMA = ((current - ma10) / ma10 * 100).toFixed(1);

  const prompt = `Heute ist der ${prices[prices.length-1].date}. Analysiere ${ticker}${isCrypto ? ' (Kryptowährung)' : ''}.

## Kursverlauf (letzte 10 Tage)
${trendData}

## Tägliche Veränderungen (letzte 5 Tage): ${dailyChanges}
## 10-Tage-MA: ${ma10.toFixed(2)} (Abstand: ${distFromMA}%) | 10d-Hoch: ${high10d.toFixed(2)} (Abstand: ${distFromHigh}%) | Aktuell: ${current.toFixed(2)}
## RSI-Proxy: ${lossDays}/9 Verlusttage → ${rsiLabel} | 10d-Trend: ${trend10}%

Gib dein Signal als JSON (kein Markdown).`;

  const resp = await client.chat.completions.create({
    model: MODEL, max_tokens: 300, temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]
  });
  const raw = resp.choices[0].message.content.trim()
    .replace(/```json\s?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

async function getPriceOn(ticker, targetDate) {
  const end = new Date(targetDate);
  end.setDate(end.getDate() + 2);
  const start = new Date(targetDate);
  start.setDate(start.getDate() - 3);
  const r = await yf.chart(ticker, { period1: start, period2: end, interval: '1d' });
  const quotes = r.quotes.filter(q => q.close != null && q.date.toISOString().split('T')[0] <= targetDate);
  const last = quotes[quotes.length - 1];
  return { date: last.date.toISOString().split('T')[0], close: last.close };
}

// ── Main ──────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║      💶 PORTFOLIO-SIMULATION — 100€ für 1 Woche        ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`\n  Signal-Datum:  ${DECISION_DATE}  |  Modell: ${MODEL}`);
console.log(`  Auswertung:    ${END_DATE_STOCKS} (Aktien/ETFs) | ${END_DATE_CRYPTO} (Krypto)`);
console.log(`  Strategie:     Top ${MAX_POSITIONS} BUY-Signale, konzentriert\n`);
console.log('  Hole Signale...\n');

const signals = [];
for (const asset of ASSETS) {
  try {
    const prices = await getPricesUpTo(asset.ticker, DECISION_DATE);
    if (prices.length < 10) { console.log(`  ⚠ ${asset.ticker}: zu wenig Daten`); continue; }
    const signal = await getSignal(asset.ticker, prices);
    const entryPrice = prices[prices.length - 1].close;
    signals.push({ ...asset, signal, entryPrice });
    const icon = signal.action === 'buy' ? '🟢' : signal.action === 'sell' ? '🔴' : '🟡';
    const label = `${asset.name} (${asset.ticker})`.padEnd(22);
    console.log(`  ${icon} ${label} ${signal.action.toUpperCase().padEnd(5)} ${(signal.confidence*100).toFixed(0)}%  @${entryPrice.toFixed(2)}`);
  } catch(e) {
    console.log(`  ⚠ ${asset.ticker}: ${e.message?.slice(0, 60)}`);
  }
}

// Allocation: Top-N BUY-Signale nach Konfidenz, Rest wird ignoriert
const buys = signals
  .filter(s => s.signal.action === 'buy')
  .sort((a, b) => b.signal.confidence - a.signal.confidence)
  .slice(0, MAX_POSITIONS);
const holds = signals.filter(s => s.signal.action === 'hold');
const sells = signals.filter(s => s.signal.action === 'sell');

console.log(`\n  Signale: ${buys.length}x BUY  |  ${holds.length}x HOLD  |  ${sells.length}x SELL`);

if (buys.length === 0) {
  console.log('\n  ⚠ Keine BUY-Signale — 100€ bleibt als Cash (0% Rendite).\n');
  process.exit(0);
}

const totalConf = buys.reduce((s, b) => s + b.signal.confidence, 0);
const allocations = buys.map(b => ({
  ...b,
  allocation: Math.round((b.signal.confidence / totalConf) * BUDGET * 100) / 100,
  shares: 0
})).map(a => ({ ...a, shares: a.allocation / a.entryPrice }));

// Round so total = exactly 100
const diff = BUDGET - allocations.reduce((s, a) => s + a.allocation, 0);
allocations[0].allocation = Math.round((allocations[0].allocation + diff) * 100) / 100;

console.log('\n════════════════════════════════════════════════════════════');
console.log('  INVESTITIONSPLAN — 100€ nach Konfidenz gewichtet');
console.log('════════════════════════════════════════════════════════════\n');

for (const a of allocations) {
  const typeIcon = a.type === 'Krypto' ? '🔶' : a.type === 'Rohstoff' ? '⛏️ ' : '📈';
  console.log(`  ${typeIcon} ${a.name.padEnd(12)} ${String(a.allocation.toFixed(2)+'€').padEnd(8)} → ${a.shares.toFixed(4)} Anteile @${a.entryPrice.toFixed(2)}  (${(a.signal.confidence*100).toFixed(0)}% Konfidenz)`);
  console.log(`     "${a.signal.reasoning?.slice(0, 85)}"`);
}

// ── Ergebnisse ────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════════════');
console.log('  ERGEBNIS NACH 1 WOCHE');
console.log('════════════════════════════════════════════════════════════\n');

let totalEnd = 0;
const results = [];
for (const a of allocations) {
  const endDate = a.type === 'Krypto' ? END_DATE_CRYPTO : END_DATE_STOCKS;
  const endData = await getPriceOn(a.ticker, endDate);
  const endValue = a.shares * endData.close;
  const pnl = endValue - a.allocation;
  const pnlPct = (pnl / a.allocation * 100).toFixed(2);
  totalEnd += endValue;
  results.push({ ...a, endPrice: endData.close, endDate: endData.date, endValue, pnl, pnlPct });
}

// Sort by P&L descending
for (const r of results.sort((a, b) => b.pnl - a.pnl)) {
  const icon = r.pnl >= 0 ? '✅' : '❌';
  const pnlStr = (r.pnl >= 0 ? '+' : '') + r.pnl.toFixed(2) + '€';
  const pctStr = (r.pnl >= 0 ? '+' : '') + r.pnlPct + '%';
  console.log(
    `  ${icon} ${r.name.padEnd(12)} ${r.allocation.toFixed(2)}€ → ${r.endValue.toFixed(2)}€  ` +
    `(${pnlStr} / ${pctStr})  ` +
    `${r.entryPrice.toFixed(2)} → ${r.endPrice.toFixed(2)}`
  );
}

const totalPnl = totalEnd - BUDGET;
const totalPnlPct = (totalPnl / BUDGET * 100).toFixed(2);
const summaryIcon = totalPnl >= 0 ? '📈' : '📉';

console.log('\n════════════════════════════════════════════════════════════');
console.log(`  ${summaryIcon}  Einsatz: 100.00€  →  Wert: ${totalEnd.toFixed(2)}€`);
console.log(`     Gesamt-P&L: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}€  (${totalPnl >= 0 ? '+' : ''}${totalPnlPct}%)`);
console.log('════════════════════════════════════════════════════════════\n');

// Verpasste Chancen / vermiedene Verluste
const nonBuyResults = signals.filter(s => s.signal.action !== 'buy');
if (nonBuyResults.length > 0) {
  console.log('  Zur Info — nicht investierte Assets (HOLD/SELL):\n');
  for (const s of nonBuyResults) {
    try {
      const endDate = s.ticker.includes('-USD') ? END_DATE_CRYPTO : END_DATE_STOCKS;
      const endData = await getPriceOn(s.ticker, endDate);
      const weekChg = ((endData.close - s.entryPrice) / s.entryPrice * 100).toFixed(2);
      const icon = parseFloat(weekChg) >= 0 ? '↑' : '↓';
      const verdict = s.signal.action === 'sell'
        ? (parseFloat(weekChg) < 0 ? '✅ richtig' : '❌ falsch')
        : (Math.abs(parseFloat(weekChg)) < 2 ? '✅ richtig' : parseFloat(weekChg) > 2 ? '❌ verpasst' : '⚠ knapp');
      console.log(`  ${verdict}  ${s.name.padEnd(12)} ${s.signal.action.toUpperCase().padEnd(5)}  ${s.entryPrice.toFixed(2)} → ${endData.close.toFixed(2)}  (${parseFloat(weekChg)>=0?'+':''}${weekChg}%) ${icon}`);
    } catch(e) { /* skip */ }
  }
  console.log();
}
