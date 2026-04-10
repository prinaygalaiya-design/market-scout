'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  formatPrice,
  formatChange,
  formatChangePercent,
  formatMarketCap,
  formatVolume,
} from '@/lib/utils';

type Horizon = '1 day' | '1 week' | '1 month';
const HORIZONS: Horizon[] = ['1 day', '1 week', '1 month'];

const STAGES = [
  { emoji: '🐂', label: 'Bull analyst building the case...' },
  { emoji: '🐻', label: 'Bear analyst challenging the thesis...' },
  { emoji: '⚠️', label: 'Risk analyst stress-testing both sides...' },
  { emoji: '🎯', label: 'Portfolio manager delivering the verdict...' },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function verdictBg(v: string) {
  if (v === 'BULLISH') return 'bg-emerald-500/[.08] border-emerald-500/30';
  if (v === 'BEARISH') return 'bg-red-500/[.08] border-red-500/30';
  return 'bg-slate-500/[.08] border-slate-500/30';
}
function verdictText(v: string) {
  if (v === 'BULLISH') return 'text-emerald-400';
  if (v === 'BEARISH') return 'text-red-400';
  return 'text-slate-400';
}
function verdictBar(v: string) {
  if (v === 'BULLISH') return 'bg-emerald-500';
  if (v === 'BEARISH') return 'bg-red-500';
  return 'bg-slate-500';
}
function actionBadge(a: string) {
  if (a === 'BUY') return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  if (a === 'SELL') return 'bg-red-500/10 text-red-400 border border-red-500/20';
  if (a === 'HOLD') return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
}
function assetBadge(t: string) {
  return t === 'forex'
    ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
}
function changeColor(n: number | null | undefined) {
  if (n == null) return 'text-slate-400';
  return n >= 0 ? 'text-emerald-400' : 'text-red-400';
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function QuoteSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="h-9 w-36 bg-white/[.06] rounded-lg mb-2" />
          <div className="h-5 w-20 bg-white/[.04] rounded-lg" />
        </div>
        <div className="text-right">
          <div className="h-8 w-28 bg-white/[.06] rounded-lg mb-2" />
          <div className="h-5 w-24 bg-white/[.04] rounded-lg ml-auto" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-white/[.04] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#111827] border border-white/[.06] rounded-xl px-4 py-3">
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="font-[family-name:var(--font-geist-mono)] text-sm font-semibold text-slate-200 tabular truncate">
        {value}
      </p>
    </div>
  );
}

interface DebateCardProps {
  id: string;
  emoji: string;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}
function DebateCard({ id, emoji, title, expanded, onToggle, children }: DebateCardProps) {
  return (
    <div className="bg-[#0d1525] border border-white/[.08] rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`debate-${id}`}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[.02] transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2.5 font-semibold text-slate-200 text-sm">
          <span aria-hidden>{emoji}</span>
          {title}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {expanded && (
        <div id={`debate-${id}`} className="px-6 pb-6 border-t border-white/[.06]">
          {children}
        </div>
      )}
    </div>
  );
}

function BulletList({ items, color = 'slate' }: { items: string[]; color?: string }) {
  const dot =
    color === 'emerald'
      ? 'bg-emerald-500'
      : color === 'red'
        ? 'bg-red-500'
        : color === 'amber'
          ? 'bg-amber-500'
          : 'bg-slate-600';
  return (
    <ul className="space-y-2 mt-3">
      {items?.map((item: string, i: number) => (
        <li key={i} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
          <span className={`mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-5 mb-1">
      {children}
    </p>
  );
}

/* ── Main content ────────────────────────────────────────────────────────── */

function AnalysisContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const ticker = decodeURIComponent(params.ticker as string).toUpperCase();
  const initialHorizon = (searchParams.get('horizon') ?? '1 day') as Horizon;

  const [horizon, setHorizon] = useState<Horizon>(
    HORIZONS.includes(initialHorizon) ? initialHorizon : '1 day'
  );
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [barWidth, setBarWidth] = useState(0);
  const [watchlistStatus, setWatchlistStatus] = useState<'idle' | 'adding' | 'added' | 'exists'>('idle');

  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch quote on mount
  useEffect(() => {
    const fetchQuote = async () => {
      setQuoteLoading(true);
      setQuoteError(null);
      try {
        const res = await fetch(`/api/quote?ticker=${encodeURIComponent(ticker)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to fetch quote');
        setQuote(data);
      } catch (err) {
        setQuoteError((err as Error).message);
      } finally {
        setQuoteLoading(false);
      }
    };
    fetchQuote();
  }, [ticker]);

  // Animate confidence bar when result arrives
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setBarWidth(result.prediction.confidence), 120);
    return () => clearTimeout(t);
  }, [result]);

  const toggleCard = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const runAnalysis = useCallback(async () => {
    if (analysisLoading) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    setResult(null);
    setBarWidth(0);
    setLoadingStage(0);

    // Advance stage indicator every 2.5s for UX feedback
    stageTimer.current = setInterval(() => {
      setLoadingStage((prev) => Math.min(prev + 1, STAGES.length - 1));
    }, 2500);

    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, horizon }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed');
      setResult(data);
    } catch (err) {
      setAnalysisError((err as Error).message);
    } finally {
      if (stageTimer.current) clearInterval(stageTimer.current);
      setAnalysisLoading(false);
    }
  }, [ticker, horizon, analysisLoading]);

  const addToWatchlist = async () => {
    if (!quote || watchlistStatus === 'adding' || watchlistStatus === 'added') return;
    setWatchlistStatus('adding');
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          assetType: quote.assetType,
          displayName:
            quote.assetType === 'stock' ? (quote.companyName ?? ticker) : ticker,
        }),
      });
      setWatchlistStatus(res.status === 409 ? 'exists' : 'added');
    } catch {
      setWatchlistStatus('idle');
    }
  };

  const isForex = quote?.assetType === 'forex';
  const currentPrice = isForex ? quote?.currentRate : quote?.currentPrice;

  return (
    <main className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* ── Top bar ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/')}
            aria-label="Back to home"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/[.04] hover:bg-white/[.08] border border-white/[.06] text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M10 12L6 8l4-4" />
            </svg>
          </button>
          <div className="flex items-center gap-2.5">
            <h1 className="font-[family-name:var(--font-geist-mono)] text-2xl font-bold text-slate-100 tabular">
              {ticker}
            </h1>
            {quote && (
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${assetBadge(quote.assetType)}`}>
                {quote.assetType}
              </span>
            )}
          </div>
        </div>

        {/* ── Quote panel ───────────────────────────────────────────── */}
        <section
          className="bg-[#0d1525] border border-white/[.08] rounded-2xl p-6 mb-6"
          aria-label="Current quote"
        >
          {quoteLoading ? (
            <QuoteSkeleton />
          ) : quoteError ? (
            <div className="flex items-center gap-3 py-4">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400" aria-hidden>
                <circle cx="10" cy="10" r="8" />
                <path d="M10 7v3M10 13h.01" />
              </svg>
              <p className="text-red-400 text-sm">{quoteError}</p>
            </div>
          ) : quote && (
            <>
              {/* Price row */}
              <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
                <div>
                  {quote.assetType === 'stock' && quote.companyName && (
                    <p className="text-slate-400 text-sm mb-1 truncate max-w-xs">{quote.companyName}</p>
                  )}
                  {quote.assetType === 'forex' && (
                    <p className="text-slate-400 text-sm mb-1">
                      {quote.fromCurrency} / {quote.toCurrency}
                    </p>
                  )}
                  <p className="font-[family-name:var(--font-geist-mono)] text-3xl font-bold text-slate-100 tabular">
                    {formatPrice(currentPrice, isForex)}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-[family-name:var(--font-geist-mono)] text-lg font-semibold tabular ${changeColor(quote.change)}`}>
                    {formatChange(quote.change, isForex)}
                  </p>
                  <p className={`font-[family-name:var(--font-geist-mono)] text-sm tabular ${changeColor(quote.changePercent)}`}>
                    {formatChangePercent(quote.changePercent)}
                  </p>
                </div>
              </div>

              {/* Stats grid */}
              {quote.assetType === 'stock' ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatPill label="Market Cap" value={formatMarketCap(quote.marketCap)} />
                  <StatPill label="P/E Ratio" value={quote.peRatio != null ? quote.peRatio.toFixed(2) : '—'} />
                  <StatPill label="EPS" value={quote.eps != null ? `$${quote.eps.toFixed(2)}` : '—'} />
                  <StatPill
                    label="52w Range"
                    value={
                      quote.fiftyTwoWeekLow != null && quote.fiftyTwoWeekHigh != null
                        ? `$${quote.fiftyTwoWeekLow.toFixed(0)} – $${quote.fiftyTwoWeekHigh.toFixed(0)}`
                        : '—'
                    }
                  />
                  <StatPill label="Volume" value={formatVolume(quote.volume)} />
                  <StatPill label="Avg Volume" value={formatVolume(quote.avgVolume)} />
                  {quote.sector && <StatPill label="Sector" value={quote.sector} />}
                  {quote.dividendYield != null && (
                    <StatPill label="Div Yield" value={`${(quote.dividendYield * 100).toFixed(2)}%`} />
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <StatPill
                    label="52w High"
                    value={quote.fiftyTwoWeekHigh != null ? quote.fiftyTwoWeekHigh.toFixed(4) : '—'}
                  />
                  <StatPill
                    label="52w Low"
                    value={quote.fiftyTwoWeekLow != null ? quote.fiftyTwoWeekLow.toFixed(4) : '—'}
                  />
                  <StatPill label="Prev Close" value={quote.previousClose != null ? quote.previousClose.toFixed(4) : '—'} />
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Controls ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
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

        <button
          onClick={runAnalysis}
          disabled={analysisLoading || quoteLoading || !!quoteError}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all active:scale-[.99] text-base cursor-pointer mb-8"
        >
          {analysisLoading ? 'Running analysis...' : result ? 'Re-run Analysis' : 'Run Analysis'}
        </button>

        {/* ── Loading indicator ──────────────────────────────────────── */}
        {analysisLoading && (
          <div
            className="bg-[#0d1525] border border-white/[.08] rounded-2xl p-6 mb-8"
            role="status"
            aria-live="polite"
            aria-label="Analysis in progress"
          >
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-5">
              Analysis in progress
            </p>
            <div className="space-y-4">
              {STAGES.map((stage, i) => {
                const isActive = i === loadingStage;
                const isDone = i < loadingStage;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 transition-all duration-300 ${
                      isDone
                        ? 'opacity-40'
                        : isActive
                          ? 'opacity-100'
                          : 'opacity-20'
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                        isDone
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : isActive
                            ? 'bg-blue-500/10 border border-blue-500/30'
                            : 'bg-white/[.03] border border-white/[.06]'
                      }`}
                      aria-hidden
                    >
                      {isDone ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                          <path d="M2.5 7l3 3 6-6" />
                        </svg>
                      ) : (
                        <span>{stage.emoji}</span>
                      )}
                    </div>
                    <p
                      className={`text-sm font-medium ${
                        isActive ? 'text-blue-300' : isDone ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                    >
                      {isDone ? stage.label.replace('...', '') : stage.label}
                    </p>
                    {isActive && (
                      <span className="ml-auto flex gap-1" aria-hidden>
                        {[0, 1, 2].map((j) => (
                          <span
                            key={j}
                            className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                            style={{ animationDelay: `${j * 150}ms` }}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────── */}
        {analysisError && !analysisLoading && (
          <div className="bg-red-500/[.06] border border-red-500/20 rounded-xl px-5 py-4 mb-8 flex items-start gap-3">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400 mt-0.5 flex-shrink-0" aria-hidden>
              <circle cx="9" cy="9" r="7" />
              <path d="M9 6v3M9 12h.01" />
            </svg>
            <p className="text-red-400 text-sm">{analysisError}</p>
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────────── */}
        {result && !analysisLoading && (
          <div className="space-y-5">

            {/* Verdict banner */}
            <div
              className={`rounded-2xl border p-6 ${verdictBg(result.prediction.verdict)}`}
              role="region"
              aria-label="Analysis verdict"
            >
              <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <span className={`text-4xl font-bold tracking-tight ${verdictText(result.prediction.verdict)}`}>
                    {result.prediction.verdict}
                  </span>
                  <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${actionBadge(result.prediction.action)}`}>
                    {result.prediction.action}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-0.5">
                    Conviction
                  </p>
                  <p className={`font-[family-name:var(--font-geist-mono)] text-2xl font-bold tabular ${verdictText(result.prediction.verdict)}`}>
                    {result.prediction.confidence}%
                  </p>
                </div>
              </div>

              {/* Confidence bar */}
              <div className="mb-5">
                <div className="h-1.5 bg-white/[.08] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${verdictBar(result.prediction.verdict)}`}
                    style={{ width: `${barWidth}%` }}
                    role="progressbar"
                    aria-valuenow={result.prediction.confidence}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Conviction: ${result.prediction.confidence}%`}
                  />
                </div>
              </div>

              {/* Summary */}
              {result.prediction.summary && (
                <p className="text-slate-300 text-sm leading-relaxed mb-3">
                  {result.prediction.summary}
                </p>
              )}

              {/* Deciding factor */}
              {result.prediction.decidingFactor && (
                <p className="text-slate-500 text-sm italic">
                  <span className="not-italic font-medium text-slate-400">Deciding factor: </span>
                  {result.prediction.decidingFactor}
                </p>
              )}
            </div>

            {/* Key levels */}
            {result.prediction.keyLevels?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
                  Key Levels to Watch
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.prediction.keyLevels.map((kl: { label: string; level: number | string }, i: number) => (
                    <div
                      key={i}
                      className="bg-[#0d1525] border border-white/[.08] rounded-xl px-4 py-3 flex items-center gap-3"
                    >
                      <span className="text-xs text-slate-500 font-medium">{kl.label}</span>
                      <span className="font-[family-name:var(--font-geist-mono)] text-sm font-semibold text-slate-200 tabular">
                        {kl.level}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Debate cards */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Full Debate
              </p>

              <DebateCard
                id="bull"
                emoji="🐂"
                title="Bull Case"
                expanded={expanded.has('bull')}
                onToggle={() => toggleCard('bull')}
              >
                {result.debate.bullCase.arguments?.length > 0 && (
                  <>
                    <SectionLabel>Arguments</SectionLabel>
                    <BulletList items={result.debate.bullCase.arguments} color="emerald" />
                  </>
                )}
                {result.debate.bullCase.catalysts?.length > 0 && (
                  <>
                    <SectionLabel>Catalysts</SectionLabel>
                    <BulletList items={result.debate.bullCase.catalysts} color="emerald" />
                  </>
                )}
                {result.debate.bullCase.target && (
                  <div className="mt-4 flex items-center gap-3">
                    <span className="text-xs text-slate-500 uppercase tracking-wider">Target</span>
                    <span className="font-[family-name:var(--font-geist-mono)] text-emerald-400 font-semibold tabular">
                      {result.debate.bullCase.target}
                    </span>
                    <span className="ml-auto bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                      {result.debate.bullCase.confidence}/10
                    </span>
                  </div>
                )}
              </DebateCard>

              <DebateCard
                id="bear"
                emoji="🐻"
                title="Bear Case"
                expanded={expanded.has('bear')}
                onToggle={() => toggleCard('bear')}
              >
                {result.debate.bearCase.arguments?.length > 0 && (
                  <>
                    <SectionLabel>Arguments</SectionLabel>
                    <BulletList items={result.debate.bearCase.arguments} color="red" />
                  </>
                )}
                {result.debate.bearCase.risks?.length > 0 && (
                  <>
                    <SectionLabel>Downside Risks</SectionLabel>
                    <BulletList items={result.debate.bearCase.risks} color="red" />
                  </>
                )}
                {result.debate.bearCase.bullCaseWeaknesses?.length > 0 && (
                  <>
                    <SectionLabel>Bull Case Weaknesses</SectionLabel>
                    <BulletList items={result.debate.bearCase.bullCaseWeaknesses} color="amber" />
                  </>
                )}
                {result.debate.bearCase.target && (
                  <div className="mt-4 flex items-center gap-3">
                    <span className="text-xs text-slate-500 uppercase tracking-wider">Target</span>
                    <span className="font-[family-name:var(--font-geist-mono)] text-red-400 font-semibold tabular">
                      {result.debate.bearCase.target}
                    </span>
                    <span className="ml-auto bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                      {result.debate.bearCase.confidence}/10
                    </span>
                  </div>
                )}
              </DebateCard>

              <DebateCard
                id="risk"
                emoji="⚠️"
                title="Risk Analysis"
                expanded={expanded.has('risk')}
                onToggle={() => toggleCard('risk')}
              >
                {result.debate.riskAnalysis.bullFlaws?.length > 0 && (
                  <>
                    <SectionLabel>Bull Case Flaws</SectionLabel>
                    <BulletList items={result.debate.riskAnalysis.bullFlaws} color="amber" />
                  </>
                )}
                {result.debate.riskAnalysis.bearFlaws?.length > 0 && (
                  <>
                    <SectionLabel>Bear Case Flaws</SectionLabel>
                    <BulletList items={result.debate.riskAnalysis.bearFlaws} color="amber" />
                  </>
                )}
                {result.debate.riskAnalysis.missedFactors?.length > 0 && (
                  <>
                    <SectionLabel>Missed Factors</SectionLabel>
                    <BulletList items={result.debate.riskAnalysis.missedFactors} />
                  </>
                )}
                {result.debate.riskAnalysis.wildcard && (
                  <div className="mt-5 bg-amber-500/[.06] border border-amber-500/20 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-semibold text-amber-500/80 uppercase tracking-widest mb-1">
                      Wildcard Risk
                    </p>
                    <p className="text-sm text-amber-300 leading-relaxed">
                      {result.debate.riskAnalysis.wildcard}
                    </p>
                  </div>
                )}
              </DebateCard>
            </div>

            {/* Add to watchlist */}
            <div className="pt-2 pb-8">
              <button
                onClick={addToWatchlist}
                disabled={watchlistStatus === 'adding' || watchlistStatus === 'added'}
                className={`w-full py-3 rounded-xl border font-semibold text-sm transition-all cursor-pointer ${
                  watchlistStatus === 'added'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 cursor-default'
                    : watchlistStatus === 'exists'
                      ? 'bg-white/[.03] border-white/[.08] text-slate-500 cursor-default'
                      : 'bg-white/[.04] hover:bg-white/[.07] border-white/[.08] hover:border-blue-500/30 text-slate-300 hover:text-blue-400 active:scale-[.99]'
                }`}
              >
                {watchlistStatus === 'added'
                  ? '✓ Added to watchlist'
                  : watchlistStatus === 'exists'
                    ? 'Already in watchlist'
                    : watchlistStatus === 'adding'
                      ? 'Adding...'
                      : '+ Add to Watchlist'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/* ── Page export (Suspense required for useSearchParams) ─────────────────── */

export default function AnalysisPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <div className="flex gap-1.5" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </main>
      }
    >
      <AnalysisContent />
    </Suspense>
  );
}
