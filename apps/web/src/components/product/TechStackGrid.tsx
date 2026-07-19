import { BarChart3, Box, CreditCard, Database, Info, Palette, Server, type LucideIcon } from "lucide-react";
import type { ProjectAnalysis } from "@/types/analysis";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  frontend: Box,
  backend: Server,
  database: Database,
  payments: CreditCard,
  ui: Palette,
  charts: BarChart3
};

function iconForCategory(category: string): LucideIcon {
  return CATEGORY_ICON[category.trim().toLowerCase()] ?? Box;
}

export interface TechStackGridProps {
  techStack?: ProjectAnalysis["techStack"];
  loading?: boolean;
}

export function TechStackGrid({ techStack, loading }: TechStackGridProps) {
  if (loading || !techStack) {
    return (
      <div className="h-full rounded-card border border-border-default bg-surface-1 p-5">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <Skeleton key={key} className="h-[112px] w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-card border border-border-default bg-surface-1 p-5">
      <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">Recommended stack</h3>

      {/* overflow-x-hidden (bug fix, round 1, D038): setting only
          overflow-y-auto makes the browser compute overflow-x as "auto"
          too (a CSS spec special-case for a lone overflow-y value) — a
          horizontal scrollbar must never appear here, so it's locked
          explicitly closed rather than left to that implicit default.

          overflow-y-auto, not overflow-y-scroll (round 3, D040 — reverts
          D039's overflow-y-scroll, which fixed the hover flicker but at
          the cost of showing an always-present scrollbar even when a
          single row of cards fits comfortably under max-h-[300px]).
          `auto` is what the user actually wants: no scrollbar at all when
          content fits, a real one only when it genuinely doesn't.

          [contain:layout] (round 3, D040) is the actual fix for the
          original hover-triggered flicker, replacing D038's
          scrollbar-gutter:stable (which only stopped a toggling
          scrollbar's *reflow*, not the toggle itself) and D039's
          overflow-y-scroll (which stopped it by brute-forcing the
          scrollbar always on). CSS transforms are spec'd to never affect
          scrollable overflow, but `contain: layout` makes that isolation
          explicit and browser-independent: it walls this container's own
          layout/scroll-size calculation off from being invalidated by
          anything happening inside it (like a card's hover
          transform/z-index change), without clipping — unlike
          `contain: paint`, it does not cut off the scale animation's
          visual overflow into neighbouring cards' gap space. */}
      <div className="mt-4 grid max-h-[300px] grid-cols-1 gap-3 overflow-x-hidden overflow-y-auto pr-1 [contain:layout] sm:grid-cols-2 lg:grid-cols-3">
        {techStack.map((item) => {
          const Icon = iconForCategory(item.category);
          // D040: the model now generates a `tip` distinct from `reason` — a
          // concrete integration note/caveat meant for the hover tooltip,
          // not a restatement of the always-visible blurb. Older cached
          // records (saved before this field existed) won't have one, so
          // the tooltip falls back to `reason` rather than showing nothing.
          const tipText = item.tip?.trim() || item.reason;
          return (
            <div
              key={item.name}
              className={
                "group relative flex flex-col rounded-card border border-border-subtle bg-surface-2 p-4 " +
                // D045: every other hover effect (lift, border-color, shadow,
                // z-index) removed per explicit user request — the only thing
                // that still happens on hover is a smooth, transitioned
                // background-color change.
                "transition-colors duration-200 ease-[var(--ease-standard)] hover:bg-surface-hover"
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent-muted text-accent">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-text-primary">{item.name}</p>
                    <p className="truncate text-[11px] text-text-tertiary">{item.category}</p>
                  </div>
                </div>
                <Tooltip label={tipText}>
                  <button
                    type="button"
                    aria-label={`Why ${item.name}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-tertiary opacity-0 transition-[opacity,color,background-color] duration-150 ease-[var(--ease-standard)] hover:bg-surface-hover hover:text-accent focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 group-hover:opacity-100"
                  >
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </Tooltip>
              </div>
              <p className="mt-2.5 text-[12px] leading-relaxed text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                {item.reason}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
