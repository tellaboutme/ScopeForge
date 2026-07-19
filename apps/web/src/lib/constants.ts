import { History, Plus, Settings, type LucideIcon } from "lucide-react";
import type { PlanTier } from "@/types/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/analyze", label: "New analysis", icon: Plus },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings }
];

// Mirrors AnalysisCreate in apps/api/app/schemas.py — keep option sets in sync.
export type ExperienceLevel = "beginner" | "intermediate" | "expert";
export type AnalysisCurrency = "USD" | "EUR" | "PLN";
export type AnalysisDepth = "quick" | "detailed";

export const EXPERIENCE_OPTIONS: Array<{ value: ExperienceLevel; label: string }> = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "expert", label: "Expert" }
];

export const CURRENCY_OPTIONS: Array<{ value: AnalysisCurrency; label: string }> = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "PLN", label: "PLN" }
];

export const CURRENCY_SYMBOL: Record<AnalysisCurrency, string> = {
  USD: "$",
  EUR: "€",
  PLN: "zł"
};

export const DEPTH_OPTIONS: Array<{ value: AnalysisDepth; label: string }> = [
  { value: "quick", label: "Quick" },
  { value: "detailed", label: "Detailed" }
];

export const DEPTH_BADGE_LABEL: Record<AnalysisDepth, string> = {
  quick: "Quick analysis",
  detailed: "Detailed analysis"
};

// Mirrors AnalysisCreate.clientBudgetType in apps/api/app/schemas.py — a
// fixed total and an hourly rate are very different signals for the model's
// verdict/estimate, so the type has to travel with the number, not just be
// a display-only label on the /analyze form.
export type ClientBudgetType = "fixed" | "hourly";
export const BUDGET_TYPE_OPTIONS: Array<{ value: ClientBudgetType; label: string }> = [
  { value: "fixed", label: "Fixed" },
  { value: "hourly", label: "Hourly" }
];

// Deadline unit is a client-side-only convenience (D040) — /analyze always
// converts to days before sending clientDeadlineDays, so the backend schema
// doesn't need to know which unit the freelancer typed in.
export type ClientDeadlineUnit = "days" | "months";
export const DEADLINE_UNIT_OPTIONS: Array<{ value: ClientDeadlineUnit; label: string }> = [
  { value: "days", label: "Days" },
  { value: "months", label: "Months" }
];

export const EXAMPLE_BRIEF =
  "We need a modern, responsive SaaS platform with user authentication, subscription billing through Stripe, an analytics dashboard, settings, and team management. The application should be built with React and Node.js. Please share relevant experience and an estimated timeline.";

// Settings-only option sets (Phase 6). Not part of AnalysisCreate — these are
// local product-preference values, not sent to the analysis endpoint.
export type ProposalTone = "friendly" | "confident" | "technical";
export type RiskTolerance = "conservative" | "balanced" | "aggressive";

export const TONE_OPTIONS: Array<{ value: ProposalTone; label: string }> = [
  { value: "friendly", label: "Friendly" },
  { value: "confident", label: "Confident" },
  { value: "technical", label: "Technical" }
];

export const RISK_TOLERANCE_OPTIONS: Array<{ value: RiskTolerance; label: string }> = [
  { value: "conservative", label: "Conservative" },
  { value: "balanced", label: "Balanced" },
  { value: "aggressive", label: "Aggressive" }
];

// Demo platform vocabulary for history fixtures and the history filter's
// platform select — mirrors the values `source.platform` can hold.
export const PLATFORM_OPTIONS = ["Upwork", "Direct", "Freelancer", "Fiverr"] as const;
export type Platform = (typeof PLATFORM_OPTIONS)[number];

// Phase 9 (D037) — display names for apps/api/app/billing.py's PLAN_CATALOG
// keys. Kept here rather than duplicated at each call site (UserMenu,
// /billing) since the actual tier copy (tagline, price, feature list) comes
// from the API's /v1/billing/plans response — this is just the short label
// used in compact contexts that don't have the full plan object on hand.
export const PLAN_LABELS: Record<PlanTier, string> = {
  spark: "Spark",
  forge: "Forge",
  furnace: "Furnace"
};
