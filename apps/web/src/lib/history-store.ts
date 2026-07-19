import type { ProjectAnalysis } from "@/types/analysis";
import type { AnalysisSummary } from "@/types/history";
import { generateAnalysisId } from "@/lib/concepts";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-store";

const HISTORY_KEY = "scopeforge.history.v1";

/** Highest severity present, or "low" if there are no risks at all. */
function topRiskSeverity(risks: ProjectAnalysis["risks"]): AnalysisSummary["topRiskSeverity"] {
  if (risks.some((risk) => risk.severity === "high")) return "high";
  if (risks.some((risk) => risk.severity === "medium")) return "medium";
  return "low";
}

/** Derives the slim /history row shape from a full analysis result — used
 * right after a real POST /v1/analyses call (see /analyze) so a freshly
 * created analysis appears in history without hand-building the summary. */
export function summarizeAnalysis(analysis: ProjectAnalysis): AnalysisSummary {
  return {
    id: analysis.id,
    title: analysis.source.title ?? "Untitled analysis",
    platform: analysis.source.platform ?? "Direct",
    wordCount: analysis.source.description.trim().split(/\s+/).filter(Boolean).length,
    createdAt: analysis.createdAt,
    verdict: analysis.verdict.decision,
    score: analysis.score.total,
    topRiskSeverity: topRiskSeverity(analysis.risks),
    estimateRecommended: analysis.estimate.budgetRecommended,
    currency: analysis.estimate.currency,
    durationMinDays: analysis.estimate.durationMinDays,
    durationMaxDays: analysis.estimate.durationMaxDays
  };
}

/**
 * Local repository for analysis history (the risk log R006). The method
 * shape mirrors what a future `GET/DELETE /v1/analyses` API would return, so
 * swapping the body of these functions for real fetch calls in Phase 7
 * should not require changing any call site in `/history`.
 *
 * D060: used to fall back to `HISTORY_FIXTURES` (8 canned demo rows, dated
 * up to a month old) whenever this browser had never written anything to
 * `HISTORY_KEY` — which in practice meant every first-time visitor, and
 * every fresh browser/profile, saw 8 fake "previous analyses" with no label
 * distinguishing them from real ones. That was fine while this store was a
 * placeholder ahead of a real backend (the comment above), but a real
 * `POST /v1/analyses`/database has existed since Phase 7 — the fixtures were
 * never actually removed once that landed. Found when a user pointed a fresh
 * Postgres database at production and still saw a month-old "history": the
 * DB was never involved, this fallback was the entire explanation. Now
 * falls back to a real empty array, matching the exact state already
 * produced by "Clear history" — /history's existing empty state (see
 * `filtered.length === 0` below) handles this correctly with no further
 * changes needed. `HISTORY_FIXTURES` itself is untouched and still used
 * directly by `/design-system`'s swatch page, which is allowed to show
 * clearly-labeled sample data.
 */
export const historyStore = {
  list(): AnalysisSummary[] {
    return readLocalStorage<AnalysisSummary[]>(HISTORY_KEY, []);
  },

  /** Prepends a new summary (or replaces one with the same id). Used after
   * a real analysis completes — see /analyze. */
  add(summary: AnalysisSummary): AnalysisSummary[] {
    const next = [summary, ...historyStore.list().filter((item) => item.id !== summary.id)];
    writeLocalStorage(HISTORY_KEY, next);
    return next;
  },

  remove(id: string): AnalysisSummary[] {
    const next = historyStore.list().filter((item) => item.id !== id);
    writeLocalStorage(HISTORY_KEY, next);
    return next;
  },

  duplicate(id: string): AnalysisSummary[] {
    const current = historyStore.list();
    const source = current.find((item) => item.id === id);
    if (!source) return current;
    const copy: AnalysisSummary = {
      ...source,
      id: generateAnalysisId(),
      title: `${source.title} (copy)`,
      createdAt: new Date().toISOString()
    };
    const next = [copy, ...current];
    writeLocalStorage(HISTORY_KEY, next);
    return next;
  },

  rename(id: string, title: string): AnalysisSummary[] {
    const next = historyStore.list().map((item) => (item.id === id ? { ...item, title } : item));
    writeLocalStorage(HISTORY_KEY, next);
    return next;
  },

  clear(): AnalysisSummary[] {
    writeLocalStorage(HISTORY_KEY, []);
    return [];
  }
};
