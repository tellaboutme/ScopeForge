"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { Severity, VerdictDecision } from "@/types/analysis";
import { PLATFORM_OPTIONS } from "@/lib/constants";
import { SEVERITY_LABEL, VERDICT_LABEL } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

export interface HistoryFilterState {
  verdicts: VerdictDecision[];
  risks: Severity[];
  platform: string | null;
}

export const EMPTY_HISTORY_FILTERS: HistoryFilterState = { verdicts: [], risks: [], platform: null };

const VERDICT_ORDER: VerdictDecision[] = ["take", "negotiate", "skip"];
const RISK_ORDER: Severity[] = ["low", "medium", "high"];

export function activeFilterCount(filters: HistoryFilterState): number {
  return filters.verdicts.length + filters.risks.length + (filters.platform ? 1 : 0);
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-150",
        active ? "bg-accent-muted text-accent-hover" : "bg-surface-2 text-text-secondary hover:bg-surface-hover"
      )}
    >
      {children}
    </button>
  );
}

export function HistoryFilters({
  filters,
  onApply
}: {
  filters: HistoryFilterState;
  onApply: (next: HistoryFilterState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  const count = activeFilterCount(filters);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {count > 0 ? (
            <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 font-mono text-[11px] font-semibold text-white">
              {count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold text-text-primary">Filter analyses</p>
          <button
            type="button"
            onClick={() => setDraft(EMPTY_HISTORY_FILTERS)}
            className="text-[12.5px] font-medium text-accent transition-colors duration-150 hover:text-accent-hover"
          >
            Clear
          </button>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Verdict</p>
          <div className="flex flex-wrap gap-1.5">
            {VERDICT_ORDER.map((value) => (
              <FilterChip
                key={value}
                active={draft.verdicts.includes(value)}
                onClick={() => setDraft((current) => ({ ...current, verdicts: toggle(current.verdicts, value) }))}
              >
                {VERDICT_LABEL[value]}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Risk level</p>
          <div className="flex flex-wrap gap-1.5">
            {RISK_ORDER.map((value) => (
              <FilterChip
                key={value}
                active={draft.risks.includes(value)}
                onClick={() => setDraft((current) => ({ ...current, risks: toggle(current.risks, value) }))}
              >
                {SEVERITY_LABEL[value]}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Platform</p>
          <Select
            aria-label="Platform"
            value={draft.platform ?? "all"}
            onChange={(value) => setDraft((current) => ({ ...current, platform: value === "all" ? null : value }))}
            options={[{ value: "all", label: "All platforms" }, ...PLATFORM_OPTIONS.map((platform) => ({ value: platform, label: platform }))]}
          />
        </div>

        <Button
          variant="primary"
          className="mt-5 w-full"
          onClick={() => {
            onApply(draft);
            setOpen(false);
          }}
        >
          Apply filters
        </Button>
      </PopoverContent>
    </Popover>
  );
}
