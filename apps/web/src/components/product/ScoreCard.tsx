"use client";

import type { ProjectAnalysis } from "@/types/analysis";
import { scorePercentileCopy, scoreStatus } from "@/lib/format";
import { useCountUp } from "@/lib/use-count-up";
import { useMountedAfterPaint } from "@/lib/use-mounted";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

export interface ScoreCardProps {
  score?: ProjectAnalysis["score"];
  loading?: boolean;
}

export function ScoreCard({ score, loading }: ScoreCardProps) {
  const mounted = useMountedAfterPaint();
  const animatedTotal = useCountUp(score?.total ?? 0);

  if (loading || !score) {
    return (
      <div className="rounded-card border border-border-default bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-10 w-24" />
        <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
        <Skeleton className="mt-3 h-3 w-40" />
      </div>
    );
  }

  const status = scoreStatus(score.total);

  return (
    <div className="rounded-card border border-border-default bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">Project score</h3>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </div>

      <p className="mt-3 flex items-baseline gap-1 font-mono">
        <span className="text-[38px] font-semibold leading-[40px] text-text-primary sm:text-[42px] sm:leading-[44px] tabular-nums">
          {animatedTotal}
        </span>
        <span className="text-[15px] text-text-tertiary">/100</span>
      </p>

      <div
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={score.total}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Project score"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
          style={{ width: mounted ? `${Math.min(100, Math.max(0, score.total))}%` : "0%" }}
        />
      </div>

      <p className="mt-3 text-[12px] text-text-tertiary">{scorePercentileCopy(score.total)}</p>
    </div>
  );
}
