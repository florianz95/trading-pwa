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
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
    </div>
  );

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Laden...</div>;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Portfolio</h1>
          <p className="text-sm text-gray-400">{positions.length} Positionen</p>
        </div>
        <a href="/dashboard" className="text-xs text-blue-400">← Dashboard</a>
      </div>

      {/* Form */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-medium mb-3">{editing ? 'Position bearbeiten' : 'Neue Position'}</h2>
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
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
        <div className="flex gap-2 mt-3">
          <button onClick={save} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm py-2 rounded-lg transition-colors">
            {editing ? 'Speichern' : 'Hinzufügen'}
          </button>
          {editing && (
            <button onClick={() => { setForm(emptyPosition); setEditing(null); }} className="px-4 text-sm text-gray-400 hover:text-gray-200">
              Abbrechen
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {positions.map((p) => (
          <div key={p.id} className="bg-gray-900 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="font-medium text-sm">{p.ticker}</span>
              <span className="text-gray-500 text-xs ml-2">{p.name}</span>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {p.quantity}× @ {p.buy_price.toFixed(2)}€ · Gebühr {p.order_fee}€ · {p.buy_date}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(p)} className="text-xs text-blue-400 hover:text-blue-300">Bearb.</button>
              <button onClick={() => remove(p.id!)} className="text-xs text-red-400 hover:text-red-300">Löschen</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
