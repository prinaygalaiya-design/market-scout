const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 12000;
const THINKING_BUDGET = 8000;

async function callClaude(system: string, user: string): Promise<any> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }

  const data = await res.json();

  // Extended thinking returns an array: [thinkingBlock, textBlock].
  // We only care about the text block.
  const textBlock = (data.content as any[])?.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('No text block found in Anthropic response');
  }

  // Strip any accidental markdown fences before parsing
  const raw = textBlock.text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Stage 1 — Bull Analyst
// ---------------------------------------------------------------------------
async function runBullCase(quote: any, ticker: string, horizon: string): Promise<any> {
  const system =
    'You are a contrarian bull analyst known for finding genuine upside that the market ' +
    'has missed. Your job is not to be optimistic — it is to find the strongest ' +
    'evidence-based case for this asset going up over the specified horizon. Cite specific ' +
    'numbers from the data. Avoid generic statements. If the data is weak, say so but still ' +
    'make the best case possible.';

  const user =
    `Analyse the following market data for ${ticker} over a ${horizon} horizon.\n\n` +
    `Quote data:\n${JSON.stringify(quote, null, 2)}\n\n` +
    `Build the strongest possible bullish case using the specific numbers above.\n` +
    `Respond with a raw JSON object only. No markdown, no code fences, no explanation outside the JSON.\n\n` +
    `Return a JSON object with exactly these keys:\n` +
    `- arguments: array of 3-5 specific bullish arguments, each citing actual data points from the quote\n` +
    `- catalysts: array of upcoming or existing catalysts that could drive the move\n` +
    `- target: a specific price/rate target with a brief rationale (string)\n` +
    `- confidence: integer 1-10`;

  return callClaude(system, user);
}

// ---------------------------------------------------------------------------
// Stage 2 — Bear Analyst
// ---------------------------------------------------------------------------
async function runBearCase(
  quote: any,
  ticker: string,
  horizon: string,
  bullCase: any
): Promise<any> {
  const system =
    'You are a short-seller\'s analyst. You have just read the bull case and your job is to ' +
    'systematically dismantle it while building the strongest possible bearish case using the ' +
    'actual data. Be specific. Point out what the bull analyst ignored or glossed over. Do not ' +
    'be contrarian for its own sake — only make arguments the data actually supports.';

  const user =
    `Analyse the following market data for ${ticker} over a ${horizon} horizon.\n\n` +
    `Quote data:\n${JSON.stringify(quote, null, 2)}\n\n` +
    `Bull analyst's case:\n${JSON.stringify(bullCase, null, 2)}\n\n` +
    `Build the strongest possible bearish case and expose the weaknesses in the bull argument.\n` +
    `Respond with a raw JSON object only. No markdown, no code fences, no explanation outside the JSON.\n\n` +
    `Return a JSON object with exactly these keys:\n` +
    `- arguments: array of 3-5 specific bearish arguments citing actual data points\n` +
    `- risks: array of concrete downside risks\n` +
    `- bullCaseWeaknesses: array of 2-3 specific flaws in the bull analyst's argument\n` +
    `- target: a specific price/rate target with brief rationale (string)\n` +
    `- confidence: integer 1-10`;

  return callClaude(system, user);
}

// ---------------------------------------------------------------------------
// Stage 3 — Risk Analyst
// ---------------------------------------------------------------------------
async function runRiskAnalysis(
  quote: any,
  ticker: string,
  horizon: string,
  bullCase: any,
  bearCase: any
): Promise<any> {
  const system =
    'You are a risk manager who has seen both the bull and bear case. Your job is not to pick ' +
    'a side — it is to find what both analysts got wrong or failed to consider. You are ' +
    'specifically looking for: overconfidence, missing context, ignored macro factors, and the ' +
    'single most dangerous unknown. Be sharp and specific.';

  const user =
    `Evaluate the analyst debate for ${ticker} over a ${horizon} horizon.\n\n` +
    `Quote data:\n${JSON.stringify(quote, null, 2)}\n\n` +
    `Bull case:\n${JSON.stringify(bullCase, null, 2)}\n\n` +
    `Bear case:\n${JSON.stringify(bearCase, null, 2)}\n\n` +
    `Identify the blind spots and risks both analysts missed.\n` +
    `Respond with a raw JSON object only. No markdown, no code fences, no explanation outside the JSON.\n\n` +
    `Return a JSON object with exactly these keys:\n` +
    `- bullFlaws: array of 2-3 specific weaknesses in the bull case\n` +
    `- bearFlaws: array of 2-3 specific weaknesses in the bear case\n` +
    `- missedFactors: array of 1-2 important factors neither analyst addressed\n` +
    `- wildcard: a single sentence describing the biggest unpredictable risk`;

  return callClaude(system, user);
}

// ---------------------------------------------------------------------------
// Stage 4 — Portfolio Manager
// ---------------------------------------------------------------------------
async function runVerdict(
  quote: any,
  ticker: string,
  horizon: string,
  bullCase: any,
  bearCase: any,
  riskAnalysis: any
): Promise<any> {
  const system =
    'You are a senior portfolio manager who has reviewed a full analyst debate. You must give ' +
    'a decisive, actionable verdict. You are not allowed to hedge or say "it depends" — pick a ' +
    'clear direction. Your reputation is on the line. Justify your verdict by referencing ' +
    'specific points from the debate.';

  const user =
    `Give your final verdict on ${ticker} over a ${horizon} horizon.\n\n` +
    `Quote data:\n${JSON.stringify(quote, null, 2)}\n\n` +
    `Bull case:\n${JSON.stringify(bullCase, null, 2)}\n\n` +
    `Bear case:\n${JSON.stringify(bearCase, null, 2)}\n\n` +
    `Risk analysis:\n${JSON.stringify(riskAnalysis, null, 2)}\n\n` +
    `Deliver a decisive, actionable verdict referencing specific points from the debate above.\n` +
    `Respond with a raw JSON object only. No markdown, no code fences, no explanation outside the JSON.\n\n` +
    `Return a JSON object with exactly these keys:\n` +
    `- verdict: exactly one of: BULLISH, BEARISH, NEUTRAL\n` +
    `- confidence: integer 0-100\n` +
    `- action: exactly one of: BUY, SELL, HOLD, WATCH\n` +
    `- summary: exactly 2 sentences in plain English — what is the call and why\n` +
    `- keyLevels: array of 2-3 objects, each with { label: string, level: number | string }\n` +
    `- decidingFactor: one sentence — the single argument from the debate that most influenced your verdict`;

  return callClaude(system, user);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export interface DebateResult {
  ticker: string;
  horizon: string;
  bullCase: any;
  bearCase: any;
  riskAnalysis: any;
  verdict: any;
}

export async function analyseMarket(
  quote: any,
  ticker: string,
  horizon: string
): Promise<DebateResult> {
  let bullCase: any;
  try {
    bullCase = await runBullCase(quote, ticker, horizon);
  } catch (err) {
    throw new Error(`Stage 1 (Bull Analyst) failed: ${(err as Error).message}`);
  }

  let bearCase: any;
  try {
    bearCase = await runBearCase(quote, ticker, horizon, bullCase);
  } catch (err) {
    throw new Error(`Stage 2 (Bear Analyst) failed: ${(err as Error).message}`);
  }

  let riskAnalysis: any;
  try {
    riskAnalysis = await runRiskAnalysis(quote, ticker, horizon, bullCase, bearCase);
  } catch (err) {
    throw new Error(`Stage 3 (Risk Analyst) failed: ${(err as Error).message}`);
  }

  let verdict: any;
  try {
    verdict = await runVerdict(quote, ticker, horizon, bullCase, bearCase, riskAnalysis);
  } catch (err) {
    throw new Error(`Stage 4 (Portfolio Manager) failed: ${(err as Error).message}`);
  }

  return { ticker, horizon, bullCase, bearCase, riskAnalysis, verdict };
}
