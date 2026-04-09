#!/usr/bin/env node

/**
 * Backtesting & Prompt-Refining Script
 * =====================================
 * Testet den KI-Analyse-Prompt gegen historische Daten und
 * generiert Verbesserungsvorschläge für den System-Prompt.
 *
 * Verwendung:
 *   node scripts/backtest.js AAPL          # Einzelner Ticker
 *   node scripts/backtest.js AAPL MSFT     # Mehrere Ticker
 *   node scripts/backtest.js --days 60     # Testperiode ändern (default: 30)
 *   node scripts/backtest.js --eval 5      # Evaluierungsfenster ändern (default: 5 Tage)
 *
 * Voraussetzung: .env.local muss OPENROUTER_API_KEY enthalten
 */

import 'dotenv/config';
import OpenAI from 'openai';
import yahooFinance from 'yahoo-finance2';

// ─── Config ──────────────────────────────────────────────────────────

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://trading-advisor.vercel.app',
    'X-Title': 'Trading Advisor Backtest',
  },
});

const MODEL = process.env.LLM_MODEL ?? 'google/gemini-2.5-flash';

const SYSTEM_PROMPT = `Du bist ein erfahrener Finanzanalyst und Trading-Berater. Deine Aufgabe:

1. Analysiere die Kursdaten und News-Schlagzeilen für das gegebene Asset.
2. Kombiniere quantitative Daten (Kurstrends) mit qualitativen Daten (News-Sentiment).
3. Gib ein klares Signal: buy, sell oder hold.
4. Bewerte deine Konfidenz ehrlich (0.0 bis 1.0).

WICHTIG:
- Sei konservativ. Im Zweifel: hold.
- Berücksichtige Risiken und Gegenargumente.
- Antworte AUSSCHLIESSLICH als JSON. Kein Markdown.

Format: {"action":"buy|sell|hold","confidence":0.7,"reasoning":"...","targetPrice":180}`;

// ─── Argument Parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);
let LOOKBACK_DAYS = 30;
let EVAL_DAYS = 5;
const tickers = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--days' && args[i + 1]) { LOOKBACK_DAYS = parseInt(args[++i]); }
  else if (args[i] === '--eval' && args[i + 1]) { EVAL_DAYS = parseInt(args[++i]); }
  else { tickers.push(args[i].toUpperCase()); }
}

if (tickers.length === 0) {
  tickers.push('AAPL', 'MSFT', 'GOOGL');
  console.log('Keine Ticker angegeben, verwende Defaults: AAPL, MSFT, GOOGL\n');
}

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

  return result.quotes.map((q) => ({
    date: q.date.toISOString().split('T')[0],
    open: q.open,
    close: q.close,
    high: q.high,
    low: q.low,
    volume: q.volume,
  }));
}

/**
 * Historische News: Wir nutzen drei Quellen:
 * 1. Supabase news_archive (wenn verfügbar, aus eigenen Cron-Runs)
 * 2. Yahoo Finance search (liefert auch ältere Headlines)
 * 3. Fallback: synthetische Zusammenfassung aus Kursbewegungen
 */
async function getHistoricalNews(ticker, date) {
  const news = [];

  // Yahoo Finance search — often returns older headlines
  try {
    const result = await yahooFinance.search(ticker, { newsCount: 10 });
    if (result.news) {
      for (const item of result.news) {
        const pubDate = item.providerPublishTime
          ? new Date(item.providerPublishTime * 1000).toISOString().split('T')[0]
          : null;

        // Filter to ±3 days around target date
        if (pubDate) {
          const diff = Math.abs(
            (new Date(pubDate).getTime() - new Date(date).getTime()) / 86400000
          );
          if (diff <= 3) {
            news.push({
              title: item.title,
              source: item.publisher ?? 'Yahoo',
              date: pubDate,
            });
          }
        }
      }
    }
  } catch {
    // Yahoo search may fail for some tickers
  }

  // If no real news found, generate context from price action
  if (news.length === 0) {
    news.push({
      title: `[Keine archivierten News für ${ticker} am ${date} verfügbar - Analyse basiert auf Kursdaten]`,
      source: 'System',
      date,
    });
  }

  return news;
}

// ─── Backtest Logic ──────────────────────────────────────────────────

async function backtestTicker(ticker) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  BACKTEST: ${ticker}`);
  console.log(`  Zeitraum: ${LOOKBACK_DAYS} Tage zurück, ${EVAL_DAYS} Tage Evaluierung`);
  console.log(`${'═'.repeat(60)}\n`);

  // Get full price history
  const allPrices = await getHistoricalPrices(ticker, LOOKBACK_DAYS + EVAL_DAYS + 30);

  if (allPrices.length < LOOKBACK_DAYS + EVAL_DAYS) {
    console.log(`  ⚠ Nicht genug Daten für ${ticker} (nur ${allPrices.length} Tage)\n`);
    return null;
  }

  // Pick test points: every 5 days within the lookback window
  const results = [];
  const testPoints = [];

  for (let i = 30; i < allPrices.length - EVAL_DAYS; i += 5) {
    testPoints.push(i);
  }

  // Limit to 5 test points to save API calls
  const selectedPoints = testPoints.slice(-5);

  for (const idx of selectedPoints) {
    const testDate = allPrices[idx].date;
    const priceAtTest = allPrices[idx].close;

    // Prices BEFORE the test date (what the AI sees)
    const pricesBefore = allPrices.slice(Math.max(0, idx - 20), idx + 1);

    // Prices AFTER the test date (the truth)
    const pricesAfter = allPrices.slice(idx + 1, idx + 1 + EVAL_DAYS);

    if (pricesAfter.length === 0) continue;

    const futurePrice = pricesAfter[pricesAfter.length - 1].close;
    const actualChange = ((futurePrice - priceAtTest) / priceAtTest) * 100;

    // Get historical news for that date
    const news = await getHistoricalNews(ticker, testDate);

    // Build prompt (the AI doesn't know the future)
    const trendData = pricesBefore
      .slice(-10)
      .map((p) => `${p.date}: ${p.close?.toFixed(2)}`)
      .join('\n');

    const newsStr = news.map((n) => `[${n.source}] ${n.title}`).join('\n');

    const userPrompt = `Heute ist der ${testDate}. Analysiere ${ticker}:

## Kursverlauf (letzte 10 Tage)
${trendData}

## Aktueller Kurs: ${priceAtTest?.toFixed(2)} USD

## News-Schlagzeilen
${newsStr || 'Keine News verfügbar'}

Gib dein Signal als JSON.`;

    // Ask the AI
    let prediction;
    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 500,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });

      const text = response.choices[0]?.message?.content?.trim() ?? '';
      const clean = text.replace(/```json\s?/g, '').replace(/```/g, '').trim();
      prediction = JSON.parse(clean);
    } catch (err) {
      console.log(`  ⚠ Parse-Fehler am ${testDate}, überspringe...`);
      continue;
    }

    // Evaluate
    const wasCorrect = evaluatePrediction(prediction.action, actualChange);

    const result = {
      date: testDate,
      priceAtTest,
      futurePrice,
      actualChangePct: Math.round(actualChange * 100) / 100,
      predicted: prediction.action,
      confidence: prediction.confidence,
      reasoning: prediction.reasoning,
      correct: wasCorrect,
    };

    results.push(result);

    // Print result
    const icon = wasCorrect ? '✅' : '❌';
    const arrow = actualChange >= 0 ? '↑' : '↓';
    console.log(
      `  ${icon} ${testDate} | KI: ${prediction.action.toUpperCase().padEnd(4)} (${(prediction.confidence * 100).toFixed(0)}%) | ` +
      `Kurs: ${priceAtTest?.toFixed(2)} → ${futurePrice?.toFixed(2)} (${arrow}${Math.abs(actualChange).toFixed(2)}%)`
    );
    console.log(`     Begründung: ${prediction.reasoning?.slice(0, 100)}`);
  }

  // Summary
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : '0';

  console.log(`\n  ── Ergebnis ${ticker} ──`);
  console.log(`  Trefferquote: ${correct}/${total} (${accuracy}%)\n`);

  return { ticker, results, accuracy: parseFloat(accuracy) };
}

function evaluatePrediction(action, actualChangePct) {
  const threshold = 1; // 1% Toleranz
  if (action === 'buy' && actualChangePct > -threshold) return true;
  if (action === 'sell' && actualChangePct < threshold) return true;
  if (action === 'hold' && Math.abs(actualChangePct) < 3) return true;
  return false;
}

// ─── Reflection Phase ────────────────────────────────────────────────

async function reflectOnResults(allResults) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  REFLEXION & PROMPT-VERBESSERUNG');
  console.log(`${'═'.repeat(60)}\n`);

  const failures = allResults
    .flatMap((r) => r.results.filter((x) => !x.correct))
    .slice(0, 5); // Max 5 Fehlschläge analysieren

  if (failures.length === 0) {
    console.log('  🎉 Keine Fehlschläge gefunden! Der Prompt funktioniert gut.\n');
    return;
  }

  const failureSummary = failures
    .map(
      (f) =>
        `- ${f.date}: Du sagtest "${f.predicted}" (Konfidenz ${f.confidence}), ` +
        `aber der Kurs ging ${f.actualChangePct >= 0 ? 'hoch' : 'runter'} um ${Math.abs(f.actualChangePct).toFixed(2)}%. ` +
        `Deine Begründung war: "${f.reasoning}"`
    )
    .join('\n');

  const reflectionPrompt = `Du bist ein Meta-Analyst. Hier sind Fälle, in denen ein Trading-KI-Bot falsch lag:

${failureSummary}

Der aktuelle System-Prompt des Bots ist:
"""
${SYSTEM_PROMPT}
"""

Analysiere die Fehler und beantworte:
1. Welche systematischen Fehler erkennst du? (z.B. zu optimistisch, News ignoriert, Trend nicht erkannt)
2. Welche konkreten Sätze/Regeln sollten zum System-Prompt HINZUGEFÜGT werden, um diese Fehler zu vermeiden?
3. Gibt es Regeln im Prompt, die ENTFERNT oder ABGESCHWÄCHT werden sollten?

Gib den VERBESSERTEN System-Prompt komplett aus, markiert mit --- START PROMPT --- und --- END PROMPT ---.`;

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 2000,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: 'Du bist ein Experte für Prompt-Engineering und Finanzanalyse. Analysiere Fehler und verbessere Prompts.',
        },
        { role: 'user', content: reflectionPrompt },
      ],
    });

    const reflection = response.choices[0]?.message?.content ?? '';
    console.log(reflection);

    // Extract improved prompt
    const promptMatch = reflection.match(
      /--- START PROMPT ---\s*([\s\S]*?)\s*--- END PROMPT ---/
    );
    if (promptMatch) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log('  💡 Verbesserter Prompt extrahiert!');
      console.log('  Kopiere ihn in src/lib/openrouter.ts → SYSTEM_PROMPT');
      console.log(`${'─'.repeat(60)}\n`);
    }
  } catch (err) {
    console.error('Reflexion fehlgeschlagen:', err.message);
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

  const allResults = [];

  for (const ticker of tickers) {
    const result = await backtestTicker(ticker);
    if (result) allResults.push(result);
  }

  // Overall accuracy
  const allCorrect = allResults.flatMap((r) => r.results).filter((x) => x.correct).length;
  const allTotal = allResults.flatMap((r) => r.results).length;
  const overallAcc = allTotal > 0 ? ((allCorrect / allTotal) * 100).toFixed(1) : '0';

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  GESAMT-TREFFERQUOTE: ${allCorrect}/${allTotal} (${overallAcc}%)`);
  console.log(`${'═'.repeat(60)}`);

  // Reflection phase — analyze failures and suggest prompt improvements
  if (allResults.length > 0) {
    await reflectOnResults(allResults);
  }
}

main().catch(console.error);
