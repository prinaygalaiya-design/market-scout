import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

// Known 3-letter ISO 4217 currency codes — used for forex pair detection.
// Deliberately kept as a small set of the most-traded majors/crosses so that
// 6-letter stock tickers (e.g. "GOOGLA") are not misidentified as forex pairs.
const CURRENCY_CODES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD',
  'HKD', 'SGD', 'SEK', 'NOK', 'DKK', 'MXN', 'ZAR', 'CNY',
  'INR', 'BRL', 'RUB', 'TRY', 'KRW', 'SAR', 'AED', 'THB',
]);

function isForexPair(ticker: string): boolean {
  if (ticker.length !== 6) return false;
  const from = ticker.slice(0, 3).toUpperCase();
  const to = ticker.slice(3, 6).toUpperCase();
  return CURRENCY_CODES.has(from) && CURRENCY_CODES.has(to);
}

export interface StockQuote {
  assetType: 'stock';
  currentPrice: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  companyName: string | null;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  volume: number | null;
  avgVolume: number | null;
  sector: string | null;
  industry: string | null;
}

export interface ForexQuote {
  assetType: 'forex';
  currentRate: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fromCurrency: string;
  toCurrency: string;
}

export type MarketQuote = StockQuote | ForexQuote;

export async function getStockQuote(ticker: string): Promise<StockQuote> {
  const moduleOpts = { validateResult: false } as const;

  const [quote, summary] = await Promise.all([
    yahooFinance.quote(ticker, {}, moduleOpts),
    (yahooFinance.quoteSummary as (s: string, o: any) => Promise<any>)(
      ticker,
      { modules: ['summaryProfile'] }
    ).catch(() => null),
  ]);

  if (!quote || (quote as any).quoteType === 'NONE') {
    throw new Error(`Ticker "${ticker}" not found`);
  }

  const profile = summary?.summaryProfile as any;

  return {
    assetType: 'stock',
    currentPrice: (quote as any).regularMarketPrice ?? null,
    previousClose: (quote as any).regularMarketPreviousClose ?? null,
    change: (quote as any).regularMarketChange ?? null,
    changePercent: (quote as any).regularMarketChangePercent ?? null,
    companyName: (quote as any).longName ?? (quote as any).shortName ?? null,
    marketCap: (quote as any).marketCap ?? null,
    peRatio: (quote as any).trailingPE ?? null,
    eps: (quote as any).epsTrailingTwelveMonths ?? null,
    dividendYield: (quote as any).dividendYield ?? (quote as any).trailingAnnualDividendYield ?? null,
    fiftyTwoWeekHigh: (quote as any).fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: (quote as any).fiftyTwoWeekLow ?? null,
    volume: (quote as any).regularMarketVolume ?? null,
    avgVolume: (quote as any).averageDailyVolume3Month ?? (quote as any).averageDailyVolume10Day ?? null,
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
  };
}

export async function getForexQuote(pair: string): Promise<ForexQuote> {
  // Normalise: strip any existing "=X" suffix, then re-add it
  const clean = pair.replace(/=X$/i, '').toUpperCase();
  const yahooSymbol = `${clean}=X`;

  const from = clean.slice(0, 3);
  const to = clean.slice(3, 6);

  const quote = await yahooFinance.quote(yahooSymbol, {}, { validateResult: false });

  if (!quote) {
    throw new Error(`Forex pair "${pair}" not found`);
  }

  return {
    assetType: 'forex',
    currentRate: (quote as any).regularMarketPrice ?? null,
    previousClose: (quote as any).regularMarketPreviousClose ?? null,
    change: (quote as any).regularMarketChange ?? null,
    changePercent: (quote as any).regularMarketChangePercent ?? null,
    fiftyTwoWeekHigh: (quote as any).fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: (quote as any).fiftyTwoWeekLow ?? null,
    fromCurrency: from,
    toCurrency: to,
  };
}

export async function getQuote(ticker: string): Promise<MarketQuote> {
  const upper = ticker.toUpperCase().replace(/=X$/i, '');
  if (isForexPair(upper)) {
    return getForexQuote(upper);
  }
  return getStockQuote(ticker);
}
