/**
 * Runs the six-advisor Scout Council in parallel.
 *
 * Unlike the debate engine (claude-debate.ts), which runs four stages
 * sequentially because each stage depends on the previous one's output,
 * the council advisors are independent — each brings a different lens to the
 * same prediction data. There is no dependency chain, so firing them in
 * parallel cuts wall-clock time from ~6× to ~1× a single Claude call.
 */

import { ADVISORS, type AdvisorId } from './advisors';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Mirrors the DB row shape returned by the market_predictions SELECT in the
 * scout route. The scout route types these as `any[]`; this is the canonical
 * definition for the council layer.
 */
export interface Prediction {
  id: number;
  ticker: string;
  asset_type: string;
  verdict: string;
  confidence: number;
  action: string;
  summary: string | null;
  /** JSON-encoded: { decidingFactor?: string; keyLevels?: { label: string; level: string | number }[] } */
  verdict_detail: string | null;
  /** JSON-encoded: { summary?: string } */
  bull_case: string | null;
  /** JSON-encoded: { summary?: string } */
  bear_case: string | null;
  created_at: string;
}

export interface AdvisorResponse {
  advisorId: AdvisorId;
  displayName: string;
  response: string;
  failed: boolean;
}

// ── Anthropic config (matches claude-debate.ts and the scout route exactly) ───

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 12000;
const THINKING_BUDGET = 8000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPredictionSummary(predictions: Prediction[]): string {
  return predictions.map(pred => {
    let verdictDetail: { decidingFactor?: string; keyLevels?: { label: string; level: string | number }[] } = {};
    try { verdictDetail = JSON.parse(pred.verdict_detail ?? '{}'); } catch {}

    let bullCase: { summary?: string } = {};
    try { bullCase = JSON.parse(pred.bull_case ?? '{}'); } catch {}

    let bearCase: { summary?: string } = {};
    try { bearCase = JSON.parse(pred.bear_case ?? '{}'); } catch {}

    const lines: string[] = [
      `TICKER: ${pred.ticker} [${pred.asset_type}]`,
      `  Verdict: ${pred.verdict} | Action: ${pred.action} | Confidence: ${pred.confidence}%`,
    ];

    if (pred.summary) {
      lines.push(`  Summary: ${pred.summary}`);
    }
    if (verdictDetail.decidingFactor) {
      lines.push(`  Deciding factor: ${verdictDetail.decidingFactor}`);
    }
    if (verdictDetail.keyLevels?.length) {
      lines.push(
        `  Key levels: ${verdictDetail.keyLevels.map(kl => `${kl.label} ${kl.level}`).join(', ')}`
      );
    }
    if (bullCase.summary) {
      lines.push(`  Bull thesis: ${bullCase.summary}`);
    }
    if (bearCase.summary) {
      lines.push(`  Bear thesis: ${bearCase.summary}`);
    }

    return lines.join('\n');
  }).join('\n\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runScoutCouncil(predictions: Prediction[]): Promise<AdvisorResponse[]> {
  const today = new Date().toISOString().split('T')[0];
  const predictionSummary = buildPredictionSummary(predictions);

  const framedQuestion = `Date: ${today}

Below are the latest analyst predictions for assets in the investment universe:

${predictionSummary}

From your advisor perspective, rank the top 10 opportunities from this list. For each ranked pick explain your thesis, the edge you see, the primary risk, and a conviction score from 0 to 100. Be specific and lean fully into your assigned perspective.`;

  // Promise.allSettled rather than Promise.all — one advisor timing out or
  // returning a malformed response must not reject the entire council. The
  // caller receives all six slots; failed ones are flagged with failed: true.
  const settled = await Promise.allSettled(
    Object.values(ADVISORS).map(async (advisor): Promise<AdvisorResponse> => {
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
          system: advisor.systemPrompt,
          messages: [{ role: 'user', content: framedQuestion }],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Anthropic API ${res.status}: ${body}`);
      }

      const data = await res.json();

      // Extended thinking prepends a thinking block before the text block —
      // filter explicitly rather than assuming index 0.
      const textBlock = (data.content as any[])?.find((b: any) => b.type === 'text');
      if (!textBlock) {
        throw new Error('No text block found in Anthropic response');
      }

      return {
        advisorId: advisor.id,
        displayName: advisor.displayName,
        response: textBlock.text,
        failed: false,
      };
    })
  );

  return settled.map((result, i): AdvisorResponse => {
    const advisor = Object.values(ADVISORS)[i];

    if (result.status === 'fulfilled') {
      return result.value;
    }

    console.error(
      `[scout-council] advisor "${advisor.id}" failed:`,
      (result.reason as Error)?.message ?? result.reason
    );
    return {
      advisorId: advisor.id,
      displayName: advisor.displayName,
      response: 'Advisor unavailable — call failed.',
      failed: true,
    };
  });
}
