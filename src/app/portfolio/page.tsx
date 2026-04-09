'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { searchStocks, type Stock } from '@/lib/stocks';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Position {
  id?: string;
  ticker: string;
  name: string;
  buy_price: number;
  quantity: number;
  buy_date: string;
  order_fee: number;
  asset_type: string;
}

const emptyPosition: Position = {
  ticker: '',
  name: '',
  buy_price: 0,
  quantity: 0,
  buy_date: new Date().toISOString().split('T')[0],
  order_fee: 0.99,
  asset_type: 'stock',
};

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [form, setForm] = useState<Position>(emptyPosition);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tickerQuery, setTickerQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Stock[]>([]);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('positions').select('*').eq('user_id', user.id).order('created_at');
    setPositions(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tickerQuery.length < 1) { setSuggestions([]); return; }
    setSuggestions(searchStocks(tickerQuery));
  }, [tickerQuery]);

  useEffect(() => {
    if (editing) setTickerQuery(form.ticker);
  }, [editing]);

  const selectStock = (stock: Stock) => {
    setForm((f) => ({
      ...f,
      ticker: stock.ticker,
      name: stock.name,
      asset_type: stock.category === 'etf' ? 'etf' : stock.category === 'crypto' ? 'crypto' : 'stock',
    }));
    setTickerQuery(stock.ticker);
    setSuggestions([]);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editing) {
      await supabase.from('positions').update({
        ticker: form.ticker.toUpperCase(),
        name: form.name,
        buy_price: form.buy_price,
        quantity: form.quantity,
        buy_date: form.buy_date,
        order_fee: form.order_fee,
        asset_type: form.asset_type,
      }).eq('id', editing);
    } else {
      await supabase.from('positions').insert({
        user_id: user.id,
        ticker: form.ticker.toUpperCase(),
        name: form.name,
        buy_price: form.buy_price,
        quantity: form.quantity,
        buy_date: form.buy_date,
        order_fee: form.order_fee,
        asset_type: form.asset_type,
      });
    }

    setForm(emptyPosition);
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Position wirklich löschen?')) return;
    await supabase.from('positions').delete().eq('id', id);
    load();
  };

  const startEdit = (p: Position) => {
    setForm(p);
    setEditing(p.id!);
  };

  const field = (label: string, key: keyof Position, type = 'text') => (
    <div>
      <label className="text-[11px] text-gray-500 uppercase tracking-wider block mb-1">{label}</label>
      <input
        type={type}
        step={type === 'number' ? '0.0001' : undefined}
        value={form[key] as string | number}
        onChange={(e) => setForm({ ...form, [key]: type === 'number' ? Number(e.target.value) : e.target.value })}
        className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-sm focus:border-gray-600 focus:outline-none"
      />
    </div>
  );

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-black text-gray-600 text-sm animate-pulse">Wird geladen…</div>;

  return (
    <div className="bg-black min-h-screen text-white">
      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-black/95 backdrop-blur-sm border-b border-gray-900">
        <div className="max-w-lg mx-auto flex items-center gap-3 px-4 h-14">
          <a href="/dashboard" className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </a>
          <h1 className="font-semibold text-base">Portfolio</h1>
          <span className="text-xs text-gray-600 ml-auto">{positions.length} Positionen</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-18 pb-10">
        <div className="h-4" />

      {/* Form */}
      <div className="bg-gray-900 rounded-2xl p-4 mb-5">
        <h2 className="text-sm font-semibold mb-3">{editing ? 'Position bearbeiten' : 'Position hinzufügen'}</h2>
        <div className="grid grid-cols-2 gap-3">
          {/* Ticker Autocomplete */}
          <div className="col-span-2 relative" ref={suggestionsRef}>
            <label className="text-[11px] text-gray-500 uppercase tracking-wider block mb-1">Aktie / ETF suchen</label>
            <input
              type="text"
              placeholder="z.B. Apple, AAPL, SAP..."
              value={tickerQuery}
              onChange={(e) => {
                setTickerQuery(e.target.value);
                setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase(), name: '' }));
              }}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-sm focus:border-gray-600 focus:outline-none"
            />
            {suggestions.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl">
                {suggestions.map((s) => (
                  <button
                    key={s.ticker}
                    type="button"
                    onClick={() => selectStock(s)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center justify-between"
                  >
                    <span className="text-sm font-medium">{s.ticker}</span>
                    <span className="text-xs text-gray-400 ml-2 truncate">{s.name}</span>
                    <span className="text-[10px] text-gray-600 ml-2 shrink-0">{s.category.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            )}
            {form.name && (
              <p className="text-xs text-gray-500 mt-1">{form.name}</p>
            )}
          </div>
          {field('Kaufkurs (€)', 'buy_price', 'number')}
          {field('Anzahl Anteile', 'quantity', 'number')}
          {field('Kaufdatum', 'buy_date', 'date')}
          {field('Ordergebühr (€)', 'order_fee', 'number')}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={save} className="flex-1 bg-white text-black text-sm font-semibold py-3 rounded-xl transition-opacity hover:opacity-90">
            {editing ? 'Speichern' : 'Hinzufügen'}
          </button>
          {editing && (
            <button onClick={() => { setForm(emptyPosition); setEditing(null); }} className="px-5 text-sm text-gray-500 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors">
              Abbrechen
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {positions.map((p) => (
          <div key={p.id} className="bg-gray-900 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{p.ticker}</span>
                <span className="text-gray-600 text-xs truncate">{p.name}</span>
              </div>
              <p className="text-[11px] text-gray-600 mt-0.5">
                {p.quantity}× @ {p.buy_price.toFixed(2)}€ · {p.buy_date}
              </p>
            </div>
            <button
              onClick={() => startEdit(p)}
              className="w-9 h-9 flex items-center justify-center rounded-full text-gray-600 hover:text-blue-400 hover:bg-blue-950/30 transition-colors shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button
              onClick={() => remove(p.id!)}
              className="w-9 h-9 flex items-center justify-center rounded-full text-gray-600 hover:text-red-400 hover:bg-red-950/30 transition-colors shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
