import type { ProjectAnalysis } from "@/types/analysis";
import type { AnalysisCurrency, AnalysisDepth, ExperienceLevel } from "@/lib/constants";
import type { CheckoutSessionPublic, PlanPublic, PlanTier, SubscriptionPublic, UsagePublic, UserPublic, UserSessionPublic } from "@/types/auth";
import { getInstallationId } from "@/lib/installation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Typed API failure — `code` mirrors apps/api's AnalysisFailure.code
 * ("provider_error" | "schema_validation_failed" | "brief_too_short" |
 * "not_found") plus a client-side "network_error" for requests that never
 * reached the server at all. Callers (mainly /analyze) branch on `code`.
 */
export class ApiError extends Error {
  code: string;
  status: number;
  // Seconds until the caller may retry, when the server sends one (currently
  // the password-reset per-minute limiter's 429 — detail.retryAfter, also
  // mirrored in the Retry-After header). Lets the UI show an exact countdown.
  retryAfter?: number;

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

// Without a client-side timeout, a slow or stuck backend request (or a
// provider that never responds) leaves the UI spinning forever with no way
// to tell the user anything went wrong — this happened for real once the
// API started calling a real, slow model provider instead of the instant mock.
// 15s covers ordinary CRUD calls generously; analyzeProject() overrides it
// to match apps/api/app/provider.py's own 75s provider timeout plus buffer
// for the repair-retry path and persistence, so the client doesn't give up
// before the server would have.
const DEFAULT_TIMEOUT_MS = 15_000;

async function apiFetch<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...requestInit } = init ?? {};
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestInit,
      signal: controller.signal,
      // Phase 9 (D037): the account session lives in an httpOnly cookie set
      // by the API on a different origin (localhost:8000 vs. :3000 in dev)
      // — without credentials:"include", the browser never sends or stores
      // that cookie at all, and every request would look anonymous even
      // right after a successful login. Anonymous requests are unaffected
      // (no cookie exists yet, this is just permission to send one if it
      // does) — see main.py's CORS config, which now sets
      // allow_credentials=True with an explicit origin allowlist to match.
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Installation-Id": getInstallationId(),
        ...(requestInit.headers ?? {})
      }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(0, "timeout", "The analysis API did not respond in time. It may still finish in the background — try again in a moment, or check that the provider (or ANALYSIS_MOCK_MODE) is configured correctly.");
    }
    throw new ApiError(0, "network_error", "Could not reach the analysis API. Is it running?");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let code = "unknown_error";
    let message = `Request failed with status ${response.status}.`;
    let retryAfter: number | undefined;
    try {
      const body = await response.json();
      if (body?.detail?.code) code = body.detail.code;
      if (body?.detail?.message) message = body.detail.message;
      if (typeof body?.detail?.retryAfter === "number") retryAfter = body.detail.retryAfter;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    if (retryAfter === undefined) {
      const header = Number(response.headers.get("retry-after"));
      if (Number.isFinite(header) && header > 0) retryAfter = header;
    }
    throw new ApiError(response.status, code, message, retryAfter);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface AnalyzeRequest {
  description: string;
  experienceLevel: ExperienceLevel;
  currency: AnalysisCurrency;
  depth: AnalysisDepth;
  // Structured client-stated facts, entered directly from the listing
  // rather than left for the model to extract from free-text prose (D029).
  // Both optional — omitted entirely (not sent as null) when not entered.
  clientBudget?: number;
  // D040: distinguishes a fixed total from an hourly rate — see
  // apps/api/app/schemas.py's AnalysisCreate.clientBudgetType docstring.
  // Only meaningful when clientBudget is set; defaults server-side to
  // "fixed" when omitted.
  clientBudgetType?: "fixed" | "hourly";
  clientDeadlineDays?: number;
  // Freelancer identity from /settings (D030). D047: the name is no longer
  // baked into the proposal sign-off server-side (the frontend substitutes it
  // live from Settings) — `freelancerName`/`freelancerBio` are now background
  // context for the model, and `preferredStack` is referenced in the proposal
  // (especially its Technical variant) when set.
  freelancerName?: string;
  freelancerBio?: string;
  preferredStack?: string;
}

// Worst case on the backend (apps/api/app/provider.py): run_analysis() can
// call call_model() twice (the initial call + one repair retry on a schema
// failure), and *each* of those call_model() invocations can itself hit
// Groq's 429 rate limit, wait out its own bounded retry (up to 15s), and
// then still time out on the retried request (45s) — so one call_model()
// call's real worst case is ~15s + 45s = 60s, not just 45s. Two of those
// back to back is ~120s. The previous 110s budget here was *tighter* than
// that real backend worst case, so the frontend could abort with this
// generic "did not respond in time" message even while the backend was
// still legitimately working (and would have returned a real result or a
// real 429/502 a few seconds later) — a genuine client/server timeout
// mismatch, not just "the provider is slow". 140s gives the full ~120s
// backend worst case real headroom plus buffer for persistence/network.
const ANALYZE_TIMEOUT_MS = 140_000;

export function analyzeProject(payload: AnalyzeRequest): Promise<ProjectAnalysis> {
  return apiFetch<ProjectAnalysis>("/v1/analyses", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: ANALYZE_TIMEOUT_MS
  });
}

export function fetchAnalysis(id: string): Promise<ProjectAnalysis> {
  return apiFetch<ProjectAnalysis>(`/v1/analyses/${encodeURIComponent(id)}`);
}

export function deleteAnalysisRemote(id: string): Promise<void> {
  return apiFetch<void>(`/v1/analyses/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function duplicateAnalysisRemote(id: string): Promise<ProjectAnalysis> {
  return apiFetch<ProjectAnalysis>(`/v1/analyses/${encodeURIComponent(id)}/duplicate`, { method: "POST" });
}

export type ProposalTone = "confident" | "technical";

/**
 * Stateless proposal-tone-regeneration request (D033) — driven by
 * ProposalEditor.tsx's Confident/Technical pills. Carries just the facts
 * needed to reword proposal.short/full, sourced from the ProjectAnalysis
 * already held client-side (analysisStore, D022) rather than requiring a
 * server-side lookup.
 */
export interface ProposalRegenerateRequest {
  sourceDescription: string;
  platform?: string;
  verdictSummary: string;
  budgetRecommended: number;
  currency: string;
  durationMinDays: number;
  durationMaxDays: number;
  techStack: string[];
  tones: ProposalTone[];
  freelancerName?: string;
  freelancerBio?: string;
}

// A reword-only call requests far fewer tokens than a full analysis, so it's
// typically much faster — but analysis_service.regenerate_proposal() has the
// exact same two-call, rate-limit-retry-bearing shape as run_analysis() (see
// ANALYZE_TIMEOUT_MS's comment above), so its real worst case is the same
// ~120s, not something proportional to its smaller token budget. The
// previous 30s value here was never enough to cover that worst case even
// though it's rare in practice — bumped to match.
const PROPOSAL_REGENERATE_TIMEOUT_MS = 140_000;

export function regenerateProposal(payload: ProposalRegenerateRequest): Promise<ProjectAnalysis["proposal"]> {
  return apiFetch<ProjectAnalysis["proposal"]>("/v1/proposals/regenerate", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: PROPOSAL_REGENERATE_TIMEOUT_MS
  });
}

// --- Phase 9: accounts, subscriptions, mock billing (D037) -----------------

export interface RegisterPayload {
  email: string;
  password: string;
  displayName?: string;
  // D042 — Cloudflare Turnstile response token. Undefined whenever the
  // widget didn't render (NEXT_PUBLIC_TURNSTILE_SITE_KEY unset) — the
  // backend only requires it when TURNSTILE_ENABLED=true server-side, so
  // the two sides degrade together with zero configuration.
  turnstileToken?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
  turnstileToken?: string;
}

export function registerAccount(payload: RegisterPayload): Promise<UserPublic> {
  return apiFetch<UserPublic>("/v1/auth/register", { method: "POST", body: JSON.stringify(payload) });
}

export function loginAccount(payload: LoginPayload): Promise<UserPublic> {
  return apiFetch<UserPublic>("/v1/auth/login", { method: "POST", body: JSON.stringify(payload) });
}

export function logoutAccount(): Promise<void> {
  return apiFetch<void>("/v1/auth/logout", { method: "POST" });
}

// D042 — email verification. verifyEmail resolves the just-verified user
// (so the caller can refresh auth state immediately without a second
// round trip); resendVerification is a no-op server-side if the account
// is already verified.
export function verifyEmail(token: string): Promise<UserPublic> {
  return apiFetch<UserPublic>("/v1/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
}

export function resendVerificationEmail(): Promise<void> {
  return apiFetch<void>("/v1/auth/resend-verification", { method: "POST" });
}

// D051 — password reset. requestPasswordReset always resolves (the server
// returns 204 whether or not the email is registered, so the UI shows the
// same "check your inbox" message either way and can't be used to probe
// which addresses exist). resetPassword sets the new password from the
// emailed token and, server-side, revokes every session on the account —
// the user then signs in fresh.
export function requestPasswordReset(email: string): Promise<void> {
  return apiFetch<void>("/v1/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export function resetPassword(token: string, password: string): Promise<void> {
  return apiFetch<void>("/v1/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
}

// D042 — active sessions (/settings' Security tab).
export function fetchSessions(): Promise<UserSessionPublic[]> {
  return apiFetch<UserSessionPublic[]>("/v1/auth/sessions");
}

export function revokeSession(id: string): Promise<void> {
  return apiFetch<void>(`/v1/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function revokeOtherSessions(): Promise<{ revoked: number }> {
  return apiFetch<{ revoked: number }>("/v1/auth/sessions", { method: "DELETE" });
}

// Returns null for the expected "not signed in" case (401) instead of
// throwing — callers (auth-store) treat that as the normal anonymous state,
// not an error to surface. Any other failure (network, 500, ...) still
// throws, since those genuinely are unexpected.
export async function fetchMe(): Promise<UserPublic | null> {
  try {
    return await apiFetch<UserPublic>("/v1/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function fetchPlans(): Promise<PlanPublic[]> {
  return apiFetch<PlanPublic[]>("/v1/billing/plans");
}

export function startCheckout(tier: PlanTier): Promise<CheckoutSessionPublic> {
  return apiFetch<CheckoutSessionPublic>("/v1/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ tier })
  });
}

// The card fields are validated by the backend only for realistic shape —
// nothing here is ever charged or sent to a real payment processor (D037:
// this is a mock checkout, see billing/checkout/[sessionId]/page.tsx).
export interface MockCardDetails {
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
  cardholderName: string;
}

export function confirmCheckout(checkoutId: string, card: MockCardDetails): Promise<SubscriptionPublic> {
  return apiFetch<SubscriptionPublic>(`/v1/billing/checkout/${encodeURIComponent(checkoutId)}/confirm`, {
    method: "POST",
    body: JSON.stringify(card)
  });
}

export function cancelSubscription(): Promise<SubscriptionPublic> {
  return apiFetch<SubscriptionPublic>("/v1/billing/cancel", { method: "POST" });
}

// D039: undoes a pending cancel-at-period-end before the period ends.
export function resumeSubscription(): Promise<SubscriptionPublic> {
  return apiFetch<SubscriptionPublic>("/v1/billing/resume", { method: "POST" });
}

// D039: /settings' "unlink card" action — clears the displayed payment
// method and schedules the subscription to end at the current period's
// boundary (see apps/api/app/billing.py's unlink_card docstring).
export function unlinkCard(): Promise<SubscriptionPublic> {
  return apiFetch<SubscriptionPublic>("/v1/billing/unlink-card", { method: "POST" });
}

// D039: backs the sidebar usage plaque — works for both anonymous
// (installation-id-scoped) and signed-in callers.
export function fetchUsage(): Promise<UsagePublic> {
  return apiFetch<UsagePublic>("/v1/usage");
}
