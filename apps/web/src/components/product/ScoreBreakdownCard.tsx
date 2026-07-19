"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ProjectAnalysis } from "@/types/analysis";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { Skeleton } from "@/components/ui/Skeleton";

export interface ScoreBreakdownCardProps {
  score?: ProjectAnalysis["score"];
  loading?: boolean;
}

function RadarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { factor: string; value: number } }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-control border border-border-default bg-surface-2 px-2.5 py-1.5 text-xs shadow-[0_8px_20px_rgba(2,3,10,0.5)]">
      <span className="text-text-secondary">{point.factor}</span>{" "}
      <span className="font-mono font-medium text-text-primary">{point.value}/10</span>
    </div>
  );
}

/**
 * Matches ScoreBreakdownCard's own loading state exactly. Exported
 * separately (D036, Phase 8 performance pass) so it can also serve as the
 * `next/dynamic` loading fallback at both call sites — the recharts-backed
 * card is code-split out of the initial bundle (see the dynamic() wrapper in
 * /analysis/[id] and /design-system), and this skeleton needs to render
 * before that chunk has even been fetched, not just before `score` arrives.
 */
export function ScoreBreakdownSkeleton() {
  return (
    <div className="hidden h-full flex-col rounded-card border border-border-default bg-surface-1 p-5 lg:flex">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Skeleton className="h-[320px] w-[320px] rounded-full" />
      </div>
    </div>
  );
}

/**
 * Radar chart of the five 0-10 sub-scores. Removed entirely on mobile
 * (ui-reference/png/13-report-mobile.png) rather than swapped for bars —
 * the mobile reference simply omits this card. Statically importing this
 * component pulls all of `recharts` into every route that renders it even
 * though the chart itself is invisible below `lg` — call sites should
 * `next/dynamic` it (see ScoreBreakdownSkeleton above) rather than a plain
 * import, so recharts is code-split instead of part of the initial bundle.
 */
export function ScoreBreakdownCard({ score, loading }: ScoreBreakdownCardProps) {
  const reducedMotion = useReducedMotion();

  if (loading || !score) {
    return <ScoreBreakdownSkeleton />;
  }

  const data = [
    { factor: "Profit", value: score.profitability },
    { factor: "Clarity", value: score.clarity },
    { factor: "Portfolio", value: score.portfolioValue },
    { factor: "Complexity", value: score.complexity },
    { factor: "Risk", value: score.risk }
  ];

  return (
    <div className="hidden h-full flex-col rounded-card border border-border-default bg-surface-1 p-5 lg:flex">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">Score breakdown</h3>
        <span className="text-[12px] text-text-tertiary">5 factors</span>
      </div>

      {/* D049: the chart is vertically centered in the remaining card space.
          `flex-1 min-h-0` lets this box grow and shrink with the row so the
          card collapses back when the sibling Key risks card does (Show fewer)
          — the actual bug being fixed was that without min-h-0 the recharts
          SVG's rendered height pinned the flex item open, so the whole row
          stayed stuck tall after collapsing. `items-center` keeps the radar
          centered (rather than stranded at the top) when the row is taller
          than the chart. The inner box is capped at a max height so the radar
          is a consistent, prominent size (bigger than the old fixed 210px box)
          and never has to re-measure on the row's height change — which is
          what recharts' ResponsiveContainer handles unreliably. */}
      <div className="mt-2 flex w-full flex-1 min-h-0 items-center justify-center overflow-hidden">
        <div className="aspect-square w-full max-w-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="80%" margin={{ top: 10, right: 14, bottom: 10, left: 14 }}>
              <defs>
                <radialGradient id="scoreRadarFill" cx="50%" cy="50%" r="75%">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.38} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.04} />
                </radialGradient>
              </defs>
              <PolarGrid stroke="var(--color-border-default)" />
              <PolarAngleAxis dataKey="factor" tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
              <Radar
                dataKey="value"
                stroke="var(--color-accent)"
                fill="url(#scoreRadarFill)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--color-accent)", stroke: "var(--color-surface-1)", strokeWidth: 2 }}
                activeDot={{ r: 5, fill: "var(--color-accent-hover)", stroke: "var(--color-surface-1)", strokeWidth: 2 }}
                isAnimationActive={!reducedMotion}
                animationDuration={650}
                animationEasing="ease-out"
              />
              <Tooltip content={<RadarTooltip />} cursor={{ stroke: "var(--color-border-default)" }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <ul className="sr-only">
        {data.map((item) => (
          <li key={item.factor}>
            {item.factor}: {item.value} of 10
          </li>
        ))}
      </ul>
    </div>
  );
}
