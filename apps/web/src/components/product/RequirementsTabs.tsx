"use client";

import { CheckCircle2, HelpCircle, Sparkles, type LucideIcon } from "lucide-react";
import type { ProjectAnalysis } from "@/types/analysis";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";

type RequirementKey = keyof ProjectAnalysis["requirements"];

const TAB_META: Record<RequirementKey, { label: string; icon: LucideIcon; tone: string }> = {
  explicit: { label: "Explicit", icon: CheckCircle2, tone: "text-success" },
  hidden: { label: "Hidden", icon: Sparkles, tone: "text-accent" },
  assumptions: { label: "Assumptions", icon: HelpCircle, tone: "text-info" }
};

const TAB_ORDER: RequirementKey[] = ["explicit", "hidden", "assumptions"];

export interface RequirementsTabsProps {
  requirements?: ProjectAnalysis["requirements"];
  loading?: boolean;
}

export function RequirementsTabs({ requirements, loading }: RequirementsTabsProps) {
  if (loading || !requirements) {
    return (
      <div className="h-full rounded-card border border-border-default bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-48 rounded-control" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-11 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-card border border-border-default bg-surface-1 p-5">
      <Tabs defaultValue="explicit" className="flex flex-1 flex-col">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">Project scope</h3>
          <TabsList>
            {TAB_ORDER.map((key) => (
              <TabsTrigger key={key} value={key}>
                {TAB_META[key].label}
                <span className="ml-1.5 font-mono text-[11px] text-text-tertiary">{requirements[key].length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {TAB_ORDER.map((key) => {
          const meta = TAB_META[key];
          const Icon = meta.icon;
          const items = requirements[key];
          return (
            <TabsContent key={key} value={key} className="mt-4 flex-1 focus-visible:outline-none">
              {items.length === 0 ? (
                <p className="text-[13px] text-text-tertiary">None identified.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {items.map((item, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2.5 rounded-control border border-border-subtle bg-surface-2 px-3 py-2.5"
                    >
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.tone}`} aria-hidden="true" />
                      <span className="text-[13px] leading-relaxed text-text-secondary">{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
