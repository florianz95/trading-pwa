#!/usr/bin/env node

/**
 * Backtesting & Prompt-Refiner
 * ============================
 * Testet den System-Prompt aus openrouter.ts gegen historische Daten
 * und schreibt Verbesserungen direkt zurück.
 *
 * Verwendung:
 *   npm run backtest                  # Defaults: stocks + crypto Mix
 *   npm run backtest -- --stocks      # Nur Aktien
 *   npm run backtest -- --crypto      # Nur Krypto
 *   npm run backtest -- AAPL BTC-USD  # Eigene Ticker
 *   npm run backtest -- --days 60     # Längerer Zeitraum
 *   npm run backtest -- --eval 5      # Evaluierungsfenster
 *   npm run backtest -- --no-apply    # Prompt NICHT auto-updaten
 */

import 'dotenv/config';
import OpenAI from 'openai';
import YahooFinance from 'yahoo-finance2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENROUTER_TS = path.resolve(__dirname, '../src/lib/openrouter.ts');

const yahooFinance = new YahooFinance();

// ─── Default Asset-Sets ──────────────────────────────────────────────

const DEFAULT_STOCKS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'JPM'];
const DEFAULT_CRYPTO = ['BTC-USD', 'ETH-USD', 'SOL-USD'];

// ─── Argument Parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);
let LOOKBACK_DAYS = 45;
let EVAL_DAYS = 5;
let AUTO_APPLY = true;
const tickers = [];
let mode = 'all'; // 'all' | 'stocks' | 'crypto'

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--days' && args[i + 1])       { LOOKBACK_DAYS = parseInt(args[++i]); }
  else if (args[i] === '--eval' && args[i + 1])  { EVAL_DAYS = parseInt(args[++i]); }
  else if (args[i] === '--stocks')                { mode = 'stocks'; }
  else if (args[i] === '--crypto')                { mode = 'crypto'; }
  else if (args[i] === '--no-apply')              { AUTO_APPLY = false; }
  else if (!args[i].startsWith('--'))             { tickers.push(args[i].toUpperCase()); }
}

if (tickers.length === 0) {
  if (mode === 'stocks')      tickers.push(...DEFAULT_STOCKS);
  else if (mode === 'crypto') tickers.push(...DEFAULT_CRYPTO);
  else                        tickers.push(...DEFAULT_STOCKS, ...DEFAULT_CRYPTO);
}

// ─── Read SYSTEM_PROMPT from openrouter.ts ───────────────────────────

function readSystemPrompt() {
  const src = fs.readFileSync(OPENROUTER_TS, 'utf8');
  const match = src.match(/const SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`;/);
  if (!match) throw new Error('SYSTEM_PROMPT nicht in openrouter.ts gefunden');
  return match[1];
}

function writeSystemPrompt(newPrompt) {
  const src = fs.readFileSync(OPENROUTER_TS, 'utf8');
  const updated = src.replace(
    /const SYSTEM_PROMPT\s*=\s*`[\s\S]*?`;/,
    `const SYSTEM_PROMPT = \`${newPrompt.replace(/`/g, '\\`')}\`;`
  );
  fs.writeFileSync(OPENROUTER_TS, updated, 'utf8');
}

// ─── OpenAI Client ───────────────────────────────────────────────────

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://trading-advisor.vercel.app',
    'X-Title': 'Trading Advisor Backtest',
  },
});

const MODEL = process.env.LLM_MODEL ?? 'anthropic/claude-haiku-4.5';

// ─── Data Fetching ───────────────────────────────────────────────────

async function getHistoricalPrices(ticker, days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  const result = await yahooFinance.chart(ticker, {
    period1: start,
    period2: end,
    interval: '1d',
  });

  return result.quotes
    .filter((q) => q.close != null)
    .map((q) => ({
      date: q.date.toISOString().split('T')[0],
      open: q.open,
      close: q.close,
      high: q.high,
      low: q.low,
      volume: q.volume,
    }));
}

async function getRecentNews(ticker) {
  try {
    const result = await yahooFinance.search(ticker, { newsCount: 5 });
    return (result.news ?? []).map((n) => ({
      title: n.title,
      source: n.publisher ?? 'Yahoo',
    }));
  } catch {
    return [];
  }
}

// ─── Asset Type Detection ────────────────────────────────────────────

function isCrypto(ticker) {
  return ticker.endsWith('-USD') || ticker.endsWith('-EUR') ||
    ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE'].includes(ticker);
}

function assetLabel(ticker) {
  return isCrypto(ticker) ? '🔶 Krypto' : '📈 Aktie';
}

// ─── Backtest Logic ──────────────────────────────────────────────────

async function backtestTicker(ticker, systemPrompt) {
  const label = assetLabel(ticker);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  BACKTEST: ${ticker}  ${label}`);
  console.log(`  Zeitraum: ${LOOKBACK_DAYS} Tage zurück, ${EVAL_DAYS} Tage Evaluierung`);
  console.log(`${'═'.repeat(60)}\n`);

  let allPrices;
  try {
    allPrices = await getHistoricalPrices(ticker, LOOKBACK_DAYS + EVAL_DAYS + 30);
  } catch (err) {
    console.log(`  ⚠ Datenfehler für ${ticker}: ${err.message?.slice(0, 80)}\n`);
    return null;
  }

  if (allPrices.length < LOOKBACK_DAYS + EVAL_DAYS) {
    console.log(`  ⚠ Nicht genug Daten für ${ticker} (nur ${allPrices.length} Tage)\n`);
    return null;
  }

  // Test points: every 5 days, max 5 points
  const testPoints = [];
  for (let i = 25; i < allPrices.length - EVAL_DAYS; i += 5) {
    testPoints.push(i);
  }
  const selectedPoints = testPoints.slice(-5);

  const news = await getRecentNews(ticker);
  const results = [];

  for (const idx of selectedPoints) {
    const testDate = allPrices[idx].date;
    const priceAtTest = allPrices[idx].close;
    const pricesBefore = allPrices.slice(Math.max(0, idx - 20), idx + 1);
    const pricesAfter = allPrices.slice(idx + 1, idx + 1 + EVAL_DAYS);

    if (pricesAfter.length === 0) continue;

    const futurePrice = pricesAfter[pricesAfter.length - 1].close;
    const actualChange = ((futurePrice - priceAtTest) / priceAtTest) * 100;

    // 10-Tage-MA berechnen und mitgeben
    const last10 = pricesBefore.slice(-10).map((p) => p.close);
    const ma10 = (last10.reduce((a, b) => a + b, 0) / last10.length).toFixed(2);
    const trendData = pricesBefore
      .slice(-10)
      .map((p) => `${p.date}: ${p.close?.toFixed(2)}`)
      .join('\n');
    const dailyChanges = pricesBefore.slice(-6).map((p, i, arr) => {
      if (i === 0) return null;
      return ((p.close - arr[i - 1].close) / arr[i - 1].close * 100).toFixed(2) + '%';
    }).filter(Boolean).join(' → ');

    const newsStr = news.length > 0
      ? news.map((n) => `[${n.source}] ${n.title}`).join('\n')
      : '[Keine aktuellen News verfügbar — Analyse auf Kursdaten basieren]';

    const assetContext = isCrypto(ticker)
      ? `Asset-Typ: Kryptowährung (höhere Volatilität, 24/7 Handel, Nasdaq-Korrelation beachten)`
      : `Asset-Typ: Aktie`;

    const userPrompt = `Heute ist der ${testDate}. Analysiere ${ticker}.

${assetContext}

## Kursverlauf (letzte 10 Tage)
${trendData}

## Tägliche Veränderungen (letzte 5 Tage)
${dailyChanges}

## 10-Tage-Durchschnitt: ${ma10} USD
## Aktueller Kurs: ${priceAtTest?.toFixed(2)} USD

## Aktuelle News
${newsStr}

Gib dein Signal als JSON (kein Markdown).`;

    let prediction;
    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 500,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const text = response.choices[0]?.message?.content?.trim() ?? '';
      const clean = text.replace(/```json\s?/g, '').replace(/```/g, '').trim();
      // Handle both array and object responses
      const parsed = JSON.parse(clean);
      prediction = Array.isArray(parsed) ? parsed[0] : parsed;
    } catch (err) {
      console.log(`  ⚠ Parse-Fehler am ${testDate}: ${err.message?.slice(0, 60)}`);
      continue;
    }

    const wasCorrect = evaluatePrediction(prediction.action, actualChange, isCrypto(ticker));

    results.push({
      date: testDate,
      ticker,
      priceAtTest,
      futurePrice,
      actualChangePct: Math.round(actualChange * 100) / 100,
      predicted: prediction.action,
      confidence: prediction.confidence,
      reasoning: prediction.reasoning,
      correct: wasCorrect,
    });

    const icon = wasCorrect ? '✅' : '❌';
    const arrow = actualChange >= 0 ? '↑' : '↓';
    console.log(
      `  ${icon} ${testDate} | KI: ${prediction.action.toUpperCase().padEnd(4)} (${(prediction.confidence * 100).toFixed(0)}%) | ` +
      `Kurs: ${priceAtTest?.toFixed(2)} → ${futurePrice?.toFixed(2)} (${arrow}${Math.abs(actualChange).toFixed(2)}%)`
    );
    console.log(`     ${prediction.reasoning?.slice(0, 110)}`);
  }

  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : '0';

  console.log(`\n  ── Ergebnis ${ticker} ──`);
  console.log(`  Trefferquote: ${correct}/${total} (${accuracy}%)\n`);

  return { ticker, results, accuracy: parseFloat(accuracy) };
}

function evaluatePrediction(action, actualChangePct, crypto = false) {
  // Krypto hat höhere Volatilität → großzügigere Schwellen
  const threshold = crypto ? 2 : 1;
  const sideways = crypto ? 5 : 3;
  if (action === 'buy'  && actualChangePct > -threshold)  return true;
  if (action === 'sell' && actualChangePct < threshold)   return true;
  if (action === 'hold' && Math.abs(actualChangePct) < sideways) return true;
  return false;
}

// ─── Reflection & Auto-Apply ─────────────────────────────────────────

async function reflectAndApply(allResults, systemPrompt) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  REFLEXION & PROMPT-VERBESSERUNG');
  console.log(`${'═'.repeat(60)}\n`);

  const failures = allResults
    .flatMap((r) => r.results.filter((x) => !x.correct))
    .slice(0, 8);

  if (failures.length === 0) {
    console.log('  🎉 Keine Fehlschläge — Prompt funktioniert gut auf diesem Datensatz.\n');
    return;
  }

  // Zeige Fehler-Übersicht nach Asset-Typ
  const failByType = { stocks: [], crypto: [] };
  for (const f of failures) {
    (isCrypto(f.ticker) ? failByType.crypto : failByType.stocks).push(f);
  }
  if (failByType.stocks.length)  console.log(`  Aktien-Fehler: ${failByType.stocks.length}`);
  if (failByType.crypto.length)  console.log(`  Krypto-Fehler: ${failByType.crypto.length}`);
  console.log();

  const failureSummary = failures.map((f) => {
    const type = isCrypto(f.ticker) ? 'Krypto' : 'Aktie';
    const dir = f.actualChangePct >= 0 ? `gestiegen (+${f.actualChangePct}%)` : `gefallen (${f.actualChangePct}%)`;
    return `- [${type}] ${f.ticker} am ${f.date}: KI sagte "${f.predicted}" (${(f.confidence*100).toFixed(0)}%), Kurs ist ${dir}. Begründung: "${f.reasoning}"`;
  }).join('\n');

  const reflectionPrompt = `Du bist ein Experte für Prompt-Engineering und quantitative Finanzanalyse.

Ein Trading-KI-Bot hat folgende Fehler gemacht (Backtestdaten):

${failureSummary}

Der aktuelle System-Prompt des Bots:
"""
${systemPrompt}
"""

Analysiere systematisch:
1. Welche Muster erkennst du bei den Fehlern? (z.B. zu aggressiv bei Krypto-Volatilität, HOLD zu oft bei Aufwärtstrend, etc.)
2. Welche konkreten Regeln müssen HINZUGEFÜGT oder GEÄNDERT werden?
3. Gibt es Regeln, die ENTFERNT werden sollten, weil sie zu Fehlern führen?

Gib dann den VOLLSTÄNDIG VERBESSERTEN System-Prompt aus.
WICHTIG: Nur den Prompt-Text zwischen den Markierungen — kein anderer Text davor/danach.

--- START PROMPT ---
[verbesserter Prompt hier]
--- END PROMPT ---`;

  console.log('  Analysiere Fehler mit KI...\n');

  let reflection;
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 3000,
      temperature: 0.4,
      messages: [
        { role: 'system', content: 'Du bist ein Experte für Prompt-Engineering und Finanzanalyse. Antworte präzise und strukturiert.' },
        { role: 'user', content: reflectionPrompt },
      ],
    });
    reflection = response.choices[0]?.message?.content ?? '';
  } catch (err) {
    console.error('  Reflexion fehlgeschlagen:', err.message);
    return;
  }

  // Analyse ausgeben (ohne den Prompt selbst)
  const beforePrompt = reflection.split('--- START PROMPT ---')[0].trim();
  if (beforePrompt) {
    console.log(beforePrompt);
    console.log();
  }

  // Verbesserten Prompt extrahieren und anwenden
  const promptMatch = reflection.match(/--- START PROMPT ---\s*([\s\S]*?)\s*--- END PROMPT ---/);
  if (!promptMatch) {
    console.log('  ⚠ Kein verbesserter Prompt gefunden in der Antwort.\n');
    return;
  }

  const improvedPrompt = promptMatch[1].trim();

  if (AUTO_APPLY) {
    try {
      writeSystemPrompt(improvedPrompt);
      console.log(`${'─'.repeat(60)}`);
      console.log('  ✅ Verbesserter Prompt wurde in openrouter.ts geschrieben!');
      console.log(`${'─'.repeat(60)}\n`);
    } catch (err) {
      console.error('  ❌ Fehler beim Schreiben:', err.message);
      console.log('\n  Prompt (manuell einfügen in openrouter.ts → SYSTEM_PROMPT):\n');
      console.log(improvedPrompt);
    }
  } else {
    console.log(`${'─'.repeat(60)}`);
    console.log('  💡 Verbesserter Prompt (--no-apply war gesetzt, nicht auto-angewendet):');
    console.log(`${'─'.repeat(60)}\n`);
    console.log(improvedPrompt);
  }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Trading Advisor — Backtest & Prompt Refiner        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nModell: ${MODEL}`);
  console.log(`Ticker: ${tickers.join(', ')}`);
  console.log(`Lookback: ${LOOKBACK_DAYS} Tage | Evaluierung: ${EVAL_DAYS} Tage`);
  console.log(`Auto-Apply: ${AUTO_APPLY ? 'JA (--no-apply zum Deaktivieren)' : 'NEIN'}`);

  let systemPrompt;
  try {
    systemPrompt = readSystemPrompt();
    console.log(`System-Prompt: aus openrouter.ts geladen (${systemPrompt.length} Zeichen)`);
  } catch (err) {
    console.error(`\n⚠ Konnte SYSTEM_PROMPT nicht laden: ${err.message}`);
    process.exit(1);
  }

  const allResults = [];

  for (const ticker of tickers) {
    const result = await backtestTicker(ticker, systemPrompt);
    if (result) allResults.push(result);
  }

  if (allResults.length === 0) {
    console.log('\n  ⚠ Keine Ergebnisse — alle Ticker fehlgeschlagen.\n');
    return;
  }

  // Gesamtstatistik
  const allItems = allResults.flatMap((r) => r.results);
  const allCorrect = allItems.filter((x) => x.correct).length;
  const stockItems = allItems.filter((x) => !isCrypto(x.ticker));
  const cryptoItems = allItems.filter((x) => isCrypto(x.ticker));

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  GESAMT-TREFFERQUOTE: ${allCorrect}/${allItems.length} (${allItems.length > 0 ? ((allCorrect/allItems.length)*100).toFixed(1) : 0}%)`);
  if (stockItems.length > 0) {
    const sc = stockItems.filter((x) => x.correct).length;
    console.log(`  Aktien:  ${sc}/${stockItems.length} (${((sc/stockItems.length)*100).toFixed(1)}%)`);
  }
  if (cryptoItems.length > 0) {
    const cc = cryptoItems.filter((x) => x.correct).length;
    console.log(`  Krypto:  ${cc}/${cryptoItems.length} (${((cc/cryptoItems.length)*100).toFixed(1)}%)`);
  }
  console.log(`${'═'.repeat(60)}`);

  await reflectAndApply(allResults, systemPrompt);
}

main().catch(console.error);
