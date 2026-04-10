export function formatPrice(n: number | null | undefined, isForex = false): string {
  if (n == null) return '—';
  if (isForex) return n.toFixed(4);
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatChange(n: number | null | undefined, isForex = false): string {
  if (n == null) return '—';
  const formatted = isForex ? n.toFixed(4) : n.toFixed(2);
  return n >= 0 ? `+${formatted}` : formatted;
}

export function formatChangePercent(n: number | null | undefined): string {
  if (n == null) return '—';
  const formatted = Math.abs(n).toFixed(2);
  return n >= 0 ? `+${formatted}%` : `-${formatted}%`;
}

export function formatMarketCap(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export function formatVolume(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

export function formatTimeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
