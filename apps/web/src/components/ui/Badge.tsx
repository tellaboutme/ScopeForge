import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "accent";

const toneClasses: Record<BadgeTone, string> = {
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  danger: "bg-danger-muted text-danger",
  info: "bg-info-muted text-info",
  neutral: "bg-surface-2 text-text-secondary border border-border-default",
  accent: "bg-accent-muted text-accent-hover"
};

const dotClasses: Record<BadgeTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-text-tertiary",
  accent: "bg-accent"
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
  /** Extra classes for the dot only (e.g. a blink animation) — see VerdictCard's "Verdict" badge. */
  dotClassName?: string;
  children: ReactNode;
}

export function Badge({ tone = "neutral", dot = false, dotClassName, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {dot ? <StatusDot tone={tone} className={dotClassName} /> : null}
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral", className }: { tone?: BadgeTone; className?: string }) {
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClasses[tone], className)} aria-hidden="true" />;
}
