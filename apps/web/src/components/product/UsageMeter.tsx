"use client";

import type { UsagePublic } from "@/types/auth";
import { useMountedAfterPaint } from "@/lib/use-mounted";
import { cn } from "@/lib/cn";

export interface UsageMeterProps {
  usage: UsagePublic;
}

/**
 * "X of Y analyses used this month" progress bar (D037). Mirrors ScoreCard's
 * existing bar treatment (bg-surface-2 track, bg-accent fill, 0% on first
 * paint then animating to the real width post-mount) rather than inventing
 * a new visual language for what is, structurally, the same kind of meter.
 */
export function UsageMeter({ usage }: UsageMeterProps) {
  const mounted = useMountedAfterPaint();
  const limit = usage.analysesLimit;
  const unlimited = limit === null;
  const percent = unlimited ? 0 : Math.min(100, Math.round((usage.analysesUsed / Math.max(1, limit)) * 100));
  const nearLimit = !unlimited && usage.analysesUsed >= limit;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-text-primary">This month</span>
        <span className="text-[12.5px] text-text-secondary">
          {unlimited ? (
            <>
              {usage.analysesUsed} analyses <span className="text-text-tertiary">· unlimited</span>
            </>
          ) : (
            <>
              {usage.analysesUsed} / {usage.analysesLimit} analyses
            </>
          )}
        </span>
      </div>

      {!unlimited ? (
        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={usage.analysesUsed}
          aria-valuemin={0}
          aria-valuemax={usage.analysesLimit ?? 0}
          aria-label="Analyses used this month"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700 ease-out",
              nearLimit ? "bg-warning" : "bg-accent"
            )}
            style={{ width: mounted ? `${percent}%` : "0%" }}
          />
        </div>
      ) : null}

      {nearLimit ? (
        <p className="mt-2 text-[12px] text-warning">
          You&apos;ve used your plan&apos;s limit for this period. Upgrade for more analyses.
        </p>
      ) : null}
    </div>
  );
}
