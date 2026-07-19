"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface SectionFailureProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Typed fallback for a single report section. Per docs/PAGE_SPECS.md, a failed
 * secondary section must never hide the verdict, estimate, or risks — each
 * section renders its own SectionFailure independently rather than the page
 * failing as a whole.
 */
export function SectionFailure({ title = "This section couldn't load", message, onRetry, className }: SectionFailureProps) {
  return (
    <div className={`flex h-full flex-col items-start gap-3 rounded-card border border-border-default bg-surface-1 p-5 ${className ?? ""}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-control bg-danger-muted text-danger" aria-hidden="true">
        <AlertTriangle className="h-4 w-4" />
      </span>
      <div>
        <h3 className="text-[14px] font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
