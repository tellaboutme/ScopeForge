"use client";

import type { ProjectAnalysis } from "@/types/analysis";
import { formatCurrency, formatCurrencyRange } from "@/lib/format";
import { useCountUp } from "@/lib/use-count-up";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

export interface BudgetCardProps {
  estimate?: ProjectAnalysis["estimate"];
  loading?: boolean;
}

export function BudgetCard({ estimate, loading }: BudgetCardProps) {
  const animatedAmount = useCountUp(estimate?.budgetRecommended ?? 0, 900);

  if (loading || !estimate) {
    return (
      <div className="rounded-card border border-border-default bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-10 w-32" />
        <Skeleton className="mt-3 h-3 w-48" />
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border-default bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">Recommended price</h3>
        <Badge tone="neutral">Fixed</Badge>
      </div>

      <p className="mt-3 font-mono text-[38px] font-semibold leading-[40px] tabular-nums text-text-primary sm:text-[42px] sm:leading-[44px]">
        {formatCurrency(animatedAmount, estimate.currency)}
      </p>

      <p className="mt-3 text-[12px] text-text-tertiary">
        Expected range {formatCurrencyRange(estimate.budgetMin, estimate.budgetMax, estimate.currency)}
      </p>
    </div>
  );
}
