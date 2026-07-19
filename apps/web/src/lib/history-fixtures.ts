import type { AnalysisSummary } from "@/types/history";

/**
 * Demo fixture data for `/history` — deliberately varied across verdict,
 * risk, score, and platform so the search/filter/sort states in
 * `docs/ROUTES_AND_STATES.md` are all reachable without a backend.
 * Never imported into a presentational component directly; goes through
 * `history-store.ts` (the contributing guide: no hardcoded mock data in components).
 */
export const HISTORY_FIXTURES: AnalysisSummary[] = [
  {
    id: "demo",
    title: "SaaS analytics dashboard",
    platform: "Upwork",
    wordCount: 43,
    createdAt: "2026-07-17T06:28:00.000Z",
    verdict: "negotiate",
    score: 84,
    topRiskSeverity: "high",
    estimateRecommended: 5500,
    currency: "USD",
    durationMinDays: 42,
    durationMaxDays: 56
  },
  {
    id: "ai-customer-support-agent",
    title: "Customer support automation",
    platform: "Direct",
    wordCount: 128,
    createdAt: "2026-07-16T09:10:00.000Z",
    verdict: "take",
    score: 91,
    topRiskSeverity: "low",
    estimateRecommended: 3800,
    currency: "USD",
    durationMinDays: 28,
    durationMaxDays: 35
  },
  {
    id: "crypto-trading-automation",
    title: "Crypto trading automation",
    platform: "Upwork",
    wordCount: 72,
    createdAt: "2026-07-15T14:45:00.000Z",
    verdict: "skip",
    score: 58,
    topRiskSeverity: "high",
    estimateRecommended: 2100,
    currency: "USD",
    durationMinDays: 56,
    durationMaxDays: 84
  },
  {
    id: "property-management-portal",
    title: "Property management portal",
    platform: "Freelancer",
    wordCount: 96,
    createdAt: "2026-07-14T11:05:00.000Z",
    verdict: "negotiate",
    score: 77,
    topRiskSeverity: "medium",
    estimateRecommended: 7500,
    currency: "USD",
    durationMinDays: 63,
    durationMaxDays: 77
  },
  {
    id: "b2b-lead-enrichment-tool",
    title: "B2B lead enrichment tool",
    platform: "Direct",
    wordCount: 154,
    createdAt: "2026-07-12T08:20:00.000Z",
    verdict: "take",
    score: 88,
    topRiskSeverity: "low",
    estimateRecommended: 6200,
    currency: "USD",
    durationMinDays: 49,
    durationMaxDays: 63
  },
  {
    id: "mobile-fitness-tracker",
    title: "Mobile fitness tracker",
    platform: "Fiverr",
    wordCount: 61,
    createdAt: "2026-06-28T16:30:00.000Z",
    verdict: "negotiate",
    score: 69,
    topRiskSeverity: "medium",
    estimateRecommended: 2800,
    currency: "USD",
    durationMinDays: 35,
    durationMaxDays: 49
  },
  {
    id: "internal-admin-dashboard",
    title: "Internal admin dashboard",
    platform: "Direct",
    wordCount: 210,
    createdAt: "2026-06-20T10:00:00.000Z",
    verdict: "take",
    score: 95,
    topRiskSeverity: "low",
    estimateRecommended: 9000,
    currency: "USD",
    durationMinDays: 70,
    durationMaxDays: 84
  },
  {
    id: "nft-marketplace-clone",
    title: "NFT marketplace clone",
    platform: "Upwork",
    wordCount: 38,
    createdAt: "2026-06-10T13:15:00.000Z",
    verdict: "skip",
    score: 41,
    topRiskSeverity: "high",
    estimateRecommended: 1500,
    currency: "USD",
    durationMinDays: 42,
    durationMaxDays: 70
  }
];
