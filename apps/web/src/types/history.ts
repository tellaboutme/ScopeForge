import type { Severity, VerdictDecision } from "@/types/analysis";

/**
 * Slim per-row shape for `/history` — not the full `ProjectAnalysis`. A real
 * backend (Phase 7) would return exactly this from a list endpoint and the
 * full record only from `GET /v1/analyses/{id}`, so keeping the list shape
 * separate from the start avoids a reshape later.
 */
export interface AnalysisSummary {
  id: string;
  title: string;
  platform: string;
  wordCount: number;
  createdAt: string;
  verdict: VerdictDecision;
  score: number;
  topRiskSeverity: Severity;
  estimateRecommended: number;
  currency: string;
  durationMinDays: number;
  durationMaxDays: number;
}
