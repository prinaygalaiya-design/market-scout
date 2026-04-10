'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatTimeAgo } from '@/lib/utils';

type Horizon = '1 day' | '1 week' | '1 month';

interface WatchlistItem {
  id: number;
  ticker: string;
  asset_type: 'stock' | 'forex';
  display_name: string | null;
  added_at: string;
}

interface PredictionRow {
  id: number;
  ticker: string;
  verdict: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  action: 'BUY' | 'SELL' | 'HOLD' | 'WATCH';
  confidence: number;
  horizon: string;
  created_at: string;
  correct: boolean | null;
}

const HORIZONS: Horizon[] = ['1 day', '1 week', '1 month'];

function verdictClasses(v: string) {
  if (v === 'BULLISH') return 'text-emerald-400';
  if (v === 'BEARISH') return 'text-red-400';
  return 'text-slate-400';
}

function actionBadgeClasses(a: string) {
  if (a === 'BUY') return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  if (a === 'SELL') return 'bg-red-500/10 text-red-400 border border-red-500/20';
  if (a === 'HOLD') return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
}

function assetBadgeClasses(t: string) {
  return t === 'forex'
    ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
}

export default function HomePage() {
  const router = useRouter();
  const [ticker, setTicker] = useState('');
  const [horizon, setHorizon] = useState<Horizon>('1 day');
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [predictionsLoading, setPredictionsLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlist');
      if (res.ok) setWatchlist(await res.json());
    } catch {
      // silently fail — show empty state
    } finally {
      setWatchlistLoading(false);
    }
  }, []);

  const fetchPredictions = useCallback(async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) setPredictions(await res.json());
    } catch {
      // silently fail
    } finally {
      setPredictionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatchlist();
    fetchPredictions();
  }, [fetchWatchlist, fetchPredictions]);

  const handleAnalyse = () => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    router.push(`/analysis/${t}?${new URLSearchParams({ horizon })}`);
  };

  const handleRemove = async (t: string) => {
    setRemoving(t);
    try {
      await fetch(`/api/watchlist?ticker=${encodeURIComponent(t)}`, { method: 'DELETE' });
      setWatchlist((prev) => prev.filter((w) => w.ticker !== t));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <main className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-12">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Market Scout
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
                <circle cx="5" cy="5" r="4" opacity="0.4" />
                <circle cx="5" cy="5" r="2.5" />
              </svg>
              Powered by Claude
            </span>
          </div>
          <p className="text-slate-400 text-base">
            AI-powered market analysis with extended thinking
          </p>
        </header>

        {/* ── Search ─────────────────────────────────────────────────── */}
        <section
          className="bg-[#0d1525] border border-white/[.08] rounded-2xl p-8"
          aria-label="Market analysis search"
        >
          <div className="flex gap-3">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyse()}
              placeholder="Enter ticker — AAPL, TSLA, EURUSD..."
              className="flex-1 bg-[#111827] border border-white/[.08] rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-sm"
              aria-label="Ticker symbol"
            />
            <button
              onClick={handleAnalyse}
              disabled={!ticker.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all active:scale-95 text-sm cursor-pointer"
            >
              Analyse
            </button>
          </div>

          {/* Horizon selector */}
          <div className="flex items-center gap-2 mt-4">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider mr-1">
              Horizon
            </span>
            {HORIZONS.map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  horizon === h
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/[.04] hover:bg-white/[.08] text-slate-400 border border-white/[.06]'
                }`}
              >
                {h}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs text-slate-600">
            Stocks: AAPL, NVDA, TSLA &nbsp;·&nbsp; Forex: EURUSD, GBPUSD, USDJPY
          </p>
        </section>

        {/* ── Watchlist ──────────────────────────────────────────────── */}
        <section className="mt-10" aria-label="Watchlist">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Watchlist</h2>

          {watchlistLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-28 bg-[#0d1525] border border-white/[.06] rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : watchlist.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 bg-[#0d1525] border border-white/[.06] rounded-xl">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-slate-700 mb-3"
                aria-hidden
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <p className="text-slate-600 text-sm">No tickers yet — analyse one to add it</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {watchlist.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#0d1525] border border-white/[.08] hover:border-white/[.14] rounded-xl p-5 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-[family-name:var(--font-geist-mono)] font-bold text-slate-100 text-base tabular">
                        {item.ticker}
                      </span>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${assetBadgeClasses(item.asset_type)}`}
                      >
                        {item.asset_type}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemove(item.ticker)}
                      disabled={removing === item.ticker}
                      aria-label={`Remove ${item.ticker} from watchlist`}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/[.06] transition-all cursor-pointer disabled:opacity-40"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M2 2l10 10M12 2L2 12" />
                      </svg>
                    </button>
                  </div>

                  {item.display_name && (
                    <p className="text-slate-500 text-xs mt-1 truncate">{item.display_name}</p>
                  )}

                  <button
                    onClick={() =>
                      router.push(`/analysis/${item.ticker}?${new URLSearchParams({ horizon: '1 day' })}`)
                    }
                    className="mt-4 w-full py-1.5 bg-white/[.04] hover:bg-white/[.08] border border-white/[.06] hover:border-blue-500/30 text-slate-300 hover:text-blue-400 text-sm font-medium rounded-lg transition-all cursor-pointer"
                  >
                    Analyse →
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Recent Predictions ─────────────────────────────────────── */}
        <section className="mt-10 mb-16" aria-label="Recent predictions">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Recent Predictions</h2>

          {predictionsLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 bg-[#0d1525] border border-white/[.06] rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : predictions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 bg-[#0d1525] border border-white/[.06] rounded-xl">
              <p className="text-slate-600 text-sm">No predictions yet</p>
            </div>
          ) : (
            <div className="bg-[#0d1525] border border-white/[.08] rounded-xl overflow-hidden">
              <table className="w-full text-sm" aria-label="Recent predictions table">
                <thead>
                  <tr className="border-b border-white/[.06]">
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Ticker</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Verdict</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden sm:table-cell">Action</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Confidence</th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Horizon</th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[.04]">
                  {predictions.slice(0, 10).map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/analysis/${p.ticker}`)}
                      className="hover:bg-white/[.02] cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-[family-name:var(--font-geist-mono)] font-semibold text-slate-100 tabular">
                          {p.ticker}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`font-semibold text-xs ${verdictClasses(p.verdict)}`}>
                          {p.verdict}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${actionBadgeClasses(p.action)}`}>
                          {p.action}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <span className="font-[family-name:var(--font-geist-mono)] text-slate-300 tabular">
                          {p.confidence}%
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <span className="text-slate-400">{p.horizon}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-slate-600 text-xs tabular">{formatTimeAgo(p.created_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
