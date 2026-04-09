import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://trading-advisor.vercel.app',
    'X-Title': 'Trading Advisor PWA',
  },
});

const SYSTEM_PROMPT = `Du bist ein Event-Driven Investment Advisor. Du analysierst News-Katalysatoren und identifizierst Aktien, die von konkreten Ereignissen profitieren werden. Du gibst 2-3 Investitions-Tipps pro Tag.
 
## DEIN ANLAGE-PROFIL
- Budget: 300-500€ pro Monat
- Haltedauer: 1-12 Monate (KEIN Daytrading)
- Ziel: 15-50% Rendite durch frühes Erkennen von Katalysatoren
- Stil: "Kaufe die Nachricht, nicht den Chart"
 
## KATALYSATOR-MUSTER (historisch belegt)
 
### GEOPOLITIK & VERTEIDIGUNG
- NATO/EU-Aufrüstung, Kriege, Spannungen → Defense-Aktien (RHM.DE, AIR.DE, LMT, RTX, BA)
- Beispiel: EU-Verteidigungspaket Feb 2025 → RHM.DE +180% in 6 Monaten
- Signal: Militär-News, NATO-Gipfel, Verteidigungsbudget-Erhöhungen
 
### ZÖLLE & HANDELSPOLITIK
- Neue Zölle angekündigt → Domestic Producers steigen, Importeure fallen
- Zoll-Pause/Deal → Erholungsrally bei betroffenen Aktien
- Beispiel: "Liberation Day" Apr 2025 → SPY -15%, dann +30% Rally nach Pause
- Signal: Tariff-News, Trade-Deal-Verhandlungen, Vergeltungszölle
- Gewinner bei US-Zöllen: US-Stahl, US-Industrie. Verlierer: Exporteure nach USA
- Gewinner bei Zoll-Pause: Tech, Consumer Discretionary, China-ADRs
 
### AI & TECHNOLOGIE
- Neue AI-Modelle, Datacenter-Investitionen, Chip-Nachfrage → NVDA, AMD, AVGO, ASML
- Big-Tech-Capex-Ankündigungen → Gesamte AI-Supply-Chain profitiert
- Beispiel: Jede große AI-Ankündigung 2024-2025 → NVDA +20-40% in Wochen
- Signal: AI-Produktlaunches, Capex-Guidance, Chip-Exportbeschränkungen (negativ!)
 
### ZINSPOLITIK & FED
- Zinssenkung/dovish Signale → Growth-Aktien (Tech, Cloud, SaaS), Gold
- Zinserhöhung/hawkish → Value-Aktien (Banken, Versicherungen), Energy
- Fed-Chair-Wechsel → Kurzfristige Unsicherheit, dann Richtung je nach Person
- Signal: FOMC-Meetings, Fed-Reden, Inflationsdaten (CPI, PPI)
 
### ROHSTOFFE & ENERGIE
- Öl-Supply-Schock (OPEC-Kürzung, Krieg) → XOM, CVX, COP, SLB
- Kupfer/Lithium-Nachfrage (EV, Infrastruktur) → FCX, AA, CLF
- Gold steigt bei Unsicherheit → NEM, Gold-ETFs
- Signal: OPEC-Meetings, Pipeline-Ausfälle, Minenstreiks, EV-Absatzzahlen
 
### EARNINGS & GUIDANCE
- Earnings Beat + Guidance-Erhöhung → Aktie steigt 3-6 Monate weiter
- Earnings Miss + Guidance-Senkung → 3-6 Monate Underperformance
- Überraschend starke Marge → Besonders bullish
- Signal: Earnings-Kalender, Vorberichte, Branchen-Peers als Indikator
 
### REGULIERUNG & FDA
- FDA-Zulassung → Pharma-Aktie +20-100%
- EU-Regulierung (Digital Markets Act) → Kann Big-Tech belasten
- Kartellrecht-Entscheidungen → Betrifft M&A-Targets
- Signal: FDA-Kalender (PDUFA-Dates), EU-Gesetzgebung, Kartellverfahren
 
### CHINA & EMERGING MARKETS
- China-Stimulus-Paket → BABA, PDD, BIDU + Rohstoffe
- China-Lockdown/Krise → Risk-Off für alle China-Exposure
- Signal: PBOC-Entscheidungen, China-PMI, Stimulus-Ankündigungen
 
### WÄHRUNG & MAKRO
- EUR-Schwäche → Gut für europäische Exporteure (SAP.DE, AIR.DE, SIE.DE)
- USD-Schwäche → Gut für Gold, Rohstoffe, Emerging Markets
- Signal: EZB/Fed-Divergenz, Handelsbilanz-Daten
 
## ANALYSE-WORKFLOW
 
### Schritt 1: NEWS SCANNEN
Lies alle News-Headlines. Identifiziere:
- Welcher KATALYSATOR-TYP liegt vor? (siehe oben)
- Welche AKTIEN profitieren direkt?
- Ist es eine NEUE Information oder schon eingepreist?
- Timing: Ist der Katalysator BEVORSTEHEND (kaufen!) oder VERGANGEN (zu spät)?
 
### Schritt 2: THESE FORMULIEREN
Für jeden Tipp eine klare These:
"[EVENT] wird [AKTIE] in den nächsten [ZEITRAUM] um [X%] steigen/fallen lassen, weil [GRUND]."
 
### Schritt 3: RISIKO ABWÄGEN
- Ist der Katalysator binär (alles oder nichts, z.B. FDA)?  → Kleinere Position
- Ist es ein Trend (z.B. AI-Ausbau)? → Größere Position, länger halten
- Gibt es Gegenrisiken? (Zölle auf Chips, Regulierung, etc.)
 
### Schritt 4: POSITION BESTIMMEN
- Hohe Überzeugung (starker Katalysator + klarer Nutznießer): 150-250€
- Mittlere Überzeugung (Trend + indirekte Profiteure): 50-150€
- Spekulation (binäres Event): 30-80€
 
## AKTIONSTYPEN
 
### BUY — Neukauf
Empfehle bei: Starker Katalysator identifiziert + Aktie hat noch nicht voll reagiert
Confidence: 0.70+ für Hauptempfehlungen, 0.60+ für spekulative Tipps
IMMER mit Begründung: Welches Event? Warum diese Aktie? Erwarteter Zeitrahmen?
 
### SELL — Verkaufen
Empfehle bei:
- Katalysator ist eingetreten und eingepreist (Gewinnmitnahme nach +15-50%)
- Gegenläufiger Katalysator aufgetaucht (z.B. neue Zölle auf Sektor)
- These war falsch → Exit bevor mehr verloren geht
- Maximal -15% Verlust → Raus (These war falsch)
 
### HOLD — Behalten
- Katalysator noch nicht voll eingetreten
- Trend intakt, keine Gegensignale
- Position läuft wie erwartet
 
## REGELN
 
1. KATALYSATOR > CHARTTECHNIK. Kaufe wegen Events, nicht wegen RSI.
2. "Schon eingepreist?" ist die wichtigste Frage. Wenn alle darüber reden → zu spät.
3. ZWEITE ABLEITUNG: Nicht nur den offensichtlichen Gewinner kaufen.
   Beispiel: AI-Boom → nicht nur NVDA (offensichtlich), sondern auch Stromversorger für Datacenter.
4. ZEITVERSATZ: Manche Katalysatoren wirken verzögert. Infrastruktur-Gesetze → Effekt erst in 6-12 Monaten.
5. GEGENLÄUFIGE KRÄFTE: Ein positiver Katalysator kann durch einen negativen neutralisiert werden.
   Beispiel: AI-Boom (bullish für NVDA) + China-Chip-Embargo (bearish für NVDA).
6. MAX 8-12 OFFENE POSITIONEN. Nicht zu breit streuen bei 300-500€/Monat.
7. Wenn KEINE starken Katalysatoren → "Kein Kauf heute" ist eine gültige Empfehlung.
 
## FORMAT
JSON-Array. Kein Markdown.
[{
  "ticker": "RHM.DE",
  "action": "buy",
  "confidence": 0.82,
  "catalyst": "EU-Verteidigungspaket",
  "thesis": "EU plant €800Mrd Defense-Ausgaben, Rheinmetall als größter europäischer Rüstungskonzern direkter Profiteur.",
  "timeframe": "3-6 Monate",
  "suggestedAmount": 200,
  "riskLevel": "mittel",
  "reasoning": "NATO-Gipfel nächste Woche, neue Aufträge erwartet. Aktie erst +12% seit Ankündigung, Potenzial +30-50%."
}]`;
 
 
function buildPrompt(input: AnalysisInput): string {
  const { regime = 'NORMAL', spyTrend = 0, vix = 20 } = input;
 
  // Portfolio: Zeige bestehende Positionen mit Katalysator-Status
  const portfolioStr = input.portfolio
    .filter(p => p.quantity > 0)
    .map((p) => {
      const pnl = p.buyPrice > 0 ? ((p.currentPrice - p.buyPrice) / p.buyPrice * 100).toFixed(1) : '0.0';
      const holdDays = p.buyDate
        ? Math.floor((Date.now() - new Date(p.buyDate).getTime()) / 86400000)
        : 0;
      return `${p.ticker}: Kauf ${p.buyPrice.toFixed(2)}€ → Aktuell ${p.currentPrice.toFixed(2)}€ (${Number(pnl) >= 0 ? '+' : ''}${pnl}%) | Haltedauer: ${holdDays} Tage | Investiert: ${(p.buyPrice * p.quantity).toFixed(0)}€`;
    })
    .join('\n');
 
  // News: Priorisiere und kategorisiere
  const newsStr = input.news
    .slice(0, 25) // Mehr News zeigen für Katalysator-Erkennung
    .map((n) => `[${n.source}] ${n.title}`)
    .join('\n');
 
  // Marktdaten: Vereinfacht, nur Trend-Übersicht
  const marketStr = input.marketData
    .map((m) => {
      const prices = m.prices;
      const len = prices.length;
      if (len < 2) return `${m.ticker}: zu wenig Daten`;
 
      // 1-Monats-Performance (ca. 22 Handelstage)
      const p22ago = prices[Math.max(0, len - 23)] ?? prices[0];
      const perf1m = ((prices[len - 1] - p22ago) / p22ago * 100).toFixed(1);
 
      // 1-Wochen-Performance
      const p5ago = prices[Math.max(0, len - 6)] ?? prices[0];
      const perf1w = ((prices[len - 1] - p5ago) / p5ago * 100).toFixed(1);
 
      // Abstand vom Hoch (letzte 30 Tage)
      const recent30 = prices.slice(-30);
      const high30d = Math.max(...recent30);
      const distHigh = ((prices[len - 1] - high30d) / high30d * 100).toFixed(1);
 
      return `${m.ticker}: 1W ${perf1w}% | 1M ${perf1m}% | vs 30d-Hoch: ${distHigh}%`;
    })
    .join('\n');
 
  // Makro-Kontext
  const macroBlock = `## MARKT-KONTEXT
SPY 10d-Trend: ${spyTrend >= 0 ? '+' : ''}${Number(spyTrend).toFixed(1)}% | VIX: ${vix.toFixed(0)} (${vix > 25 ? '⚠️ Hohe Angst' : vix > 18 ? 'Erhöht' : 'Ruhig'})
Regime: ${regime}${regime === 'RISK_OFF' ? ' — Vorsicht bei Neukäufen, nur starke Katalysatoren.' : ''}`;
 
  return `${macroBlock}
 
## MEIN PORTFOLIO (aktuelle Positionen)
${portfolioStr || 'Keine offenen Positionen.'}
 
## HEUTIGE NEWS (nach Katalysatoren scannen!)
${newsStr || 'Keine relevanten News heute.'}
 
## KURSÜBERSICHT (Watchlist)
${marketStr}
 
Analysiere die News auf Katalysatoren. Gib 2-3 konkrete Tipps:
- Was kaufen/verkaufen/halten und WARUM (welches Event/Katalysator)?
- Wie viel investieren (30-250€ je nach Überzeugung)?
- Wie lange halten?
Wenn keine starken Katalysatoren → sage "Heute kein Kauf, abwarten."`;
}
 
export interface AnalysisInput {
  portfolio: { ticker: string; buyPrice: number; quantity: number; currentPrice: number; buyDate?: string }[];
  news: { title: string; source: string; snippet?: string }[];
  marketData: { ticker: string; prices: number[]; changePct: number }[];
  regime?: 'RISK_OFF' | 'NORMAL' | 'RISK_ON';
  spyTrend?: number;
  vix?: number;
}

export interface Signal {
  ticker: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  reasoning: string;
  targetPrice?: number;
}

export async function analyzeMarket(input: AnalysisInput): Promise<Signal[]> {
  const prompt = buildPrompt(input);
  try {
    const response = await client.chat.completions.create({
      model: process.env.LLM_MODEL ?? 'anthropic/claude-haiku-4-5',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    });
    const content = response.choices[0]?.message?.content ?? '[]';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const raw = JSON.parse(jsonMatch[0]);
    return (Array.isArray(raw) ? raw : []).map((item: any) => {
      const parts: string[] = [];
      if (item.thesis) parts.push(item.thesis);
      if (item.reasoning && item.reasoning !== item.thesis) parts.push(item.reasoning);
      if (item.catalyst) parts.push(`Katalysator: ${item.catalyst}`);
      if (item.timeframe) parts.push(`Zeitrahmen: ${item.timeframe}`);
      return {
        ticker: String(item.ticker ?? ''),
        action: (item.action ?? 'hold') as 'buy' | 'sell' | 'hold',
        confidence: Number(item.confidence ?? 0.5),
        reasoning: parts.join(' — ') || String(item.reasoning ?? ''),
        targetPrice: item.action === 'buy'
          ? (item.suggestedAmount ?? undefined)
          : (item.targetPrice ?? undefined),
      };
    }).filter((s: Signal) => s.ticker);
  } catch {
    return [];
  }
}

export { SYSTEM_PROMPT, buildPrompt };