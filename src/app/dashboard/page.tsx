'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import PortfolioTable from '@/components/PortfolioTable';
import ProfitCalculator from '@/components/ProfitCalculator';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Tab = 'today' | 'history' | 'portfolio';

const TYPE_CFG = {
  buy:  { label: 'Kaufen',   bg: 'bg-emerald-950/40', border: 'border-emerald-800/60', badge: 'bg-emerald-950 text-emerald-400', btn: 'bg-emerald-700 hover:bg-emerald-600 text-white' },
  sell: { label: 'Verkaufen', bg: 'bg-red-950/35',     border: 'border-red-800/55',     badge: 'bg-red-950 text-red-400',         btn: 'bg-red-700 hover:bg-red-600 text-white' },
  hold: { label: 'Halten',   bg: 'bg-amber-950/25',   border: 'border-amber-800/40',   badge: 'bg-amber-950 text-amber-400',     btn: 'bg-gray-800 hover:bg-gray-700 text-amber-300 border border-amber-800/40' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Gerade';
  if (h < 24) return `vor ${h}h`;
  const d = Math.floor(h / 24);
  return `vor ${d}d`;
}

function DashboardContent() {
  const [tab, setTab] = useState<Tab>('today');
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

  const [acceptingBuy, setAcceptingBuy] = useState<any>(null);
  const [investAmount, setInvestAmount] = useState('100');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
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
    const [signalsRes, positionsRes, pendingRes] = await Promise.all([
      supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('positions').select('*').eq('user_id', user.id),
      supabase.from('signals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);
    setSignals(signalsRes.data ?? []);
    setPositions(positionsRes.data ?? []);
    const order: Record<string, number> = { sell: 0, buy: 1, hold: 2 };
    setPendingSignals(
      (pendingRes.data ?? []).sort((a: any, b: any) =>
        (order[a.signal_type] ?? 3) - (order[b.signal_type] ?? 3)
      )
    );
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
      reg.pushManager.getSubscription().then((sub) => { if (sub) setPushEnabled(true); });
    });
  }, []);

  useEffect(() => {
    if (!user || loading) return;
    const signalId = searchParams.get('signal');
    const action = searchParams.get('action');
    if (!signalId) return;
    if (action === 'accept') {
      supabase.from('signals').select('*').eq('id', signalId).single().then(({ data }) => {
        if (data && data.signal_type === 'buy') {
          setAcceptingBuy(data);
          setInvestAmount(String(data.target_price > 0 ? data.target_price : 100));
          router.replace('/dashboard', { scroll: false });
        }
      });
    } else if (action === 'decline') {
      fetch(`/api/signals/${signalId}/decline`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      }).then(() => {
        setPendingSignals((prev) => prev.filter((s) => s.id !== signalId));
        router.replace('/dashboard', { scroll: false });
      });
    }
  }, [user, loading, searchParams, router]);

  const handleBuy = async () => {
    if (!acceptingBuy || !user) return;
    setActionLoading(acceptingBuy.id);
    const res = await fetch(`/api/signals/${acceptingBuy.id}/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, amount: parseFloat(investAmount) }),
    });
    const data = await res.json();
    setActionLoading(null);
    if (res.ok) {
      setAcceptingBuy(null);
      showToast(`Gekauft: ${acceptingBuy.ticker} · ${data.quantity?.toFixed(4)} Anteile`);
      loadData();
    } else {
      showToast(`Fehler: ${data.error}`);
    }
  };

  const handleAccept = async (sig: any) => {
    if (!user) return;
    setActionLoading(sig.id);
    const res = await fetch(`/api/signals/${sig.id}/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    });
    setActionLoading(null);
    if (res.ok) {
      showToast(sig.signal_type === 'sell' ? `${sig.ticker} verkauft & aus Portfolio entfernt.` : `${sig.ticker} · Bestätigt`);
      setPendingSignals((prev) => prev.filter((s) => s.id !== sig.id));
      loadData();
    } else {
      showToast('Fehler beim Verarbeiten.');
    }
  };

  const handleDecline = async (signalId: string) => {
    if (!user) return;
    await fetch(`/api/signals/${signalId}/decline`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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

  const triggerAnalysis = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/cron/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        const count = data.debug?.[0]?.signals?.length ?? 0;
        showToast(count > 0 ? `${count} neue Empfehlung${count !== 1 ? 'en' : ''} gefunden` : 'Analyse abgeschlossen — keine neuen Signale');
        loadData();
      } else {
        showToast('Analyse fehlgeschlagen');
      }
    } catch {
      showToast('Verbindungsfehler');
    }
    setAnalyzing(false);
  };

  const enablePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push nicht unterstützt.');
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), userId: user.id }),
      });
      setPushEnabled(true);
      showToast('Benachrichtigungen aktiviert');
    } catch (err) {
      console.error('Push failed:', err);
    }
  };

  // ── Login ────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="max-w-xs mx-auto px-6 flex flex-col justify-center min-h-screen">
        <div className="mb-10">
          <h1 className="text-2xl font-bold mb-1">Investmentberater</h1>
          <p className="text-sm text-gray-500">KI-gestützter Anlageberater</p>
        </div>
        <div className="space-y-3">
          <input
            type="email" placeholder="E-Mail" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3.5 text-sm focus:border-gray-600 focus:outline-none"
          />
          <input
            type="password" placeholder="Passwort" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3.5 text-sm focus:border-gray-600 focus:outline-none"
          />
          <button
            onClick={handleLogin}
            disabled={authLoading || !email || !password}
            className="w-full bg-white text-black text-sm font-semibold py-3.5 rounded-xl disabled:opacity-40 transition-opacity"
          >
            {authLoading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </div>
        {authError && <p className="text-xs text-red-400 mt-4 text-center">{authError}</p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600 text-sm animate-pulse">Analyse wird geladen…</div>
      </div>
    );
  }

  const totalInvested = positions.reduce((sum, p) => sum + p.buy_price * p.quantity + (p.order_fee ?? 0), 0);
  const totalCurrent = positions.reduce((sum, p) => {
    const q = quotes[p.ticker];
    return sum + (q ? q.price * p.quantity : p.buy_price * p.quantity);
  }, 0);
  const totalProfitPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;
  const totalProfitAbs = totalCurrent - totalInvested;
  const historySignals = signals.filter((s) => s.status !== 'pending');

  return (
    <div className="bg-black min-h-screen text-white">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-4 right-4 z-50 max-w-sm mx-auto">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-sm text-center shadow-2xl">
            {toast}
          </div>
        </div>
      )}

      {/* ── Fixed Header ───────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-black/95 backdrop-blur-sm border-b border-gray-900 relative">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <span className="font-semibold text-base">Investmentberater</span>

          {/* Analyse-Trigger — center */}
          <button
            onClick={triggerAnalysis}
            disabled={analyzing}
            title="Analyse jetzt starten"
            className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              analyzing
                ? 'border-blue-700 text-blue-400 bg-blue-950/40 opacity-80'
                : 'border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300'
            }`}
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={analyzing ? 'animate-spin' : ''}
            >
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {analyzing ? 'Analysiere…' : 'Analysieren'}
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={enablePush}
              title={pushEnabled ? 'Benachrichtigungen aktiv' : 'Benachrichtigungen aktivieren'}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
                pushEnabled ? 'text-emerald-400' : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                {pushEnabled && <circle cx="18" cy="5" r="3" fill="currentColor" stroke="none"/>}
              </svg>
            </button>
            <button
              onClick={() => supabase.auth.signOut().then(() => setUser(null))}
              className="w-9 h-9 flex items-center justify-center rounded-full text-gray-600 hover:text-gray-400 transition-colors"
              title="Abmelden"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Scrollable Content ─────────────────────────────────────────────── */}
      <div className="pt-14 pb-20 max-w-lg mx-auto px-4">

        {/* Portfolio Summary */}
        <div className="grid grid-cols-3 gap-2.5 pt-4 pb-5">
          <div className="bg-gray-900 rounded-2xl px-3 py-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">Investiert</p>
            <p className="text-sm font-semibold mt-1 tabular-nums">
              {totalInvested.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="bg-gray-900 rounded-2xl px-3 py-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">Aktuell</p>
            <p className="text-sm font-semibold mt-1 tabular-nums">
              {totalCurrent.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="bg-gray-900 rounded-2xl px-3 py-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">Rendite</p>
            <p className={`text-sm font-semibold mt-1 tabular-nums ${totalProfitPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalProfitPct >= 0 ? '+' : ''}{totalProfitPct.toFixed(1)}%
            </p>
            {totalInvested > 0 && (
              <p className={`text-[10px] ${totalProfitAbs >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {totalProfitAbs >= 0 ? '+' : ''}{totalProfitAbs.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
              </p>
            )}
          </div>
        </div>

        {/* ── Tab: Heute ───────────────────────────────────────────────────── */}
        {tab === 'today' && (
          <div>
            {pendingSignals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <p className="text-sm text-gray-500">Keine neuen Empfehlungen</p>
                <p className="text-xs text-gray-700 mt-1">Nächste Analyse in wenigen Stunden</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-600 mb-1">{pendingSignals.length} Empfehlung{pendingSignals.length !== 1 ? 'en' : ''} heute</p>
                {pendingSignals.map((sig) => {
                  const cfg = TYPE_CFG[sig.signal_type as keyof typeof TYPE_CFG];
                  const pos = positions.find((p) => p.ticker === sig.ticker);
                  const curPrice = quotes[sig.ticker]?.price ?? sig.current_price;
                  const pnlPct = pos ? ((curPrice - pos.buy_price) / pos.buy_price * 100) : null;
                  const isExpanded = expandedSignal === sig.id;

                  return (
                    <div key={sig.id} className={`${cfg.bg} border ${cfg.border} rounded-2xl overflow-hidden`}>
                      {/* Card header — tap to expand */}
                      <button
                        className="w-full text-left px-4 pt-4 pb-3"
                        onClick={() => setExpandedSignal(isExpanded ? null : sig.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                            <span className="font-semibold text-sm">{sig.ticker}</span>
                            {pnlPct !== null && (
                              <span className={`text-xs font-medium ${pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5">
                            {sig.signal_type === 'buy' && sig.target_price > 0 && (
                              <span className="text-[11px] text-emerald-500 font-medium">{sig.target_price}€</span>
                            )}
                            <span className="text-[11px] text-gray-600">{Math.round(sig.confidence * 100)}%</span>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                              <polyline points="6 9 12 15 18 9"/>
                            </svg>
                          </div>
                        </div>
                        <p className={`text-xs text-gray-400 mt-2 ${isExpanded ? '' : 'line-clamp-2'}`}>
                          {sig.reasoning}
                        </p>
                      </button>

                      {/* Action buttons */}
                      <div className="px-4 pb-4 flex gap-2">
                        {sig.signal_type === 'buy' && (
                          <>
                            <button
                              onClick={() => { setAcceptingBuy(sig); setInvestAmount(String(sig.target_price > 0 ? sig.target_price : 100)); }}
                              className={`flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors ${cfg.btn}`}
                            >
                              Kaufen
                            </button>
                            <button
                              onClick={() => handleDecline(sig.id)}
                              className="flex-1 text-sm font-medium py-2.5 rounded-xl bg-black/30 hover:bg-black/50 text-gray-400 transition-colors"
                            >
                              Ignorieren
                            </button>
                          </>
                        )}
                        {sig.signal_type === 'sell' && (
                          <>
                            <button
                              onClick={() => handleAccept(sig)}
                              disabled={actionLoading === sig.id}
                              className={`flex-1 text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 ${cfg.btn}`}
                            >
                              {actionLoading === sig.id ? '…' : pnlPct !== null ? `Verkaufen (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)` : 'Verkaufen'}
                            </button>
                            <button
                              onClick={() => handleDecline(sig.id)}
                              className="flex-1 text-sm font-medium py-2.5 rounded-xl bg-black/30 hover:bg-black/50 text-gray-400 transition-colors"
                            >
                              Behalten
                            </button>
                          </>
                        )}
                        {sig.signal_type === 'hold' && (
                          <button
                            onClick={() => handleAccept(sig)}
                            disabled={actionLoading === sig.id}
                            className={`w-full text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 ${cfg.btn}`}
                          >
                            {actionLoading === sig.id ? '…' : 'Bestätigt – ich halte weiter'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Verlauf ─────────────────────────────────────────────────── */}
        {tab === 'history' && (
          <div>
            {historySignals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-gray-500">Noch kein Verlauf</p>
                <p className="text-xs text-gray-700 mt-1">Empfehlungen erscheinen hier nach Bearbeitung</p>
              </div>
            ) : (
              <div className="space-y-2">
                {historySignals.map((s) => {
                  const cfg = TYPE_CFG[s.signal_type as keyof typeof TYPE_CFG];
                  const isExpanded = expandedSignal === s.id;
                  return (
                    <div key={s.id} className={`${cfg.bg} border ${cfg.border} rounded-2xl`}>
                      <div className="flex items-start px-4 pt-3 pb-3 gap-3">
                        {/* Main content - tappable */}
                        <button
                          className="flex-1 text-left min-w-0"
                          onClick={() => setExpandedSignal(isExpanded ? null : s.id)}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge} shrink-0`}>
                              {cfg.label}
                            </span>
                            <span className="font-semibold text-sm">{s.ticker}</span>
                            <span className="text-[11px] text-gray-600 ml-auto shrink-0">{timeAgo(s.created_at)}</span>
                          </div>
                          <p className={`text-xs text-gray-500 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                            {s.reasoning}
                          </p>
                          {s.status && s.status !== 'pending' && (
                            <p className="text-[10px] text-gray-700 mt-1.5">
                              {s.status === 'accepted' ? 'Angenommen' : s.status === 'declined' ? 'Ignoriert' : s.status}
                              {s.current_price > 0 && ` · ${s.current_price.toFixed(2)}€`}
                            </p>
                          )}
                        </button>

                        {/* Delete button — large tap target */}
                        <button
                          onClick={() => handleDeleteSignal(s.id)}
                          className="shrink-0 w-8 h-8 -mr-1 flex items-center justify-center rounded-full text-gray-700 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                          title="Löschen"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Portfolio ───────────────────────────────────────────────── */}
        {tab === 'portfolio' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-600">{positions.length} Position{positions.length !== 1 ? 'en' : ''}</p>
              <a href="/portfolio" className="text-xs text-blue-400 hover:text-blue-300 font-medium">Bearbeiten →</a>
            </div>
            {positions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-gray-500">Noch keine Positionen</p>
                <a href="/portfolio" className="text-xs text-blue-400 mt-2">Portfolio aufbauen →</a>
              </div>
            ) : (
              <PortfolioTable positions={positions} quotes={quotes} onSelect={(p) => setSelectedPosition(p)} />
            )}
          </div>
        )}
      </div>

      {/* ── Fixed Bottom Navigation ────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-gray-950/95 backdrop-blur-sm border-t border-gray-900">
        <div className="max-w-lg mx-auto flex">
          {([
            { id: 'today',     label: 'Heute',     badge: pendingSignals.length,
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            },
            { id: 'history',   label: 'Verlauf',   badge: 0,
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            },
            { id: 'portfolio', label: 'Portfolio', badge: 0,
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            },
          ] as const).map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id as Tab)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative ${
                tab === item.id ? 'text-white' : 'text-gray-600'
              }`}
            >
              <div className="relative">
                {item.icon}
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-0.5">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
              {tab === item.id && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-white rounded-full" />
              )}
            </button>
          ))}
        </div>
        <div className="h-safe-bottom" />
      </nav>

      {/* ── Profit Calculator ─────────────────────────────────────────────── */}
      {selectedPosition && (
        <ProfitCalculator
          position={selectedPosition}
          currentPrice={quotes[selectedPosition.ticker]?.price ?? selectedPosition.buy_price}
          onClose={() => setSelectedPosition(null)}
        />
      )}

      {/* ── BUY Modal ─────────────────────────────────────────────────────── */}
      {acceptingBuy && (
        <div className="fixed inset-0 bg-black/85 flex items-end justify-center z-50 p-4">
          <div className="bg-gray-950 border border-gray-800 rounded-3xl w-full max-w-sm pb-safe">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-gray-700" />
            </div>

            <div className="px-5 pb-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-bold text-xl">{acceptingBuy.ticker} kaufen</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Kurs: {acceptingBuy.current_price?.toFixed(2)}€
                    {acceptingBuy.target_price > 0 && (
                      <span className="text-emerald-500 ml-2">· {acceptingBuy.target_price}€ empfohlen</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setAcceptingBuy(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-400"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed mb-5 line-clamp-3">{acceptingBuy.reasoning}</p>

              <div className="mb-5">
                <label className="text-xs text-gray-600 mb-2 block">Investitionsbetrag</label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[50, 100, 150, 200].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setInvestAmount(String(amt))}
                      className={`py-2 text-sm rounded-xl border font-medium transition-colors ${
                        investAmount === String(amt)
                          ? 'border-emerald-600 text-emerald-400 bg-emerald-950/50'
                          : 'border-gray-800 text-gray-500 bg-gray-900 hover:border-gray-700'
                      }`}
                    >
                      {amt}€
                    </button>
                  ))}
                </div>
                <input
                  type="number" min="1" step="10" value={investAmount}
                  onChange={(e) => setInvestAmount(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:border-gray-600 focus:outline-none"
                  placeholder="Eigener Betrag (€)"
                />
                {acceptingBuy.current_price > 0 && parseFloat(investAmount) > 0 && (
                  <p className="text-xs text-gray-600 mt-2">
                    = {(parseFloat(investAmount) / acceptingBuy.current_price).toFixed(4)} Anteile
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleBuy}
                  disabled={actionLoading === acceptingBuy.id || !investAmount || parseFloat(investAmount) <= 0}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold py-3.5 rounded-2xl transition-colors text-sm"
                >
                  {actionLoading === acceptingBuy.id ? 'Wird gekauft…' : `${parseFloat(investAmount) || 0}€ investieren`}
                </button>
                <button
                  onClick={() => { handleDecline(acceptingBuy.id); setAcceptingBuy(null); }}
                  className="px-5 bg-gray-900 hover:bg-gray-800 text-gray-400 font-medium py-3.5 rounded-2xl transition-colors text-sm"
                >
                  Nein
                </button>
              </div>
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
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-gray-600 text-sm animate-pulse">Wird geladen…</div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
