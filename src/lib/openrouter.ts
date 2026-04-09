import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://trading-advisor.vercel.app',
    'X-Title': 'Trading Advisor PWA',
  },
});

const MODEL = process.env.LLM_MODEL ?? 'anthropic/claude-haiku-4.5';

interface AnalysisInput {
  portfolio: { ticker: string; buyPrice: number; quantity: number; currentPrice: number }[];
  news: { title: string; source: string; snippet?: string }[];
  marketData: { ticker: string; prices: number[]; changePct: number }[];
  regime?: 'RISK_OFF' | 'NORMAL' | 'RISK_ON';
  spyTrend?: number;
  vix?: number;
}

interface Signal {
  ticker: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  reasoning: string;
  targetPrice?: number;
}

const SYSTEM_PROMPT = `Du bist ein disziplinierter Finanzanalyst. Kapitalschutz hat absolute Priorität. Antworte NUR als JSON-Array.

## ANALYSE-SCHRITTE

### 1. MARKTREGIME (wird im Prompt vorgegeben)
- RISK_OFF: Kein Mean-Reversion-Kauf. Nur Defensive oder HOLD.
- NORMAL: Selektive Käufe nur mit starker Bestätigung.
- RISK_ON: Käufe möglich, aber diszipliniert.

### 2. KURS-ANALYSE
Berechne:
- RSI-Proxy: Verlusttage der letzten 10 Tage
  * 7+ Verlusttage = ÜBERVERKAUFT
  * 7+ Gewinntage = ÜBERKAUFT
- Abstand vom 10d-Hoch und 10d-MA
- Trendrichtung der letzten 5 Tage

### 3. KAUFENTSCHEIDUNG (alle 3 Bedingungen nötig)
BUY nur wenn:
1. TECHNISCH stark: 7+ Verlusttage UND -10%+ unter 10d-Hoch
2. GRÜNER TAG bestätigt: Letzter Schlusskurs ÜBER Vortag (Rebound begonnen)
3. KEIN Systemrisiko: Marktregime ist NORMAL oder RISK_ON

Bei RISK_OFF: KEIN BUY, egal wie überverkauft.
"Überverkauft" allein ist KEIN Kaufsignal in Trending-Märkten.

### 4. VERKAUFSENTSCHEIDUNG
SELL NUR bei:
- Stop-Loss: -8% unter Einstiegspreis (quantity > 0)
- Take-Profit: +15% über Einstiegspreis (quantity > 0)
- Fundamentales Ereignis: Gewinnwarnung, Skandal, Insolvenz in News

NIEMALS verkaufen weil:
- "Momentum beschleunigt negativ" (war auch Kaufbegründung)
- "Überverkauft wiederholt sich" (bestätigt die Mean-Reversion-These)
- Preis fällt kurz nach Kauf (Halteperiode: min 3 Tage)

### 5. POSITIONSGRÖSSE
- Kaufkandidaten (quantity=0): BUY nur wenn Überzeugung ≥ 65%
- Offene Positionen (quantity>0): SELL nur bei Stop/Take-Profit oder Fundamental-Schock

## FORMAT
JSON-Array ohne Markdown. Begründung: 1 präziser Satz mit Zahlen.
[{"ticker":"AAPL","action":"buy","confidence":0.72,"reasoning":"Grüner Tag nach 8/10 Verlusttagen, -12% unter 10d-Hoch, Regime NORMAL."}]`;

export async function analyzeMarket(input: AnalysisInput): Promise<Signal[]> {
  const prompt = buildPrompt(input);

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 2048,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim() ?? '';
  const clean = text.replace(/```json\s?/g, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(clean) as Signal[];
  } catch {
    const lastBrace = clean.lastIndexOf('}');
    if (lastBrace > 0) {
      try { return JSON.parse(clean.slice(0, lastBrace + 1) + ']') as Signal[]; } catch {}
    }
    return [];
  }
}

export async function chatCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1500,
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  return response.choices[0]?.message?.content?.trim() ?? '';
}

function buildPrompt(input: AnalysisInput): string {
  const { regime = 'NORMAL', spyTrend = 0, vix = 20 } = input;

  const regimeBlock = `## MARKTREGIME: ${regime}
SPY 10d-Trend: ${spyTrend >= 0 ? '+' : ''}${Number(spyTrend).toFixed(1)}% | VIX: ${vix.toFixed(0)}
${regime === 'RISK_OFF' ? '⚠️  RISK_OFF aktiv → KEIN Mean-Reversion-Kauf erlaubt. Nur HOLD oder SELL.' : ''}
${regime === 'RISK_ON' ? '✅ RISK_ON aktiv → Selektive Käufe möglich.' : ''}`;

  const portfolioStr = input.portfolio
    .map((p) => {
      const pnl = p.buyPrice > 0 ? ((p.currentPrice - p.buyPrice) / p.buyPrice * 100).toFixed(1) : '0.0';
      const tag = p.quantity > 0 ? `(Portfolio, ${Number(pnl) >= 0 ? '+' : ''}${pnl}% seit Kauf)` : '(Kaufkandidat)';
      const stopLevel = p.quantity > 0 ? ` | Stop: ${(p.buyPrice * 0.92).toFixed(2)}€ | TP: ${(p.buyPrice * 1.15).toFixed(2)}€` : '';
      return `${p.ticker} ${tag}: Kurs ${p.currentPrice.toFixed(2)}€${stopLevel}`;
    })
    .join('\n');

  const newsStr = input.news
    .slice(0, 15)
    .map((n) => `[${n.source}] ${n.title}`)
    .join('\n');

  const marketStr = input.marketData
    .map((m) => {
      const prices = m.prices;
      const len = prices.length;
      if (len < 2) return `${m.ticker}: ${m.changePct.toFixed(2)}% (zu wenig Daten)`;

      let lossDays = 0;
      for (let i = Math.max(0, len - 10); i < len; i++) {
        if (i > 0 && prices[i] < prices[i - 1]) lossDays++;
      }
      const last10 = Math.min(10, len - 1);
      const rsiLabel = lossDays >= 7 ? 'ÜBERVERKAUFT' : lossDays <= 3 ? 'ÜBERKAUFT' : 'NEUTRAL';

      const recent10 = prices.slice(-10);
      const high10d = Math.max(...recent10);
      const distFromHigh = ((prices[len - 1] - high10d) / high10d * 100).toFixed(1);

      const ma10 = recent10.reduce((a, b) => a + b, 0) / recent10.length;
      const distFromMA = ((prices[len - 1] - ma10) / ma10 * 100).toFixed(1);

      const greenDay = prices[len - 1] > prices[len - 2] ? '🟢' : '🔴';
      const trend = prices[len - 1] > prices[0] ? '↑' : '↓';

      return `${m.ticker}: ${m.changePct.toFixed(2)}% ${trend} ${greenDay} | ${lossDays}/${last10} Verlusttage (${rsiLabel}) | ${distFromHigh}% unter 10d-Hoch | MA10: ${distFromMA}%`;
    })
    .join('\n');

  return `${regimeBlock}

## Portfolio & Kaufkandidaten
${portfolioStr}

## News
${newsStr || 'Keine relevanten News.'}

## Marktdaten (🟢=grüner Tag, 🔴=roter Tag)
${marketStr}

Analysiere jeden Eintrag. Kaufkandidaten nur bei GRÜNEM Tag (🟢) kaufen. Portfolio-Positionen nur bei Stop-Loss (-8%) oder Take-Profit (+15%) verkaufen.`;
}
