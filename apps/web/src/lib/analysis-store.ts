import type { ProjectAnalysis } from "@/types/analysis";
import { readLocalStorage, writeLocalStorage } from "@/lib/local-store";

const ANALYSES_KEY = "scopeforge.analyses.v1";

function readAll(): Record<string, ProjectAnalysis> {
  return readLocalStorage<Record<string, ProjectAnalysis>>(ANALYSES_KEY, {});
}

/**
 * Local cache of full ProjectAnalysis records, keyed by id — instant reads
 * for /analysis/[id] with no network round trip. The API is the durable
 * source of truth (apps/api/app/repository.py persists every created
 * analysis to Postgres); when a record isn't in this cache — a different
 * browser, or localStorage was cleared — /analysis/[id] falls back to
 * api.fetchAnalysis() before showing a missing-analysis state. Same
 * local-first-then-remote pattern as historyStore/settingsStore (D016).
 */
export const analysisStore = {
  get(id: string): ProjectAnalysis | undefined {
    return readAll()[id];
  },
  /** Every cached full analysis record — used by "Export all data" so the
   * export includes the complete reports, not just the history summaries. */
  list(): ProjectAnalysis[] {
    return Object.values(readAll());
  },
  save(analysis: ProjectAnalysis): void {
    const all = readAll();
    all[analysis.id] = analysis;
    writeLocalStorage(ANALYSES_KEY, all);
  },
  remove(id: string): void {
    const all = readAll();
    delete all[id];
    writeLocalStorage(ANALYSES_KEY, all);
  },
  /** Wipes the whole local cache — used on logout (D043) so a signed-out
   * account's cached analyses don't linger for whoever uses this browser
   * next. The API remains the durable copy; nothing is actually deleted
   * server-side by this call. */
  clear(): void {
    writeLocalStorage(ANALYSES_KEY, {});
  }
};
