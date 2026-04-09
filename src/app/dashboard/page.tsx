'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import SignalCard from '@/components/SignalCard';
import PortfolioTable from '@/components/PortfolioTable';
import ProfitCalculator from '@/components/ProfitCalculator';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function DashboardContent() {
  const [signals, setSignals] = useState<any[]>([]);
  const [pendingSignals, setPendingSignals] = useState<any[]>([]);
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

  // Buy modal
  const [acceptingBuy, setAcceptingBuy] = useState<any>(null);
  const [investAmount, setInvestAmount] = useState('100');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const searchParams = useSearchParams();
  const router = useRouter();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

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
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [signalsRes, positionsRes, pendingRes] = await Promise.all([
      supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('positions').select('*').eq('user_id', user.id),
      supabase.from('signals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .gte('created_at', since)
        .order('confidence', { ascending: false }),
    ]);
    setSignals(signalsRes.data ?? []);
    setPositions(positionsRes.data ?? []);
    // Sort: sell first, then buy, then hold
    const order: Record<string, number> = { sell: 0, buy: 1, hold: 2 };
    const sorted = (pendingRes.data ?? []).sort((a: any, b: any) =>
      (order[a.signal_type] ?? 3) - (order[b.signal_type] ?? 3)
    );
    setPendingSignals(sorted);

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

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setPushEnabled(true);
      });
    });
  }, []);

  // Handle notification click params
  useEffect(() => {
    if (!user || loading) return;
    const signalId = searchParams.get('signal');
    const action = searchParams.get('action');
    if (!signalId) return;

    if (action === 'accept') {
      supabase.from('signals').select('*').eq('id', signalId).single().then(({ data }) => {
        if (data && data.signal_type === 'buy') {
          setAcceptingBuy(data);
          setInvestAmount(String(data.target_price ?? 100));
          router.replace('/dashboard', { scroll: false });
        }
      });
    } else if (action === 'decline') {
      fetch(`/api/signals/${signalId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      }).then(() => {
        setPendingSignals((prev) => prev.filter((s) => s.id !== signalId));
        router.replace('/dashboard', { scroll: false });
      });
    }
  }, [user, loading, searchParams, router]);

  // ── Accept BUY ──────────────────────────────────────────────────────────
  const handleBuy = async () => {
    if (!acceptingBuy || !user) return;
    setActionLoading(acceptingBuy.id);
    const res = await fetch(`/api/signals/${acceptingBuy.id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, amount: parseFloat(investAmount) }),
    });
    const data = await res.json();
    setActionLoading(null);
    if (res.ok) {
      setAcceptingBuy(null);
      showToast(`Gekauft: ${acceptingBuy.ticker} — ${data.quantity?.toFixed(4)} Anteile @ ${data.buyPrice?.toFixed(2)}€`);
      loadData();
    } else {
      showToast(`Fehler: ${data.error}`);
    }
  };

  // ── Accept SELL / HOLD ───────────────────────────────────────────────────
  const handleAccept = async (sig: any) => {
    if (!user) return;
    setActionLoading(sig.id);
    const res = await fetch(`/api/signals/${sig.id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    });
    setActionLoading(null);
    if (res.ok) {
      if (sig.signal_type === 'sell') {
        showToast(`${sig.ticker} aus Portfolio entfernt.`);
      } else {
        showToast(`${sig.ticker} — Empfehlung bestätigt.`);
      }
      setPendingSignals((prev) => prev.filter((s) => s.id !== sig.id));
      loadData();
    } else {
      showToast('Fehler beim Verarbeiten.');
    }
  };

  const handleDecline = async (signalId: string) => {
    if (!user) return;
    await fetch(`/api/signals/${signalId}/decline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    });
    setPendingSignals((prev) => prev.filter((s) => s.id !== signalId));
  };

  const handleDeleteSignal = async (signalId: string) => {
    await supabase.from('signals').delete().eq('id', signalId);
    setSignals((prev) => prev.filter((s) => s.id !== signalId));
  };

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
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });
      }
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

  // ── Login ────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="max-w-sm mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold mb-1">Investmentberater</h1>
        <p className="text-sm text-gray-500 mb-8">Dein persönlicher KI-Anlageberater</p>
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
        <div className="animate-pulse text-gray-400">Lade Berater...</div>
      </div>
    );
  }

  const totalInvested = positions.reduce((sum, p) => sum + p.buy_price * p.quantity + p.order_fee, 0);
  const totalCurrent = positions.reduce((sum, p) => {
    const q = quotes[p.ticker];
    return sum + (q ? q.price * p.quantity : p.buy_price * p.quantity);
  }, 0);
  const totalProfitPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;
  const totalProfitAbs = totalCurrent - totalInvested;

  const buySigs = pendingSignals.filter((s) => s.signal_type === 'buy');
  const sellSigs = pendingSignals.filter((s) => s.signal_type === 'sell');
  const holdSigs = pendingSignals.filter((s) => s.signal_type === 'hold');

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm shadow-xl max-w-sm w-full text-center">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Investmentberater</h1>
          <p className="text-xs text-gray-500">KI-Analyse · 3× täglich · 300–500€/Monat</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={enablePush}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              pushEnabled
                ? 'border-emerald-700 text-emerald-400 bg-emerald-950/40'
                : 'border-gray-700 text-gray-500 hover:border-gray-500'
            }`}
          >
            {pushEnabled ? '● Benachricht.' : 'Benachricht.'}
          </button>
          <button
            onClick={() => supabase.auth.signOut().then(() => setUser(null))}
            className="text-xs text-gray-600 hover:text-gray-400"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-gray-900 rounded-xl p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Investiert</p>
          <p className="text-base font-medium mt-1">{totalInvested.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Aktuell</p>
          <p className="text-base font-medium mt-1">{totalCurrent.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Rendite</p>
          <p className={`text-base font-medium mt-1 ${totalProfitPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalProfitPct >= 0 ? '+' : ''}{totalProfitPct.toFixed(1)}%
          </p>
          {totalInvested > 0 && (
            <p className={`text-[11px] mt-0.5 ${totalProfitAbs >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {totalProfitAbs >= 0 ? '+' : ''}{totalProfitAbs.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </p>
          )}
        </div>
      </div>

      {/* Heutige Empfehlungen */}
      {pendingSignals.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-300 mb-3">
            Empfehlungen heute
            <span className="ml-2 text-xs text-gray-600 font-normal">({pendingSignals.length})</span>
          </h2>

          <div className="space-y-3">
            {/* SELL signals — highest urgency */}
            {sellSigs.map((sig) => {
              const pos = positions.find((p) => p.ticker === sig.ticker);
              const curPrice = quotes[sig.ticker]?.price ?? sig.current_price;
              const pnlPct = pos ? ((curPrice - pos.buy_price) / pos.buy_price * 100) : null;
              return (
                <div key={sig.id} className="bg-red-950/30 border border-red-800/60 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-950 text-red-400">Verkaufen</span>
                      <span className="font-semibold">{sig.ticker}</span>
                      {pnlPct !== null && (
                        <span className={`text-xs font-medium ${pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{Math.round(sig.confidence * 100)}%</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3 line-clamp-3">{sig.reasoning}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(sig)}
                      disabled={actionLoading === sig.id}
                      className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium py-2 rounded-lg transition-colors"
                    >
                      {actionLoading === sig.id ? '...' : pnlPct !== null ? `Verkaufen (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)` : 'Verkaufen'}
                    </button>
                    <button
                      onClick={() => handleDecline(sig.id)}
                      className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium py-2 rounded-lg transition-colors"
                    >
                      Behalten
                    </button>
                  </div>
                </div>
              );
            })}

            {/* BUY signals */}
            {buySigs.map((sig) => (
              <div key={sig.id} className="bg-emerald-950/25 border border-emerald-800/50 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400">Kaufen</span>
                    <span className="font-semibold">{sig.ticker}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500">{Math.round(sig.confidence * 100)}% Überzeugung</span>
                    {sig.target_price > 0 && (
                      <p className="text-xs text-emerald-500 font-medium">{sig.target_price}€ empfohlen</p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-3 line-clamp-3">{sig.reasoning}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setAcceptingBuy(sig);
                      setInvestAmount(String(sig.target_price > 0 ? sig.target_price : 100));
                    }}
                    className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium py-2 rounded-lg transition-colors"
                  >
                    Kaufen →
                  </button>
                  <button
                    onClick={() => handleDecline(sig.id)}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium py-2 rounded-lg transition-colors"
                  >
                    Ignorieren
                  </button>
                </div>
              </div>
            ))}

            {/* HOLD signals */}
            {holdSigs.map((sig) => {
              const pos = positions.find((p) => p.ticker === sig.ticker);
              const curPrice = quotes[sig.ticker]?.price ?? sig.current_price;
              const pnlPct = pos ? ((curPrice - pos.buy_price) / pos.buy_price * 100) : null;
              return (
                <div key={sig.id} className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-950 text-amber-400">Halten</span>
                      <span className="font-semibold">{sig.ticker}</span>
                      {pnlPct !== null && (
                        <span className={`text-xs ${pnlPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{Math.round(sig.confidence * 100)}%</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3 line-clamp-2">{sig.reasoning}</p>
                  <button
                    onClick={() => handleAccept(sig)}
                    disabled={actionLoading === sig.id}
                    className="w-full bg-gray-800 hover:bg-gray-750 border border-amber-800/30 text-amber-400 text-xs font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {actionLoading === sig.id ? '...' : 'Bestätigt — ich halte weiter'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empfehlungs-Verlauf */}
      <div className="mb-6">
        <h2 className="text-sm font-medium text-gray-400 mb-3">
          Verlauf
          <span className="ml-2 text-xs text-gray-600 font-normal">({signals.filter(s => s.status !== 'pending').length})</span>
        </h2>
        {signals.filter(s => s.status !== 'pending').length === 0 ? (
          <p className="text-sm text-gray-600">Noch keine Empfehlungen. Der Berater analysiert 3× täglich.</p>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {signals.filter(s => s.status !== 'pending').map((s) => (
              <SignalCard key={s.id} signal={s} onDelete={handleDeleteSignal} />
            ))}
          </div>
        )}
      </div>

      {/* Portfolio */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-400">Mein Portfolio</h2>
          <a href="/portfolio" className="text-xs text-blue-400 hover:text-blue-300">Bearbeiten →</a>
        </div>
        {positions.length === 0 ? (
          <p className="text-sm text-gray-600">Noch keine Positionen. <a href="/portfolio" className="text-blue-400">Portfolio aufbauen →</a></p>
        ) : (
          <PortfolioTable positions={positions} quotes={quotes} onSelect={(p) => setSelectedPosition(p)} />
        )}
      </div>

      {selectedPosition && (
        <ProfitCalculator
          position={selectedPosition}
          currentPrice={quotes[selectedPosition.ticker]?.price ?? selectedPosition.buy_price}
          onClose={() => setSelectedPosition(null)}
        />
      )}

      {/* BUY modal */}
      {acceptingBuy && (
        <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-40 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="font-semibold text-lg">{acceptingBuy.ticker} kaufen</h3>
                <p className="text-xs text-gray-500">Aktueller Kurs: {acceptingBuy.current_price?.toFixed(2)}€</p>
              </div>
              <button
                onClick={() => setAcceptingBuy(null)}
                className="text-gray-500 hover:text-gray-300 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-gray-400 my-3 line-clamp-4">{acceptingBuy.reasoning}</p>

            <div className="mb-4">
              <label className="text-xs text-gray-500 mb-1 block">Investitionsbetrag (€)</label>
              <div className="flex gap-2 mb-2">
                {[50, 100, 150, 200].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setInvestAmount(String(amt))}
                    className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                      investAmount === String(amt)
                        ? 'border-emerald-600 text-emerald-400 bg-emerald-950/40'
                        : 'border-gray-700 text-gray-500 hover:border-gray-500'
                    }`}
                  >
                    {amt}€
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="1"
                step="10"
                value={investAmount}
                onChange={(e) => setInvestAmount(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
              />
              {acceptingBuy.current_price && parseFloat(investAmount) > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  = {(parseFloat(investAmount) / acceptingBuy.current_price).toFixed(4)} Anteile
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleBuy}
                disabled={actionLoading === acceptingBuy.id || !investAmount || parseFloat(investAmount) <= 0}
                className="flex-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
              >
                {actionLoading === acceptingBuy.id ? 'Wird gekauft...' : 'Jetzt kaufen'}
              </button>
              <button
                onClick={() => { handleDecline(acceptingBuy.id); setAcceptingBuy(null); }}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-3 rounded-xl transition-colors"
              >
                Ignorieren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-400">Lade Berater...</div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
