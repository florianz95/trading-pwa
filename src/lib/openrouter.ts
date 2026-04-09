import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://trading-advisor.vercel.app',
    'X-Title': 'Trading Advisor PWA',
  },
});

const MODEL = process.env.LLM_MODEL ?? 'google/gemini-2.5-flash';

interface AnalysisInput {
  portfolio: { ticker: string; buyPrice: number; quantity: number; currentPrice: number }[];
  news: { title: string; source: string; snippet?: string }[];
  marketData: { ticker: string; prices: number[]; changePct: number }[];
}

interface Signal {
  ticker: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  reasoning: string;
  targetPrice?: number;
}

const SYSTEM_PROMPT = `Du bist ein erfahrener Finanzanalyst und Trading-Berater. Deine Aufgabe:

1. Analysiere das Portfolio, aktuelle Kursdaten und News-Schlagzeilen.
2. Kombiniere quantitative Daten (Kurstrends, Volumen, Veränderungen) mit qualitativen Daten (News-Sentiment, politische Lage, Marktumfeld).
3. Gib für jede Position ein klares Signal: buy, sell oder hold.
4. Bewerte deine Konfidenz ehrlich (0.0 bis 1.0). Bei Unsicherheit → niedrige Konfidenz + hold.
5. Begründe jedes Signal in 1-2 Sätzen.

WICHTIG:
- Dies sind EMPFEHLUNGEN, keine Finanzberatung.
- Sei konservativ. Im Zweifel: hold.
- Berücksichtige auch Risiken und Gegenargumente.
- Antworte AUSSCHLIESSLICH als JSON-Array. Kein Markdown, keine Backticks.

Format: [{"ticker":"AAPL","action":"hold","confidence":0.7,"reasoning":"...","targetPrice":180}]`;

export async function analyzeMarket(input: AnalysisInput): Promise<Signal[]> {
  const prompt = buildPrompt(input);

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.3,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim() ?? '';

  try {
    // Strip potential markdown fences
    const clean = text.replace(/```json\s?/g, '').replace(/```/g, '').trim();
    return JSON.parse(clean) as Signal[];
  } catch {
    console.error('Failed to parse LLM response:', text);
    return [];
  }
}

/**
 * Used by the backtest script for custom prompts
 */
export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
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
  const portfolioStr = input.portfolio
    .map((p) => `${p.ticker}: Kauf ${p.buyPrice}€, Aktuell ${p.currentPrice}€, Menge ${p.quantity}`)
    .join('\n');

  const newsStr = input.news
    .slice(0, 20)
    .map((n) => `[${n.source}] ${n.title}`)
    .join('\n');

  const marketStr = input.marketData
    .map((m) => {
      const trend =
        m.prices.length > 1
          ? m.prices[m.prices.length - 1] > m.prices[0]
            ? '↑'
            : '↓'
          : '-';
      return `${m.ticker}: ${m.changePct.toFixed(2)}% ${trend} (${m.prices.length}d Verlauf)`;
    })
    .join('\n');

  return `Analysiere mein Portfolio und gib Signale:

## Mein Portfolio
${portfolioStr}

## Aktuelle News-Schlagzeilen
${newsStr}

## Marktdaten & Trends
${marketStr}

Gib für jede Position ein Signal (buy/sell/hold) mit Begründung.
Berücksichtige: Langzeittrend, News-Sentiment, Risiko, aktuelle Marktlage.`;
}
