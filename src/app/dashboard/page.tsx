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

  // Accept modal state
  const [acceptingSignal, setAcceptingSignal] = useState<any>(null);
  const [investAmount, setInvestAmount] = useState('100');
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptToast, setAcceptToast] = useState('');

  const searchParams = useSearchParams();
  const router = useRouter();

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
      supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('positions').select('*').eq('user_id', user.id),
      supabase.from('signals')
        .select('*')
        .eq('user_id', user.id)
        .eq('signal_type', 'buy')
        .eq('status', 'pending')
        .gte('created_at', since)
        .order('confidence', { ascending: false }),
    ]);
    setSignals(signalsRes.data ?? []);
    setPositions(positionsRes.data ?? []);
    setPendingSignals(pendingRes.data ?? []);

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

  // Check if push is already active in browser
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setPushEnabled(true);
      });
    });
  }, []);

  // Handle notification click params (?signal=ID&action=accept/decline)
  useEffect(() => {
    if (!user || loading) return;
    const signalId = searchParams.get('signal');
    const action = searchParams.get('action');
    if (!signalId) return;

    if (action === 'accept') {
      // Find signal in pending list or fetch it
      supabase.from('signals').select('*').eq('id', signalId).single().then(({ data }) => {
        if (data) {
          setAcceptingSignal(data);
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

  const handleAccept = async () => {
    if (!acceptingSignal || !user) return;
    setAcceptLoading(true);
    const res = await fetch(`/api/signals/${acceptingSignal.id}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, amount: parseFloat(investAmount) }),
    });
    const data = await res.json();
    setAcceptLoading(false);
    if (res.ok) {
      setAcceptingSignal(null);
      setAcceptToast(`✅ ${acceptingSignal.ticker} gekauft — ${data.quantity.toFixed(4)} Anteile @ ${data.buyPrice?.toFixed(2)}€`);
      setTimeout(() => setAcceptToast(''), 4000);
      loadData();
    } else {
      setAcceptToast(`Fehler: ${data.error}`);
      setTimeout(() => setAcceptToast(''), 4000);
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
      {/* Toast */}
      {acceptToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm shadow-xl max-w-sm w-full text-center">
          {acceptToast}
        </div>
      )}

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

      {/* Pending BUY signals — awaiting accept/decline */}
      {pendingSignals.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-400 mb-3">
            Neue Signale <span className="text-emerald-400">({pendingSignals.length})</span>
          </h2>
          <div className="space-y-3">
            {pendingSignals.map((sig) => (
              <div key={sig.id} className="bg-emerald-950/30 border border-emerald-800/60 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400">KAUFEN</span>
                    <span className="font-medium">{sig.ticker}</span>
                    <span className="text-xs text-gray-500">{Math.round(sig.confidence * 100)}%</span>
                  </div>
                  <span className="text-xs text-gray-500">{sig.current_price?.toFixed(2)}€</span>
                </div>
                <p className="text-xs text-gray-400 mb-3 line-clamp-2">{sig.reasoning}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setAcceptingSignal(sig); setInvestAmount('100'); }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium py-2 rounded-lg transition-colors"
                  >
                    ✅ Kaufen
                  </button>
                  <button
                    onClick={() => handleDecline(sig.id)}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium py-2 rounded-lg transition-colors"
                  >
                    ❌ Ablehnen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Accept modal */}
      {acceptingSignal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-40 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg">{acceptingSignal.ticker} kaufen</h3>
                <p className="text-xs text-gray-500">Kurs: {acceptingSignal.current_price?.toFixed(2)}€</p>
              </div>
              <button
                onClick={() => setAcceptingSignal(null)}
                className="text-gray-500 hover:text-gray-300 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-4 line-clamp-3">{acceptingSignal.reasoning}</p>

            <div className="mb-4">
              <label className="text-xs text-gray-500 mb-1 block">Betrag investieren (€)</label>
              <input
                type="number"
                min="1"
                step="10"
                value={investAmount}
                onChange={(e) => setInvestAmount(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
              />
              {acceptingSignal.current_price && parseFloat(investAmount) > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  ≈ {(parseFloat(investAmount) / acceptingSignal.current_price).toFixed(4)} Anteile
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAccept}
                disabled={acceptLoading || !investAmount || parseFloat(investAmount) <= 0}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
              >
                {acceptLoading ? 'Wird gekauft...' : '✅ Jetzt kaufen'}
              </button>
              <button
                onClick={() => { handleDecline(acceptingSignal.id); setAcceptingSignal(null); }}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-3 rounded-xl transition-colors"
              >
                ❌ Ablehnen
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
        <div className="animate-pulse text-gray-400">Lade Dashboard...</div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
