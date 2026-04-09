'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import SignalCard from '@/components/SignalCard';
import PortfolioTable from '@/components/PortfolioTable';
import ProfitCalculator from '@/components/ProfitCalculator';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DashboardPage() {
  const [signals, setSignals] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser(data.user);
      else setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => { listener.subscription.unsubscribe(); };
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [signalsRes, positionsRes] = await Promise.all([
      supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('positions').select('*').eq('user_id', user.id),
    ]);
    setSignals(signalsRes.data ?? []);
    setPositions(positionsRes.data ?? []);

    const tickers = [...new Set((positionsRes.data ?? []).map((p: any) => p.ticker))];
    if (tickers.length > 0) {
      try {
        const res = await fetch(`/api/market/quote?tickers=${tickers.join(',')}`);
        const data = await res.json();
        const map: Record<string, any> = {};
        for (const q of data.quotes ?? []) map[q.ticker] = q;
        setQuotes(map);
      } catch {}
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { if (user) loadData(); }, [user, loadData]);

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    setAuthLoading(false);
  };

  const enablePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push wird auf diesem Gerät nicht unterstützt.');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), userId: user.id }),
      });
      setPushEnabled(true);
    } catch (err) {
      console.error('Push failed:', err);
    }
  };

  // ── Login ──
  if (!user) {
    return (
      <div className="max-w-sm mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold mb-2">Trading Advisor</h1>
        <p className="text-sm text-gray-400 mb-8">Login</p>
        <input
          type="email"
          placeholder="E-Mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm mb-3 focus:border-blue-500 focus:outline-none"
        />
        <input
          type="password"
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm mb-3 focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={handleLogin}
          disabled={authLoading || !email || !password}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm py-3 rounded-lg transition-colors"
        >
          {authLoading ? 'Anmelden...' : 'Anmelden'}
        </button>
        {authError && <p className="text-sm text-red-400 mt-4">{authError}</p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-400">Lade Dashboard...</div>
      </div>
    );
  }

  const totalInvested = positions.reduce((sum, p) => sum + p.buy_price * p.quantity + p.order_fee, 0);
  const totalCurrent = positions.reduce((sum, p) => {
    const q = quotes[p.ticker];
    return sum + (q ? q.price * p.quantity : p.buy_price * p.quantity);
  }, 0);
  const totalProfitPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Trading Advisor</h1>
          <p className="text-sm text-gray-400">Dein KI-Berater</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={enablePush}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              pushEnabled
                ? 'border-emerald-600 text-emerald-400 bg-emerald-950/40'
                : 'border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {pushEnabled ? '● Push aktiv' : 'Push aktivieren'}
          </button>
          <button
            onClick={() => supabase.auth.signOut().then(() => setUser(null))}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-gray-900 rounded-xl p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Investiert</p>
          <p className="text-lg font-medium mt-1">{totalInvested.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Aktuell</p>
          <p className="text-lg font-medium mt-1">{totalCurrent.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Rendite</p>
          <p className={`text-lg font-medium mt-1 ${totalProfitPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalProfitPct >= 0 ? '+' : ''}{totalProfitPct.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Letzte Signale</h2>
        {signals.length === 0 ? (
          <p className="text-sm text-gray-600">Noch keine Signale. Der Bot analysiert 3× täglich.</p>
        ) : (
          <div className="space-y-2">
            {signals.slice(0, 5).map((s) => (
              <SignalCard key={s.id} signal={s} />
            ))}
          </div>
        )}
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-400">Mein Portfolio</h2>
          <a href="/portfolio" className="text-xs text-blue-400 hover:text-blue-300">Bearbeiten →</a>
        </div>
        <PortfolioTable positions={positions} quotes={quotes} onSelect={(p) => setSelectedPosition(p)} />
      </div>

      {selectedPosition && (
        <ProfitCalculator
          position={selectedPosition}
          currentPrice={quotes[selectedPosition.ticker]?.price ?? selectedPosition.buy_price}
          onClose={() => setSelectedPosition(null)}
        />
      )}
    </div>
  );
}
