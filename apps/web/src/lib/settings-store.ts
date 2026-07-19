import { readLocalStorage, writeLocalStorage } from "@/lib/local-store";
import type { AnalysisCurrency, AnalysisDepth, ExperienceLevel, ProposalTone, RiskTolerance } from "@/lib/constants";

export interface AnalysisSettingsData {
  experience: ExperienceLevel;
  currency: AnalysisCurrency;
  hourlyRate: number;
  depth: AnalysisDepth;
  tone: ProposalTone;
  preferredStack: string;
  riskTolerance: RiskTolerance;
  // Freelancer identity (D030) — optional. When set, sent with every
  // analysis request so the model-generated proposal can sign off with a real
  // name/bio instead of a "[Your Name]"-style placeholder.
  freelancerName: string;
  freelancerBio: string;
}

const SETTINGS_KEY = "scopeforge.settings.v1";

export const DEFAULT_SETTINGS: AnalysisSettingsData = {
  experience: "intermediate",
  currency: "USD",
  hourlyRate: 50,
  depth: "detailed",
  tone: "confident",
  preferredStack: "React, TypeScript, Python",
  riskTolerance: "balanced",
  freelancerName: "",
  freelancerBio: ""
};

/**
 * Local repository for analysis/proposal defaults (the risk log R006,
 * same pattern as history-store.ts). `/analyze` does not read these yet —
 * wiring them as real request defaults is Phase 7 (the backlog).
 */
export const settingsStore = {
  load(): AnalysisSettingsData {
    // Merge over DEFAULT_SETTINGS rather than returning the stored object
    // as-is — a settings object saved before a schema field was added
    // (e.g. freelancerName/freelancerBio, D030) would otherwise come back
    // with that field missing/undefined despite the return type promising
    // a string, since readLocalStorage only falls back when the key is
    // entirely absent, not when it's missing individual fields.
    return { ...DEFAULT_SETTINGS, ...readLocalStorage<Partial<AnalysisSettingsData>>(SETTINGS_KEY, DEFAULT_SETTINGS) };
  },
  save(data: AnalysisSettingsData): void {
    writeLocalStorage(SETTINGS_KEY, data);
  },
  reset(): AnalysisSettingsData {
    writeLocalStorage(SETTINGS_KEY, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
};
