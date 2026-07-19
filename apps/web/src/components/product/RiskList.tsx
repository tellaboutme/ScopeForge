"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { ProjectAnalysis } from "@/types/analysis";
import { SEVERITY_LABEL, SEVERITY_TONE } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

export interface RiskListProps {
  risks?: ProjectAnalysis["risks"];
  loading?: boolean;
}

export function RiskList({ risks, loading }: RiskListProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading || !risks) {
    return (
      <div className="h-full rounded-card border border-border-default bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (risks.length === 0) {
    return (
      <div className="flex h-full flex-col items-start gap-3 rounded-card border border-border-default bg-surface-1 p-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-control bg-success-muted text-success" aria-hidden="true">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">Key risks</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
            No critical risks were detected in this brief. This does not guarantee a smooth delivery — confirm scope
            directly with the client.
          </p>
        </div>
      </div>
    );
  }

  const visible = expanded ? risks : risks.slice(0, 3);

  return (
    <div className="h-full rounded-card border border-border-default bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">Key risks</h3>
        <Badge tone="danger">
          <span className="font-mono">{risks.length}</span> found
        </Badge>
      </div>

      <ul className="mt-3 flex flex-col gap-4">
        {visible.map((risk, index) => (
          <li key={`${risk.title}-${index}`}>
            <div className="flex items-center gap-2">
              <Badge tone={SEVERITY_TONE[risk.severity]}>{SEVERITY_LABEL[risk.severity]}</Badge>
              <span className="min-w-0 truncate text-[13.5px] font-semibold text-text-primary">{risk.title}</span>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-text-secondary">{risk.description}</p>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="overflow-hidden">
                <p className="mt-1.5 text-[12px] leading-relaxed text-text-tertiary">
                  <span className="font-medium text-text-secondary">Mitigation: </span>
                  {risk.mitigation}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="mt-4 text-[13px] font-medium text-accent transition-colors duration-150 hover:text-accent-hover"
      >
        {expanded ? "Show fewer" : "View mitigations"}
      </button>
    </div>
  );
}
