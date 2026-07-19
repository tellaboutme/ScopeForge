import type { ReactNode } from "react";
import type { ProjectAnalysis } from "@/types/analysis";
import { VERDICT_LABEL, VERDICT_TONE, qualitativeLevel, type ScoreTone } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

const TONE_GLOW: Record<ScoreTone, string> = {
  success: "rgba(53, 214, 159, 0.14)",
  warning: "rgba(241, 185, 85, 0.14)",
  danger: "rgba(243, 107, 120, 0.14)",
  info: "rgba(99, 167, 255, 0.14)"
};

export interface VerdictCardProps {
  verdict?: ProjectAnalysis["verdict"];
  score?: ProjectAnalysis["score"];
  loading?: boolean;
}

function Stat({ value, label, mono = false }: { value: ReactNode; label: string; mono?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-2 py-1 text-center">
      <span
        className={cn(
          "text-[20px] font-semibold leading-tight text-text-primary sm:text-[26px]",
          mono && "font-mono"
        )}
      >
        {value}
      </span>
      <span className="mt-1 text-[11px] text-text-tertiary sm:text-[12px]">{label}</span>
    </div>
  );
}

export function VerdictCard({ verdict, score, loading }: VerdictCardProps) {
  if (loading || !verdict || !score) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden rounded-modal border border-border-default bg-surface-1 p-6 sm:p-8">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-6 h-10 w-3/4 sm:h-12" />
        <Skeleton className="mt-4 h-4 w-full max-w-[560px]" />
        <Skeleton className="mt-2 h-4 w-2/3 max-w-[420px]" />
        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border-subtle pt-5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </div>
    );
  }

  const tone = VERDICT_TONE[verdict.decision];
  const portfolioLabel = qualitativeLevel(score.portfolioValue);
  const riskLabel = qualitativeLevel(score.risk);

  return (
    <div className="relative h-full overflow-hidden rounded-modal border border-border-default bg-surface-1 p-6 sm:p-8">
      {/* A single non-looping settle-in (D-motion-polish) — this used to pulse
          forever (animate-verdict-glow, 5s infinite). The ambient light behind
          the verdict is still real, it just no longer competes for attention
          with the number/decision the user is actually reading. */}
      <div
        className="animate-verdict-settle pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(60% 55% at 28% -10%, ${TONE_GLOW[tone]}, transparent 70%)` }}
        aria-hidden="true"
      />
      {/* flex flex-col + mt-auto on the stat row (D034): the right-hand
          column (ScoreCard + BudgetCard stacked) can be taller than this
          card's own natural content height, and the grid row stretches both
          columns to match (items-stretch, the default) — without h-full +
          flex here, this card's visible border/background stayed at its
          natural height while the grid cell around it grew, leaving a
          misaligned gap below it. Anchoring the stat row to the bottom also
          reads more intentional than leaving it floating mid-card. */}
      <div className="relative flex h-full flex-col">
        {/* Top-right, own row (not a flex-col direct child) — a flex-col
            parent's default align-items:stretch was forcing this badge to
            fill the card's full width when it sat directly in that column;
            a nested justify-end row sizes it to its content instead. */}
        <div className="flex justify-end pb-1">
          <Badge tone={tone} dot>
            Verdict
          </Badge>
        </div>

        <h2 className="font-display mt-3 text-[42px] font-normal uppercase leading-[44px] tracking-wide text-text-primary sm:text-[54px] sm:leading-[56px] sm:tracking-[0.01em]">
          {VERDICT_LABEL[verdict.decision]}
        </h2>

        <p className="mt-4 max-w-[640px] text-[15px] leading-relaxed text-text-secondary">{verdict.summary}</p>

        <div className="mt-auto grid grid-cols-3 divide-x divide-border-subtle border-t border-border-subtle pt-5">
          <Stat value={`${verdict.confidence}%`} label="Success probability" mono />
          <Stat value={portfolioLabel} label="Portfolio value" />
          <Stat value={riskLabel} label="Risk level" />
        </div>
      </div>
    </div>
  );
}
