"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Clock } from "lucide-react";
import { PageHeader } from "@/components/product/PageHeader";
import { PlanCard } from "@/components/product/PlanCard";
import { UsageMeter } from "@/components/product/UsageMeter";
import { DeleteConfirmDialog } from "@/components/product/DeleteConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchPlans, startCheckout, cancelSubscription, resumeSubscription, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { PLAN_LABELS } from "@/lib/constants";
import type { PlanPublic, PlanTier } from "@/types/auth";

function formatPeriodEnd(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

// Tier ordering, mirrors apps/api/app/billing.py's _TIER_RANK. Used to keep
// a "lower than your current plan" tier from offering a pay-now button —
// downgrades aren't allowed through checkout (the only way down is the
// separate cancel-to-Spark flow). The server enforces the same rule.
const TIER_RANK: Record<PlanTier, number> = { spark: 0, forge: 1, furnace: 2 };

export default function BillingPage() {
  // useSearchParams() requires a Suspense boundary in the App Router (only
  // used here to show a one-time "Upgraded" banner after a mock-checkout
  // redirect) — the rest of the page doesn't depend on it, so the fallback
  // is just the page without that banner rather than a loading skeleton.
  return (
    <Suspense fallback={<BillingPageContent showUpgradedBanner={false} />}>
      <BillingPageWithBanner />
    </Suspense>
  );
}

function BillingPageWithBanner() {
  const searchParams = useSearchParams();
  return <BillingPageContent showUpgradedBanner={searchParams.get("upgraded") === "1"} />;
}

function BillingPageContent({ showUpgradedBanner }: { showUpgradedBanner: boolean }) {
  const router = useRouter();
  const { user, status, refresh } = useAuth();
  const [plans, setPlans] = useState<PlanPublic[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [checkoutTier, setCheckoutTier] = useState<PlanTier | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPlans()
      .then((result) => {
        if (!cancelled) setPlans(result);
      })
      .catch(() => {
        if (!cancelled) setPlansError("Could not load plans. Try reloading the page.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSelectPlan(tier: PlanTier) {
    setCheckoutError(null);

    if (!user) {
      router.push("/signup");
      return;
    }

    if (tier === "spark") {
      setCancelOpen(true);
      return;
    }

    // Guard against a downgrade to a lower paid tier (the button for one is
    // disabled, but never rely on the UI alone — the server rejects it too).
    if (user && TIER_RANK[tier] < TIER_RANK[user.subscription.tier]) {
      setCheckoutError("You can't switch to a lower plan. Cancel to Spark first, then choose the plan you want.");
      return;
    }

    setCheckoutTier(tier);
    try {
      const session = await startCheckout(tier);
      // Carries the plan name/price along in the URL rather than adding a
      // "GET checkout session by id" endpoint just to re-fetch what this
      // page already has in hand — the mock checkout page only ever needs
      // this for display copy, never for anything security-sensitive (the
      // actual confirm call re-validates the session id server-side).
      const params = new URLSearchParams({
        tier: session.tier,
        priceCents: String(session.priceCents),
        planName: session.planName
      });
      router.push(`/billing/checkout/${session.id}?${params.toString()}`);
    } catch (error) {
      setCheckoutError(error instanceof ApiError ? error.message : "Could not start checkout. Try again.");
      setCheckoutTier(null);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelSubscription();
      await refresh();
    } catch {
      setCheckoutError("Could not schedule the switch to Spark. Try again.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleResume() {
    setResuming(true);
    try {
      await resumeSubscription();
      await refresh();
    } catch {
      setCheckoutError("Could not resume the subscription. Try again.");
    } finally {
      setResuming(false);
    }
  }

  const loadingAuth = status === "loading";
  const downgradePending = Boolean(user?.subscription.cancelAtPeriodEnd);

  return (
    // Centered content column (D039, user-flagged) — the billing page's
    // header, three-card grid, and status banners used to stretch the full
    // content width (up to 1480px per the UI guidelines), which read as
    // sparse and unbalanced on large screens compared to every other page
    // in the app, none of which are a wide comparison table. D044: the
    // header used to sit *outside* this wrapper in its own full-width box,
    // so its "center" alignment centered against a wider area than the
    // cards below it — visibly off-center relative to them. Moved inside
    // the same wrapper so both align against the same 880px box.
    <div className="mx-auto max-w-[880px]">
      <PageHeader
        eyebrow="ScopeForge"
        title="Billing"
        description="Spark, Forge, and Furnace — pick the plan that matches how often you scope projects."
        align="center"
      />

      {showUpgradedBanner ? (
        <div className="mb-6 flex items-center justify-center gap-2 rounded-control border border-success/30 bg-success/10 px-3.5 py-2.5">
          <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <p className="text-[12.5px] text-success">Your plan was updated.</p>
        </div>
      ) : null}

      {!loadingAuth && !user ? (
        <div className="mb-6 rounded-card border border-border-default bg-surface-1 p-4 text-center">
          <p className="text-[13px] text-text-secondary">
            You&apos;re using ScopeForge anonymously on the free Spark plan.{" "}
            <Link href="/signup" className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover">
              Create an account
            </Link>{" "}
            to upgrade, or{" "}
            <Link href="/login" className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover">
              sign in
            </Link>{" "}
            if you already have one.
          </p>
        </div>
      ) : null}

      {user ? (
        <div className="mb-6 rounded-card border border-border-default bg-surface-1 p-5">
          <UsageMeter usage={user.usage} />
        </div>
      ) : null}

      {downgradePending && user?.subscription.currentPeriodEnd ? (
        <div className="mb-6 flex flex-col items-center gap-2.5 rounded-card border border-warning/30 bg-warning/10 p-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="flex items-center gap-2 text-[12.5px] text-warning">
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            Your {PLAN_LABELS[user.subscription.tier]} plan stays active until{" "}
            {formatPeriodEnd(user.subscription.currentPeriodEnd)}, then moves to Spark.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void handleResume()} disabled={resuming}>
            {resuming ? "Resuming…" : "Keep my plan"}
          </Button>
        </div>
      ) : null}

      {checkoutError ? <p className="mb-4 text-center text-[13px] text-danger">{checkoutError}</p> : null}
      {plansError ? <p className="mb-4 text-center text-[13px] text-danger">{plansError}</p> : null}

      {!plans ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[340px] rounded-card" />
          ))}
        </div>
      ) : (
        <div className="grid items-stretch gap-4 sm:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.tier}
              plan={plan}
              // R017: an anonymous visitor has no `user`, so the naive
              // `user?.subscription.tier === plan.tier` comparison was
              // false for every plan including Spark — even though the
              // banner right above this grid says "you're on the free
              // Spark plan." Anonymous users are implicitly on Spark
              // (D004/D037: accounts are opt-in), so Spark should read as
              // current for them too.
              isCurrent={plan.tier === "spark" ? !user || user.subscription.tier === "spark" : user?.subscription.tier === plan.tier}
              highlighted={plan.tier === "forge"}
              busy={checkoutTier === plan.tier}
              downgradePending={downgradePending}
              // A paid tier below the user's current tier can't be bought —
              // downgrades go through cancel-to-Spark only (server-enforced).
              isDowngrade={Boolean(user) && plan.tier !== "spark" && TIER_RANK[plan.tier] < TIER_RANK[user!.subscription.tier]}
              onSelect={handleSelectPlan}
            />
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-[12px] text-text-tertiary">
        Checkout is simulated for this demo — no real payment processor is involved and no card is ever charged.
      </p>

      {user ? (
        <DeleteConfirmDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          title="Switch back to Spark?"
          description="Your plan and its benefits stay active until the end of the current billing period. After that, your account moves to the free Spark plan and your monthly analysis limit drops."
          itemSummary={
            <p className="text-[13px] text-text-secondary">
              Current plan: <span className="font-medium text-text-primary">{PLAN_LABELS[user.subscription.tier]}</span>
              {user.subscription.currentPeriodEnd ? (
                <>
                  {" "}
                  · active through{" "}
                  <span className="font-medium text-text-primary">{formatPeriodEnd(user.subscription.currentPeriodEnd)}</span>
                </>
              ) : null}
            </p>
          }
          confirmLabel={cancelling ? "Scheduling…" : "Switch to Spark"}
          onConfirm={() => void handleCancel()}
        />
      ) : null}
    </div>
  );
}
