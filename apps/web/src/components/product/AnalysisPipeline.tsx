import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { DISTANCE, DURATION, EASE, STAGGER, microSwapVariants, staggerDelay } from "@/lib/motion";

export interface PipelineStage {
  title: string;
  description: string;
  slug: string;
}

export function buildPipelineStages(wordCount: number): PipelineStage[] {
  return [
    {
      title: "Reading project brief",
      description: `Normalized ${wordCount} words and detected platform context.`,
      slug: "reading_brief"
    },
    {
      title: "Extracting requirements",
      description: "Found 6 explicit and 5 hidden requirements.",
      slug: "extracting_requirements"
    },
    {
      title: "Estimating scope and budget",
      description: "Comparing complexity, experience level, and risk.",
      slug: "estimate_scope_and_budget"
    },
    {
      title: "Detecting delivery risks",
      description: "Checking ambiguity and implementation edge cases.",
      slug: "detecting_risks"
    },
    {
      title: "Preparing client response",
      description: "Generating clarification questions and proposal.",
      slug: "preparing_response"
    }
  ];
}

type StageStatus = "done" | "current" | "pending";

// Icon swaps (pending -> current -> done) are the one place per row that's
// allowed to animate, and only on the transition itself — not continuously.
// The "current" state used to use `animate-pulse` (a perpetual loop); it's
// now a static accent ring so a stage that sits "current" for a while (slow
// network, longer brief) doesn't turn into background motion the eye keeps
// getting pulled back to.
function StageIcon({ status, position }: { status: StageStatus; position: number }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {status === "done" ? (
        <m.span
          key="done"
          variants={microSwapVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-muted text-success"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </m.span>
      ) : status === "current" ? (
        <m.span
          key="current"
          variants={microSwapVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent-muted text-accent shadow-[0_0_0_3px_rgba(124,92,255,0.12)]"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </m.span>
      ) : (
        <m.span
          key="pending"
          variants={microSwapVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-default text-[11px] text-text-tertiary"
        >
          {position}
        </m.span>
      )}
    </AnimatePresence>
  );
}

export interface AnalysisPipelineProps {
  stages: PipelineStage[];
  currentStageIndex: number;
  analysisId: string;
  conceptChips: string[];
}

export function AnalysisPipeline({ stages, currentStageIndex, analysisId, conceptChips }: AnalysisPipelineProps) {
  const progressPercent = Math.min(100, Math.round(((currentStageIndex + 0.5) / stages.length) * 100));
  const currentSlug = stages[currentStageIndex]?.slug ?? "done";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-card border border-border-default bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold leading-[20px] text-text-primary">Analysis pipeline</h2>
          <Badge tone="accent">In progress</Badge>
        </div>

        <ol className="mt-4 flex flex-col">
          {stages.map((stage, index) => {
            const status: StageStatus = index < currentStageIndex ? "done" : index === currentStageIndex ? "current" : "pending";
            const isLast = index === stages.length - 1;
            return (
              <li key={stage.slug} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <StageIcon status={status} position={index + 1} />
                  {!isLast ? <div className="w-px flex-1 bg-border-subtle" style={{ minHeight: 22 }} /> : null}
                </div>
                <div className={cn("min-w-0 pb-5", isLast && "pb-0")}>
                  <p className={cn("text-[13px] font-medium", status === "pending" ? "text-text-tertiary" : "text-text-primary")}>
                    {stage.title}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-text-tertiary">{stage.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="rounded-card border border-border-default bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold leading-[20px] text-text-primary">Live extraction</h2>
          <span className="font-mono text-[12px] text-text-tertiary">{analysisId}</span>
        </div>

        {/* Progress-bar width animation is pre-existing (D019) and preserved as-is — a
            continuous CSS transition on `width`, not a Motion-driven value. */}
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Detected project shape</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {conceptChips.map((chip, index) => (
            <m.span
              key={chip}
              initial={{ opacity: 0, y: DISTANCE.small }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.normal, ease: EASE.standard, delay: staggerDelay(index, STAGGER.step, STAGGER.maxTotal) }}
              className={cn(
                "rounded-full px-2.5 py-1 text-[12px] font-medium",
                index === 0 ? "bg-accent-muted text-accent-hover" : "bg-surface-2 text-text-secondary"
              )}
            >
              {chip}
            </m.span>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-1.5 rounded-control border border-border-subtle bg-surface-2 p-3.5 font-mono text-[12px] leading-relaxed">
          <div className="flex items-center justify-between gap-4">
            <span className="text-text-tertiary">project_type</span>
            <span className="truncate text-text-secondary">{conceptChips[0] ?? "Custom application"}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-text-tertiary">explicit_scope</span>
            <span className="text-text-secondary">6 requirements</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-text-tertiary">hidden_scope</span>
            <span className="text-text-secondary">5 likely requirements</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-text-tertiary">current_stage</span>
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={currentSlug}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DURATION.micro, ease: EASE.standard }}
                className="truncate text-accent"
              >
                {currentSlug}
              </m.span>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-tertiary">
          <span>Your original brief remains editable after failure.</span>
          <span>Usually under a minute</span>
        </div>
      </div>
    </div>
  );
}
