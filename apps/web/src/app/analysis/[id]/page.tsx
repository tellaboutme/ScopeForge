"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Plus, SearchX } from "lucide-react";
import type { ProjectAnalysis } from "@/types/analysis";
import { mockAnalysis } from "@/lib/mock-analysis";
import { analysisStore } from "@/lib/analysis-store";
import { fetchAnalysis } from "@/lib/api";
import { relativeTimeFromNow } from "@/lib/format";
import { PageHeader } from "@/components/product/PageHeader";
import { VerdictCard } from "@/components/product/VerdictCard";
import { ScoreCard } from "@/components/product/ScoreCard";
import { BudgetCard } from "@/components/product/BudgetCard";
import { ExportMenu } from "@/components/product/ExportMenu";
import { ReportOverflowMenu } from "@/components/product/ReportOverflowMenu";
import { buttonClasses } from "@/components/ui/Button";
import dynamic from "next/dynamic";
import { ScoreBreakdownSkeleton } from "@/components/product/ScoreBreakdownCard";

// recharts (ScoreBreakdownCard's radar chart) is code-split out of this
// route's initial bundle rather than statically imported (D036, Phase 8
// performance pass) — the card is invisible below the lg breakpoint anyway,
// so there's no reason every visitor's first-load JS should include it.
// ssr:false is safe/correct here: the chart is purely decorative and
// client-only regardless (animated draw-in, no content that needs to exist
// pre-hydration).
const ScoreBreakdownCard = dynamic(
  () => import("@/components/product/ScoreBreakdownCard").then((mod) => mod.ScoreBreakdownCard),
  { ssr: false, loading: () => <ScoreBreakdownSkeleton /> }
);
import { TimelineCard } from "@/components/product/TimelineCard";
import { RiskList } from "@/components/product/RiskList";
import { RequirementsTabs } from "@/components/product/RequirementsTabs";
import { ProposalEditor } from "@/components/product/ProposalEditor";
import { TechStackGrid } from "@/components/product/TechStackGrid";
import { ClientQuestionList } from "@/components/product/ClientQuestionList";

type LoadStatus = "loading" | "loaded" | "missing";

function loadLocal(id: string): ProjectAnalysis | undefined {
  // "demo" is the one seed record every install ships with — it was never
  // POSTed to the API, so it only ever exists as this local fixture.
  if (id === "demo") return mockAnalysis;
  return analysisStore.get(id);
}

export default function AnalysisReportPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  // Always start from "loading" on both the server pass and the first
  // client paint (no lazy localStorage read here) so hydration never
  // mismatches — the actual local/remote lookup only happens in the
  // effect below, which is client-only.
  const [analysis, setAnalysis] = useState<ProjectAnalysis | undefined>(undefined);
  const [status, setStatus] = useState<LoadStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setAnalysis(undefined);

    const local = loadLocal(id);
    if (local) {
      setAnalysis(local);
      setStatus("loaded");
      return;
    }

    fetchAnalysis(id)
      .then((result) => {
        if (cancelled) return;
        analysisStore.save(result);
        setAnalysis(result);
        setStatus("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("missing");
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (status === "missing") {
    return (
      <div>
        <PageHeader eyebrow="ScopeForge" title="Analysis not found" />
        <div className="mt-2 flex flex-col items-center gap-3 rounded-card border border-border-default bg-surface-1 px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-control bg-danger-muted text-danger" aria-hidden="true">
            <SearchX className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold text-text-primary">This analysis could not be found</h2>
            <p className="mx-auto mt-1.5 max-w-[360px] text-[13px] leading-relaxed text-text-secondary">
              It may have been deleted, or it was created in a different browser. Start a new analysis or return to
              your history.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <Link href="/history" className={buttonClasses({ variant: "secondary" })}>
              View history
            </Link>
            <Link href="/analyze" className={buttonClasses({ variant: "primary" })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New analysis
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const loading = status === "loading" || !analysis;
  const subtitle = analysis
    ? [analysis.source.title, analysis.source.platform, `Analyzed ${relativeTimeFromNow(analysis.createdAt)}`]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="ScopeForge"
        title="Project analysis"
        description={subtitle}
        actions={
          <>
            {analysis ? <ExportMenu analysis={analysis} /> : null}
            {analysis ? <ReportOverflowMenu analysis={analysis} /> : null}
            <Link href="/analyze" className={buttonClasses({ variant: "primary", size: "sm" })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">New analysis</span>
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="animate-row-reveal grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <VerdictCard verdict={analysis?.verdict} score={analysis?.score} loading={loading} />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-4">
            <ScoreCard score={analysis?.score} loading={loading} />
            <BudgetCard estimate={analysis?.estimate} loading={loading} />
          </div>
        </div>

        <div className="animate-row-reveal grid grid-cols-1 gap-4 lg:grid-cols-12" style={{ animationDelay: "55ms" }}>
          <div className="lg:col-span-4">
            <ScoreBreakdownCard score={analysis?.score} loading={loading} />
          </div>
          <div className="lg:col-span-5">
            <TimelineCard milestones={analysis?.milestones} estimate={analysis?.estimate} loading={loading} />
          </div>
          <div className="lg:col-span-3">
            <RiskList risks={analysis?.risks} loading={loading} />
          </div>
        </div>

        <div className="animate-row-reveal grid grid-cols-1 gap-4 lg:grid-cols-12" style={{ animationDelay: "110ms" }}>
          <div className="lg:col-span-7">
            <RequirementsTabs requirements={analysis?.requirements} loading={loading} />
          </div>
          <div className="lg:col-span-5">
            <ProposalEditor
              proposal={analysis?.proposal}
              clientQuestions={analysis?.clientQuestions}
              loading={loading}
            />
          </div>
        </div>

        <div className="animate-row-reveal grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2" style={{ animationDelay: "165ms" }}>
          <TechStackGrid techStack={analysis?.techStack} loading={loading} />
          <ClientQuestionList questions={analysis?.clientQuestions} loading={loading} />
        </div>
      </div>
    </div>
  );
}
