'use client';

import { useState } from 'react';

interface Signal {
  id: string;
  ticker: string;
  signal_type: 'buy' | 'sell' | 'hold';
  confidence: number;
  reasoning: string;
  current_price: number;
  target_price: number;
  created_at: string;
  status: string;
}

const cfg = {
  buy:  { bg: 'bg-emerald-950/40', border: 'border-emerald-800/60', badge: 'bg-emerald-950 text-emerald-400', label: 'Kaufempfehlung' },
  sell: { bg: 'bg-red-950/40',     border: 'border-red-800/60',     badge: 'bg-red-950 text-red-400',         label: 'Verkaufsempfehlung' },
  hold: { bg: 'bg-amber-950/30',   border: 'border-amber-800/50',   badge: 'bg-amber-950 text-amber-400',     label: 'Weiter halten' },
};

// Extract timeframe hint from reasoning (looks for "Zeitrahmen: X")
function extractTimeframe(reasoning: string): string | null {
  const m = reasoning.match(/Zeitrahmen:\s*([^—\n]+)/i);
  return m ? m[1].trim() : null;
}

export default function SignalCard({
  signal,
  onDelete,
}: {
  signal: Signal;
  onDelete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = cfg[signal.signal_type];
  const time = new Date(signal.created_at).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const timeframe = extractTimeframe(signal.reasoning);
  const suggestedAmount = signal.signal_type === 'buy' && signal.target_price ? signal.target_price : null;

  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-3`}>
      <div
        className="flex items-center justify-between mb-1 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.badge}`}>
            {c.label}
          </span>
          <span className="font-medium text-sm">{signal.ticker}</span>
          <span className="text-[11px] text-gray-500">{Math.round(signal.confidence * 100)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600">{time}</span>
          <span className="text-gray-600 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      <p className={`text-xs text-gray-400 mt-1 ${expanded ? '' : 'line-clamp-2'}`}>
        {signal.reasoning}
      </p>

      <div className="flex items-center justify-between mt-2 flex-wrap gap-y-1">
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          {signal.current_price > 0 && <span>Kurs: {signal.current_price.toFixed(2)}€</span>}
          {suggestedAmount && <span className="text-emerald-500 font-medium">Empfohlen: {suggestedAmount}€</span>}
          {timeframe && <span className="text-blue-400">~{timeframe}</span>}
        </div>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(signal.id); }}
            className="text-[11px] text-gray-600 hover:text-red-400 transition-colors"
          >
            Löschen
          </button>
        )}
      </div>
    </div>
  );
}
