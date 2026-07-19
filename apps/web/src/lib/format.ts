import type { Severity, VerdictDecision } from "@/types/analysis";

/**
 * Formats a whole-number currency amount using the given ISO 4217 code.
 * Recommended/estimate amounts in the analysis schema are always non-negative.
 */
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatCurrencyRange(min: number, max: number, currency: string): string {
  return `${formatCurrency(min, currency)}–${formatCurrency(max, currency)}`;
}

/**
 * D047 — proposal variants are generated ending with the literal "[YOUR NAME]"
 * placeholder (never a real name baked in server-side), so the sign-off can be
 * personalized live from the freelancer's Settings name without regenerating.
 * Replaces every "[YOUR NAME]" with the trimmed name, or leaves the placeholder
 * in place when no name is set (the requested default). Case-insensitive on the
 * bracket token so a slightly different casing from a real model response
 * ("[Your Name]") is still caught.
 */
export function applyProposalName(text: string, name: string | undefined | null): string {
  const trimmed = name?.trim();
  const replacement = trimmed && trimmed.length > 0 ? trimmed : "[YOUR NAME]";
  return text.replace(/\[your name\]/gi, replacement);
}

/**
 * "$12/mo" or "Free" for a plan price in cents (D037 — mirrors
 * apps/api/app/billing.py's PlanPublic.priceCents). Always USD: the mock
 * plan catalog only ever quotes one currency, unrelated to the per-analysis
 * currency selector used elsewhere in the product.
 */
export function formatPlanPrice(priceCents: number): string {
  if (priceCents === 0) return "Free";
  const dollars = priceCents / 100;
  const amount = Number.isInteger(dollars) ? dollars.toString() : dollars.toFixed(2);
  return `$${amount}/mo`;
}

export type ScoreTone = "success" | "info" | "warning" | "danger";

export interface ScoreStatus {
  label: string;
  tone: ScoreTone;
}

/**
 * Score status thresholds are a product assumption (not specified in docs/DATA_MODEL.md):
 * 80-100 Excellent, 60-79 Good, 40-59 Fair, 0-39 Weak.
 */
export function scoreStatus(total: number): ScoreStatus {
  if (total >= 80) return { label: "Excellent", tone: "success" };
  if (total >= 60) return { label: "Good", tone: "info" };
  if (total >= 40) return { label: "Fair", tone: "warning" };
  return { label: "Weak", tone: "danger" };
}

/**
 * Presentational-only percentile copy derived from the score, not a stored metric.
 * Deterministic so repeated renders of the same analysis are stable.
 */
export function scorePercentileCopy(total: number): string {
  const percentile = Math.min(99, Math.max(1, Math.round(total - 6)));
  return `Better than ${percentile}% of analyzed projects`;
}

/**
 * Maps a 0-10 sub-score (score.portfolioValue, score.risk, ...) to a qualitative
 * label for display in the verdict card. Bands: 0-3 Low, 4-6 Medium, 7-10 High.
 */
export function qualitativeLevel(value: number): "Low" | "Medium" | "High" {
  if (value >= 7) return "High";
  if (value >= 4) return "Medium";
  return "Low";
}

/**
 * The 8-word floor mirrors the API's own minimum (apps/api/app/main.py).
 * Bands above that are a UI-only quality hint, not a hard rule.
 */
export const MIN_BRIEF_WORDS = 8;

export function briefQuality(wordCount: number): ScoreStatus {
  if (wordCount < MIN_BRIEF_WORDS) return { label: "Too short", tone: "danger" };
  if (wordCount < 25) return { label: "Thin — add more detail", tone: "warning" };
  return { label: "Good detail", tone: "success" };
}

export const VERDICT_LABEL: Record<VerdictDecision, string> = {
  take: "Take it",
  negotiate: "Negotiate first",
  skip: "Skip this project"
};

export const VERDICT_TONE: Record<VerdictDecision, ScoreTone> = {
  take: "success",
  negotiate: "warning",
  skip: "danger"
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High"
};

export const SEVERITY_TONE: Record<Severity, ScoreTone> = {
  low: "info",
  medium: "warning",
  high: "danger"
};

/** "4 days" for short spans, rounds up to whole weeks once a milestone is 14+ days. */
export function formatDurationDays(days: number): string {
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

export function formatDurationRange(minDays: number, maxDays: number): string {
  if (minDays >= 14 || maxDays >= 14) {
    const minWeeks = Math.max(1, Math.round(minDays / 7));
    const maxWeeks = Math.max(minWeeks, Math.round(maxDays / 7));
    return minWeeks === maxWeeks ? `${minWeeks} weeks` : `${minWeeks}–${maxWeeks} weeks`;
  }
  return minDays === maxDays ? `${minDays} days` : `${minDays}–${maxDays} days`;
}

const SCORE_FACTOR_LABEL: Record<string, string> = {
  profitability: "profitability",
  clarity: "clarity",
  portfolioValue: "portfolio value",
  complexity: "complexity",
  risk: "risk"
};

/**
 * Deterministic one-line interpretation of the radar, built from the strongest
 * and weakest sub-scores. There is no dedicated schema field for this copy
 * (see the design notes D013), so it is derived client-side from score.*.
 */
export function scoreInsight(score: {
  profitability: number;
  clarity: number;
  portfolioValue: number;
  complexity: number;
  risk: number;
}): string {
  // Iterate only the five known sub-score keys (via SCORE_FACTOR_LABEL),
  // not Object.entries(score) directly. ScoreBreakdownCard passes the full
  // ProjectAnalysis["score"] object, which also has a `total` field (0-100
  // scale, not a 0-10 sub-score) — TypeScript's excess-property check only
  // fires on object literals, not on a variable being passed through, so
  // `total` silently rode along, and being far larger than any 0-10
  // sub-score it almost always "won" the strongest-factor reduction, with
  // no matching label -> "Strongest on undefined" in the UI. Bug existed
  // since Phase 4; only surfaced visibly once a real (non-mock) analysis
  // was actually read closely.
  const keys = Object.keys(SCORE_FACTOR_LABEL) as Array<keyof typeof score>;
  const entries = keys.map((key) => [key, score[key]] as const);
  const strongest = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const weakest = entries.reduce((a, b) => (b[1] < a[1] ? b : a));

  if (strongest[0] === weakest[0]) {
    return "Sub-scores are evenly balanced across all five factors.";
  }

  return `Strongest on ${SCORE_FACTOR_LABEL[strongest[0]]}, weakest on ${SCORE_FACTOR_LABEL[weakest[0]]}.`;
}

/**
 * Strips markdown emphasis/formatting from model-generated scalar text fields
 * (proposal.short, proposal.full). the API contract and prompt.py's RULES
 * already ask the model to avoid markdown in these fields, but in practice
 * it still emits **bold** headings and bullet markers (see the design notes
 * D030) — this is a client-side safety net so both new and already-cached
 * analyses (analysisStore/history) render and copy as clean plain text.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[ \t]*[-*]\s+/gm, "")
    .replace(/[*_`]/g, "")
    .trim();
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * Renders a short relative-time label ("Analyzed 2 minutes ago").
 * Falls back gracefully for future/invalid timestamps.
 */
export function relativeTimeFromNow(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";

  const diffSeconds = Math.round((then - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 45) return RELATIVE_TIME.format(0, "second").replace("0 seconds", "moments") || "moments ago";
  if (abs < 60 * 60) return RELATIVE_TIME.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 60 * 60 * 24) return RELATIVE_TIME.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 60 * 60 * 24 * 30) return RELATIVE_TIME.format(Math.round(diffSeconds / 86400), "day");
  return RELATIVE_TIME.format(Math.round(diffSeconds / (86400 * 30)), "month");
}
