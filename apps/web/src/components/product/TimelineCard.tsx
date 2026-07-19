"use client";

import { useState } from "react";
import type { ProjectAnalysis } from "@/types/analysis";
import { formatDurationDays, formatDurationRange } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useMountedAfterPaint } from "@/lib/use-mounted";
import { Skeleton } from "@/components/ui/Skeleton";

export interface TimelineCardProps {
  milestones?: ProjectAnalysis["milestones"];
  estimate?: ProjectAnalysis["estimate"];
  loading?: boolean;
}

export function TimelineCard({ milestones, estimate, loading }: TimelineCardProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const mounted = useMountedAfterPaint();

  if (loading || !milestones || !estimate) {
    return (
      <div className="h-full rounded-card border border-border-default bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-8 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full rounded-card border border-border-default bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">Estimated timeline</h3>
        <span className="font-mono text-[12px] font-medium text-text-secondary">
          {formatDurationRange(estimate.durationMinDays, estimate.durationMaxDays)}
        </span>
      </div>

      <ul className="mt-3 flex flex-col divide-y divide-border-subtle">
        {milestones.map((milestone, index) => {
          const open = openIndex === index;
          return (
            <li key={`${milestone.title}-${index}`} className="py-3 first:pt-1 last:pb-0">
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : index)}
                aria-expanded={open}
                className="flex w-full flex-col gap-2 text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px] font-medium text-text-primary">{milestone.title}</span>
                  <span className="shrink-0 font-mono text-[12px] text-text-tertiary">{formatDurationDays(milestone.durationDays)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
                    style={{
                      width: mounted ? `${Math.min(100, Math.max(0, milestone.percentage))}%` : "0%",
                      transitionDelay: `${Math.min(index, 10) * 60}ms`
                    }}
                  />
                </div>
              </button>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-out",
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden">
                  <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">{milestone.description}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
