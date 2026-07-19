// Phase 9 (D037) — mirrors apps/api/app/schemas.py's auth/billing models
// field-for-field, camelCase (CamelModel, same convention as
// types/analysis.ts), so no mapping layer is needed between the API
// response and these types.

export type PlanTier = "spark" | "forge" | "furnace";

export interface SubscriptionPublic {
  tier: PlanTier;
  status: "active" | "canceled";
  currentPeriodEnd: string | null;
  // D039: cancellation now takes effect at currentPeriodEnd, not
  // immediately — cancelAtPeriodEnd is true while the plan/benefits are
  // still active but scheduled to downgrade to Spark once the period ends.
  cancelAtPeriodEnd: boolean;
  // Display-safe payment-method fragment — never the full card number. Both
  // null when there's no card on file (Spark, or after unlinking).
  cardLast4: string | null;
  cardBrand: string | null;
}

export interface UsagePublic {
  periodStart: string;
  analysesUsed: number;
  analysesLimit: number | null; // null = unlimited (Furnace)
  // D039: lets the sidebar usage plaque show "Spark plan" copy for both
  // anonymous and signed-in callers from a single response.
  tier: PlanTier;
}

export interface UserPublic {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  subscription: SubscriptionPublic;
  usage: UsagePublic;
  emailVerified: boolean; // D042
}

// D042 — one row on /settings' "Active sessions" list.
export interface UserSessionPublic {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  isCurrent: boolean;
}

export interface PlanPublic {
  tier: PlanTier;
  name: string;
  tagline: string;
  priceCents: number;
  monthlyAnalyses: number | null;
  features: string[];
}

export interface CheckoutSessionPublic {
  id: string;
  tier: PlanTier;
  priceCents: number;
  planName: string;
  expiresAt: string;
}
