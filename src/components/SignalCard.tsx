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
}

const colors = {
  buy:  { bg: 'bg-emerald-950/50', border: 'border-emerald-800', text: 'text-emerald-400', label: 'KAUFEN' },
  sell: { bg: 'bg-red-950/50',     border: 'border-red-800',     text: 'text-red-400',     label: 'VERKAUFEN' },
  hold: { bg: 'bg-yellow-950/40',  border: 'border-yellow-800',  text: 'text-yellow-400',  label: 'HALTEN' },
};

export default function SignalCard({
  signal,
  onDelete,
}: {
  signal: Signal;
  onDelete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = colors[signal.signal_type];
  const time = new Date(signal.created_at).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-3`}>
      <div
        className="flex items-center justify-between mb-1 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
            {c.label}
          </span>
          <span className="font-medium">{signal.ticker}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500">{time}</span>
          <span className="text-gray-600 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      <p className={`text-xs text-gray-400 mt-1 ${expanded ? '' : 'line-clamp-2'}`}>
        {signal.reasoning}
      </p>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-4 text-[11px] text-gray-500">
          <span>Kurs: {signal.current_price?.toFixed(2)}€</span>
          {signal.target_price && <span>Ziel: {signal.target_price?.toFixed(2)}€</span>}
          <span>Konfidenz: {Math.round(signal.confidence * 100)}%</span>
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
