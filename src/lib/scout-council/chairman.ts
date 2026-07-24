/**
 * Chairman synthesis layer for the Scout Council.
 *
 * The six advisors run in parallel because they are independent. The chairman
 * is a single call because synthesis is inherently sequential — the chairman
 * needs all six advisor responses simultaneously to identify where they
 * converge, where they clash, and how to weigh dissenting views against the
 * majority before committing to a ranked final verdict.
 */

import { type AdvisorResponse } from './run-council';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RankedPick {
  rank: number;
  ticker: string;
  thesis: string;
  edge: string;
  risk: string;
  conviction: number;
  advisorSupport: string[];
}

export interface ChairmanVerdict {
  rankedPicks: RankedPick[];
  whereCouncilAgrees: string;
  whereCouncilClashes: string;
  portfolioNote: string;
  topConvictionPick: string;
}

// ── Anthropic config — matches run-council.ts and claude-debate.ts exactly ────

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 12000;
const THINKING_BUDGET = 8000;

// ── Main export ───────────────────────────────────────────────────────────────

export async function synthesiseCouncil(
  framedQuestion: string,
  advisorResponses: AdvisorResponse[]
): Promise<ChairmanVerdict> {
  const advisorSection = advisorResponses
    .map(r => {
      if (r.failed) {
        return `## ${r.displayName}\n[This advisor was unavailable for this run. Their perspective should not factor into the synthesis.]`;
      }
      return `## ${r.displayName}\n${r.response}`;
    })
    .join('\n\n---\n\n');

  const prompt = `You are the Chairman of an investment council. Six advisors have independently analysed the same set of predictions. Your job is to synthesise their work into a final verdict. You may disagree with the majority if a dissenting advisor's reasoning is stronger — you are a synthesiser, not a vote counter.

The original question posed to the advisors was:

${framedQuestion}

---

The six advisor responses are below:

${advisorSection}

---

Synthesise the above into a final council verdict. Respond with ONLY valid JSON — no preamble, no markdown code fences, no trailing commentary. The JSON must match this exact shape:

{
  "rankedPicks": [
    {
      "rank": 1,
      "ticker": "string",
      "thesis": "1–2 sentences",
      "edge": "1–2 sentences on the specific opportunity edge",
      "risk": "1–2 sentences on the primary risk",
      "conviction": 0-100,
      "advisorSupport": ["displayName of each advisor who backed this pick"]
    }
  ],
  "whereCouncilAgrees": "2–4 sentences on points of clear convergence across advisors",
  "whereCouncilClashes": "2–4 sentences on genuine disagreements — preserve both sides, do not smooth them over",
  "portfolioNote": "1–3 sentences on portfolio-level concerns: correlation, concentration, and execution. Let the Execution Realist's perspective dominate this field.",
  "topConvictionPick": "2–3 sentences naming the single highest-conviction pick and why it stands above the others"
}

Requirements:
- rankedPicks must contain exactly 10 picks, ranked 1 (highest conviction) to 10.
- thesis, edge, and risk are each 1–2 sentences maximum.
- conviction is an integer between 0 and 100.
- advisorSupport lists the displayName of each advisor whose response explicitly backed or aligned with this pick. An empty array is valid if no advisor clearly supported it but the chairman judges it worthy.
- whereCouncilAgrees and whereCouncilClashes must each be 2–4 sentences.
- portfolioNote is 1–3 sentences.
- topConvictionPick is 2–3 sentences.`;

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
      messages: [{ role: 'user', content: prompt }],
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

  try {
    return JSON.parse(textBlock.text) as ChairmanVerdict;
  } catch {
    console.error('[chairman] Raw response that failed JSON.parse:\n', textBlock.text);
    throw new Error('Chairman response was not valid JSON — see logs.');
  }
}
