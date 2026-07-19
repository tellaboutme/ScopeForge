"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Check, History as HistoryIcon, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/product/PageHeader";
import { HistoryRow } from "@/components/product/HistoryRow";
import { HistoryFilters, EMPTY_HISTORY_FILTERS, type HistoryFilterState } from "@/components/product/HistoryFilters";
import { buttonClasses, Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu";
import { historyStore } from "@/lib/history-store";
import { DURATION, EASE, STAGGER, rowVariants, staggerDelay } from "@/lib/motion";

// Initial-load stagger cap for History specifically overrides
// lib/motion.ts's default 160ms — the spec for this list is tighter
// (<140ms) since rows here are denser and a longer cascade reads as lag on
// a page that's often re-opened just to click one row.
const HISTORY_INITIAL_STAGGER_CAP = 0.14;

type SortKey = "newest" | "oldest" | "score-desc" | "score-asc";

const SORT_LABEL: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "score-desc": "Highest score",
  "score-asc": "Lowest score"
};

const SORT_ORDER: SortKey[] = ["newest", "oldest", "score-desc", "score-asc"];

export default function HistoryPage() {
  const [analyses, setAnalyses] = useState(() => historyStore.list());
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<HistoryFilterState>(EMPTY_HISTORY_FILTERS);
  const [sort, setSort] = useState<SortKey>("newest");

  // True only during the very first paint — after that, row entrances
  // (a row newly matching a search/filter change, or a duplicated row) fade
  // in individually with no inter-row delay, so editing a filter never
  // replays a whole-list cascade. Only the initial populated render gets
  // the short stagger.
  const hasAnimatedInitialRef = useRef(false);
  useEffect(() => {
    hasAnimatedInitialRef.current = true;
  }, []);

  const hasAnyHistory = analyses.length > 0;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = analyses.filter((item) => {
      if (query && !`${item.title} ${item.platform}`.toLowerCase().includes(query)) return false;
      if (filters.verdicts.length > 0 && !filters.verdicts.includes(item.verdict)) return false;
      if (filters.risks.length > 0 && !filters.risks.includes(item.topRiskSeverity)) return false;
      if (filters.platform && item.platform !== filters.platform) return false;
      return true;
    });

    return [...matches].sort((a, b) => {
      switch (sort) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "score-desc":
          return b.score - a.score;
        case "score-asc":
          return a.score - b.score;
      }
    });
  }, [analyses, search, filters, sort]);

  function clearSearchAndFilters() {
    setSearch("");
    setFilters(EMPTY_HISTORY_FILTERS);
  }

  return (
    <div>
      <PageHeader
        eyebrow="ScopeForge"
        title="Analysis history"
        description="Review, search, and compare previously analyzed projects."
        actions={
          <Link href="/analyze" className={buttonClasses({ variant: "primary" })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New analysis
          </Link>
        }
      />

      {!hasAnyHistory ? (
        <EmptyHistory />
      ) : (
        <>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by project or platform"
                aria-label="Search analyses"
                className="pl-10"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <HistoryFilters filters={filters} onApply={setFilters} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm">
                    {SORT_LABEL[sort]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {SORT_ORDER.map((key) => (
                    <DropdownMenuItem key={key} onSelect={() => setSort(key)}>
                      {sort === key ? (
                        <Check className="h-4 w-4 text-accent" aria-hidden="true" />
                      ) : (
                        <span className="h-4 w-4" aria-hidden="true" />
                      )}
                      {SORT_LABEL[key]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-card border border-border-default bg-surface-1">
            <AnimatePresence mode="wait" initial={false}>
              {filtered.length === 0 ? (
                <m.div
                  key="no-matches"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURATION.normal, ease: EASE.standard }}
                >
                  <NoMatches onClear={clearSearchAndFilters} />
                </m.div>
              ) : (
                <m.div
                  key="results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURATION.normal, ease: EASE.standard }}
                >
                  <div className="hidden grid-cols-[48px_minmax(0,1fr)_112px_100px_120px_40px] gap-4 border-b border-border-subtle px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary lg:grid">
                    <span>Score</span>
                    <span>Project</span>
                    <span>Verdict</span>
                    <span>Estimate</span>
                    <span>Timeline</span>
                    <span />
                  </div>
                  <AnimatePresence initial={true}>
                    {filtered.map((analysis, index) => (
                      <m.div
                        key={analysis.id}
                        initial={rowVariants.initial}
                        animate={{
                          ...rowVariants.animate,
                          transition: {
                            ...rowVariants.animate.transition,
                            delay: hasAnimatedInitialRef.current ? 0 : staggerDelay(index, STAGGER.step, HISTORY_INITIAL_STAGGER_CAP)
                          }
                        }}
                        exit={rowVariants.exit}
                      >
                        <HistoryRow
                          analysis={analysis}
                          showBorder={index !== filtered.length - 1}
                          onDelete={(id) => setAnalyses(historyStore.remove(id))}
                          onDuplicate={(id) => setAnalyses(historyStore.duplicate(id))}
                          onRename={(id, title) => setAnalyses(historyStore.rename(id, title))}
                        />
                      </m.div>
                    ))}
                  </AnimatePresence>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyHistory() {
  return (
    <div className="mt-2 flex flex-col items-center gap-3 rounded-card border border-border-default bg-surface-1 px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-control bg-accent-muted text-accent" aria-hidden="true">
        <HistoryIcon className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-[16px] font-semibold text-text-primary">No analyses yet</h2>
        <p className="mx-auto mt-1.5 max-w-[360px] text-[13px] leading-relaxed text-text-secondary">
          Analyze your first client brief to get a verdict, realistic estimate, hidden scope, and ready-to-send
          proposal.
        </p>
      </div>
      <Link href="/analyze" className={buttonClasses({ variant: "primary", className: "mt-2" })}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Analyze a project
      </Link>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-[14px] font-semibold text-text-primary">No analyses match your filters</p>
      <p className="text-[13px] text-text-secondary">Try a different search term or clear the active filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-1 text-[13px] font-medium text-accent transition-colors duration-150 hover:text-accent-hover"
      >
        Clear search and filters
      </button>
    </div>
  );
}
