import { Check } from "lucide-react";
import type { PlanPublic, PlanTier } from "@/types/auth";
import { cn } from "@/lib/cn";
import { formatPlanPrice } from "@/lib/format";
import { Button } from "@/components/ui/Button";

export interface PlanCardProps {
  plan: PlanPublic;
  isCurrent: boolean;
  /** Forge is the recommended middle tier — see the design notes D037. */
  highlighted?: boolean;
  onSelect: (tier: PlanTier) => void;
  busy?: boolean;
  /** True once a paid plan is scheduled to end at period end (D039) — the
   * Spark card shouldn't offer a "Switch to Spark" action while that's
   * already in motion. */
  downgradePending?: boolean;
  /** True when this paid tier is *below* the user's current tier — downgrades
   * are not offered through checkout (the only way down is cancelling to
   * Spark). The card shows a disabled, non-actionable state instead of an
   * "Upgrade" button. */
  isDowngrade?: boolean;
}

export function PlanCard({ plan, isCurrent, highlighted, onSelect, busy, downgradePending, isDowngrade }: PlanCardProps) {
  const isSpark = plan.tier === "spark";

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-card border p-5",
        highlighted ? "border-accent bg-surface-1 shadow-[0_0_0_1px_var(--color-accent)]" : "border-border-default bg-surface-1"
      )}
    >
      {highlighted ? (
        <span className="mb-3 inline-flex w-fit items-center rounded-full bg-accent-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-hover">
          Most popular
        </span>
      ) : null}

      <h3 className="text-[17px] font-semibold text-text-primary">{plan.name}</h3>
      <p className="mt-1 text-[13px] text-text-secondary">{plan.tagline}</p>

      <p className="mt-4 text-[28px] font-semibold text-text-primary">{formatPlanPrice(plan.priceCents)}</p>

      <ul className="mt-4 flex flex-1 flex-col gap-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-[13px] text-text-secondary">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* Spark never gets a full "Downgrade" button (D039, user-flagged —
          a solid actionable button on the free tier read as more prominent
          than the paid-tier upgrade buttons next to it, and made "you're
          already on the cheapest plan" look like a decision that still
          needed making). Current state is a quiet label; switching down
          from a paid plan to Spark is still possible, just as an
          understated text link rather than a button matching Upgrade's
          visual weight. */}
      {isSpark ? (
        isCurrent ? (
          <p className="mt-5 text-center text-[12.5px] text-text-tertiary">You&apos;re on this plan</p>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(plan.tier)}
            disabled={busy || downgradePending}
            className="mt-5 text-center text-[12.5px] font-medium text-text-tertiary underline decoration-text-tertiary/40 underline-offset-2 transition-colors duration-150 hover:text-text-secondary disabled:pointer-events-none disabled:opacity-60"
          >
            {downgradePending ? "Switching to Spark at period end" : "Switch back to Spark"}
          </button>
        )
      ) : isDowngrade ? (
        // A tier below the user's current one gets no action at all — just a
        // quiet note that they're already on a better plan (downgrades go
        // through cancel-to-Spark only; server-enforced).
        <p className="mt-5 text-center text-[12.5px] text-text-tertiary">You&apos;re already on a higher plan</p>
      ) : (
        <Button
          variant={isCurrent ? "secondary" : highlighted ? "primary" : "secondary"}
          className="mt-5 w-full"
          disabled={isCurrent || busy}
          onClick={() => onSelect(plan.tier)}
        >
          {isCurrent ? "Current plan" : busy ? "Starting checkout…" : "Upgrade"}
        </Button>
      )}
    </div>
  );
}
