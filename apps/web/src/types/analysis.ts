export type VerdictDecision = "take" | "negotiate" | "skip";
export type Severity = "low" | "medium" | "high";

export interface ProjectAnalysis {
  id: string;
  createdAt: string;
  source: {
    title?: string;
    description: string;
    platform?: string;
    clientBudget?: { min?: number; max?: number; currency: string };
  };
  verdict: {
    decision: VerdictDecision;
    confidence: number;
    summary: string;
    primaryReason: string;
  };
  score: {
    total: number;
    profitability: number;
    clarity: number;
    portfolioValue: number;
    complexity: number;
    risk: number;
  };
  estimate: {
    budgetMin: number;
    budgetRecommended: number;
    budgetMax: number;
    currency: string;
    durationMinDays: number;
    durationMaxDays: number;
  };
  requirements: {
    explicit: string[];
    hidden: string[];
    assumptions: string[];
  };
  risks: Array<{
    title: string;
    description: string;
    severity: Severity;
    mitigation: string;
  }>;
  milestones: Array<{
    title: string;
    description: string;
    durationDays: number;
    percentage: number;
  }>;
  // tip (D040) is optional — older cached records (localStorage/analysisStore,
  // or anything saved server-side before this field existed) simply won't
  // have one; the hover tooltip falls back to `reason` in that case.
  techStack: Array<{ name: string; category: string; reason: string; tip?: string | null }>;
  clientQuestions: string[];
  // `full` is the neutral base variant; `confident`/`technical` are complete
  // restyled versions of the same proposal generated up front (D047) so the
  // pills swap instantly. Optional — older cached records (localStorage or
  // saved before D047) won't have them; ProposalEditor falls back to `full`.
  // Every variant ends with the literal "[YOUR NAME]" placeholder, substituted
  // client-side from the Settings name.
  proposal: { short: string; full: string; confident?: string | null; technical?: string | null };
}
