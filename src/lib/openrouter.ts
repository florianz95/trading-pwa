import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://trading-advisor.vercel.app',
    'X-Title': 'Trading Advisor PWA',
  },
});

const MODEL = process.env.LLM_MODEL ?? 'google/gemini-2.0-flash-exp:free';

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
 
const SYSTEM_PROMPT = `Finanzanalyst. Kapitalschutz > Gewinnmaximierung. Antworte NUR als JSON-Array.
 
## ANALYSE (alle 3 Schritte durchlaufen)
 
### 1. MAKRO & NEWS
- Geopolitik/Zölle/Sanktionen: Risk-Off oder Risk-On?
- Zinsen steigend = Tech-Gegenwind. Sinkend = Rückenwind.
- Sektor-Rotation: Fällt nur Tech oder der ganze Markt?
- Keine News = NEUTRAL (nicht negativ, nicht positiv).
 
### 2. KURS-ANALYSE
Berechne aus den Kursdaten:
- Trend: %-Veränderung 5d und 10d.
- 10d-MA: Kurs darüber = bullish, darunter = bearish.
- RSI-Proxy: Zähle die Verlusttage der letzten 10 Tage.
  * 7+ Verlusttage von 10 = ÜBERVERKAUFT → Mean-Reversion wahrscheinlich → BUY-Bias
  * 7+ Gewinntage von 10 = ÜBERKAUFT → Korrektur wahrscheinlich → SELL-Bias
  * 4-6 = neutral
- CRV: Aufwärtspotenzial / Abwärtsrisiko. CRV > 2 = BUY, CRV < 1 = SELL.
 
### 3. ENTSCHEIDUNG
 
**BUY wenn 2+ zutreffen:**
- ÜBERVERKAUFT (7+ Verlusttage/10) + Stabilisierung erkennbar (letzter Tag < -0.5% Verlust)
- Kurs -10%+ unter 10d-Hoch + Fundamentals intakt (kein Unternehmens-Skandal) → Mean-Reversion
- CRV > 2.0 + Kurs hält Support (Rebound 2+ Tage)
- Starke positive News + Aufwärtstrend bestätigt

**BUY auch bei nur 1 Bedingung wenn:**
- Kurs -12%+ unter 10d-Hoch UND Verluste verlangsamen sich (letzter Tag weniger Verlust als vorletzter) → Bodenbildung, Konfidenz max 0.62
 
**SELL wenn 2+ zutreffen:**
- ÜBERKAUFT (7+ Gewinntage/10) + Kurs nahe Resistance
- Kurs unter 10d-MA + Momentum beschleunigt negativ (-1% → -2% → -3%)
- Stark negative Unternehmens-News
- CRV < 0.8 + fallender Trend 5+ Tage
 
**HOLD wenn:**
- Weder BUY noch SELL hat 2+ Bedingungen erfüllt
- Seitwärts: <1.5% Schwankung in letzten 5 Tagen
 
## KRITISCHE REGELN
- ÜBERVERKAUFT ≠ SELL. Ein Asset das -15% in 10 Tagen gefallen ist, ist ein potentieller MEAN-REVERSION-BUY, nicht ein SELL.
- Momentum-SELL nur wenn Trend BESCHLEUNIGT (Verluste werden täglich größer). Verlangsamung = mögliche Bodenbildung.
- Rohstoffe/Minen (Gold, Kupfer, Öl): Höhere Volatilität normal. Erst bei -20%+ als kritisch werten.
- Krypto: Korreliert mit Nasdaq. Höhere Schwellen: ±25% statt ±10%.
- Diversifikation: Wenn alle BUY-Signale im selben Sektor → nur stärkstes Signal nehmen.
 
## KONFIDENZ
0.80+: Alle Ebenen einig. 0.65-0.79: Klarer Trend + CRV passt. 0.50-0.64: Gemischt. 0.35-0.49: Schwach.
Jedes Asset einzeln bewerten. NICHT alle gleiche Konfidenz.
 
## FORMAT
JSON-Array. Kein Markdown. 2 Sätze Begründung mit Zahlen.
[{"ticker":"FCX","action":"buy","confidence":0.72,"reasoning":"8/10 Verlusttage = überverkauft, Kurs -14% unter 10d-Hoch bei intakten Kupfer-Fundamentals. Mean-Reversion-Setup, CRV ~2.5.","targetPrice":42}]`;
 
export async function analyzeMarket(input: AnalysisInput): Promise<Signal[]> {
  const prompt = buildPrompt(input);
 
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 2048,
    temperature: 0.3,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  });
 
  const text = response.choices[0]?.message?.content?.trim() ?? '';

  try {
    const clean = text.replace(/```json\s?/g, '').replace(/```/g, '').trim();
    return JSON.parse(clean) as Signal[];
  } catch {
    return [{ ticker: '__debug__', action: 'hold', confidence: 0, reasoning: `PARSE_FAILED: ${text.slice(0, 400)}` }] as any;
  }
}
 
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
    .map((p) => {
      const pnl = ((p.currentPrice - p.buyPrice) / p.buyPrice * 100).toFixed(1);
      return `${p.ticker}: Kauf ${p.buyPrice}€, Aktuell ${p.currentPrice}€ (${Number(pnl) >= 0 ? '+' : ''}${pnl}%), Menge ${p.quantity}`;
    })
    .join('\n');
 
  const newsStr = input.news
    .slice(0, 20)
    .map((n) => `[${n.source}] ${n.title}`)
    .join('\n');
 
  const marketStr = input.marketData
    .map((m) => {
      const prices = m.prices;
      const len = prices.length;
      if (len < 2) return `${m.ticker}: ${m.changePct.toFixed(2)}% (zu wenig Daten)`;
 
      // Calculate RSI proxy
      let lossDays = 0;
      for (let i = Math.max(0, len - 10); i < len; i++) {
        if (i > 0 && prices[i] < prices[i - 1]) lossDays++;
      }
      const last10 = Math.min(10, len - 1);
      const rsiLabel = lossDays >= 7 ? 'ÜBERVERKAUFT' : lossDays <= 3 ? 'ÜBERKAUFT' : 'NEUTRAL';
 
      // 10d high
      const recent10 = prices.slice(-10);
      const high10d = Math.max(...recent10);
      const distFromHigh = ((prices[len - 1] - high10d) / high10d * 100).toFixed(1);
 
      // 10d MA
      const ma10 = recent10.reduce((a, b) => a + b, 0) / recent10.length;
      const distFromMA = ((prices[len - 1] - ma10) / ma10 * 100).toFixed(1);
 
      const trend = prices[len - 1] > prices[0] ? '↑' : '↓';
 
      return `${m.ticker}: ${m.changePct.toFixed(2)}% ${trend} | ${lossDays}/${last10} Verlusttage (${rsiLabel}) | ${distFromHigh}% unter 10d-Hoch | MA10-Abstand: ${distFromMA}%`;
    })
    .join('\n');
 
  const hasPortfolio = input.portfolio.some((p) => p.quantity > 0);

  return `Analysiere${hasPortfolio ? ' mein Portfolio und' : ''} folgende Aktien und gib Signale:

## ${hasPortfolio ? 'Mein Portfolio (quantity > 0 = bereits im Besitz, quantity = 0 = Kaufkandidat)' : 'Kaufkandidaten (quantity = 0, bewertet als potenzielle Neukäufe)'}
${portfolioStr}

## Aktuelle News-Schlagzeilen
${newsStr || 'Keine News verfügbar — entscheide auf Basis der Kursdaten.'}

## Marktdaten (inkl. RSI-Proxy & MA10)
${marketStr}

Gib für jeden Eintrag ein Signal (buy/sell/hold) mit Begründung.
- quantity > 0: beurteile ob halten, verkaufen oder nachkaufen.
- quantity = 0: beurteile ob jetzt ein guter Einstiegspunkt ist (buy) oder nicht (hold).
Beachte: Überverkauft = potentieller Mean-Reversion-BUY, nicht automatisch SELL.`;
}
 