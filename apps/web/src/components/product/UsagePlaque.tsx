"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { useMountedAfterPaint } from "@/lib/use-mounted";
import { PLAN_LABELS } from "@/lib/constants";
import { cn } from "@/lib/cn";

/**
 * Real usage/limits plaque above "Your profile" in the sidebar (D039) — a
 * genuine replacement for the fake, unlabeled DEMO_USAGE progress bar
 * removed in D030 (see the design notes D030's "deceptive mock data"
 * cleanup). Works for both anonymous (installation-id-scoped) and
 * signed-in callers via GET /v1/usage (usage.usage_public_for), unlike the
 * old widget which only ever showed a hardcoded "8/12".
 */
export function UsagePlaque() {
  const { usage } = useAuth();
  const mounted = useMountedAfterPaint();

  // Nothing to show yet (first paint, or the fetch hasn't resolved) — skip
  // rather than flash a skeleton for what is, in the common case, a
  // near-instant local API call; avoids layout jitter on every page load.
  if (!mounted || !usage) return null;

  const limit = usage.analysesLimit;
  const unlimited = limit === null;
  const percent = unlimited ? 0 : Math.min(100, Math.round((usage.analysesUsed / Math.max(1, limit)) * 100));
  const nearLimit = !unlimited && usage.analysesUsed >= limit;

  return (
    <Link
      href="/billing"
      className="mb-2 block rounded-control border border-border-subtle bg-surface-1 px-3 py-2.5 transition-colors duration-150 hover:border-border-default hover:bg-surface-hover"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
          <Zap className={cn("h-3 w-3", nearLimit ? "text-warning" : "text-accent")} aria-hidden="true" />
          {PLAN_LABELS[usage.tier]} plan
        </span>
        <span className="text-[11.5px] text-text-tertiary">
          {unlimited ? "Unlimited" : `${usage.analysesUsed}/${limit}`}
        </span>
      </div>

      {!unlimited ? (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div
            className={cn("h-full rounded-full transition-[width] duration-700 ease-out", nearLimit ? "bg-warning" : "bg-accent")}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}

      {nearLimit ? <p className="mt-1.5 text-[11px] text-warning">Limit reached — upgrade for more</p> : null}
    </Link>
  );
}
