"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
// "motion/react-m" (like framer-motion/m, which it re-exports) doesn't
// export a single `m` namespace object — it exports each element
// (`div`, `span`, ...) as its own named export. A namespace import
// reconstructs the `m.div` / `m.span` call shape used everywhere below.
import * as m from "motion/react-m";
import { FileText, History as HistoryIcon, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/product/PageHeader";
import { BriefEditor } from "@/components/product/BriefEditor";
import { ClientDetailsFields } from "@/components/product/ClientDetailsFields";
import { AnalysisSettings } from "@/components/product/AnalysisSettings";
import { AnalyzeContextPanel } from "@/components/product/AnalyzeContextPanel";
import { AnalysisPipeline, buildPipelineStages } from "@/components/product/AnalysisPipeline";
import { AnalysisErrorState } from "@/components/product/AnalysisErrorState";
import { UsageLimitState } from "@/components/product/UsageLimitState";
import { EmailVerificationRequiredState } from "@/components/product/EmailVerificationRequiredState";
import { Button, buttonClasses } from "@/components/ui/Button";
import { MIN_BRIEF_WORDS } from "@/lib/format";
import { extractConceptChips, generateAnalysisId } from "@/lib/concepts";
import {
  EXAMPLE_BRIEF,
  type ExperienceLevel,
  type AnalysisCurrency,
  type AnalysisDepth,
  type ClientBudgetType,
  type ClientDeadlineUnit
} from "@/lib/constants";
import { settingsStore } from "@/lib/settings-store";
import { flowVariants } from "@/lib/motion";
import { analyzeProject, ApiError } from "@/lib/api";
import { analysisStore } from "@/lib/analysis-store";
import { historyStore, summarizeAnalysis } from "@/lib/history-store";
import { useAuth } from "@/lib/auth-store";

type FlowState = "editing" | "pipeline" | "error" | "limit_reached" | "email_unverified";

// A single POST /v1/analyses call has no server-sent progress events, so
// there's no real per-stage signal to drive this from. Advance through all
// but the last stage on a short visual timer, then hold on the last stage
// until the actual response resolves — this way the UI never claims a
// completion percentage the backend hasn't actually reached (R005).
const STAGE_INTERVAL_MS = 550;

export default function AnalyzePage() {
  const router = useRouter();
  const { refreshUsage } = useAuth();
  const [brief, setBrief] = useState("");
  // Preselected from the user's saved /settings defaults (falls back to the
  // built-in defaults when nothing has been saved yet). See settings-store.ts.
  // Loaded once via a single lazy initializer — this used to call
  // settingsStore.load() three separate times (once per field), each doing
  // its own localStorage.getItem + JSON.parse + object spread over the same
  // underlying blob for no reason; reading it once and destructuring is the
  // same result for a third of the work, on every first mount of this page.
  const [initialSettings] = useState(() => settingsStore.load());
  const [experience, setExperience] = useState<ExperienceLevel>(initialSettings.experience);
  const [currency, setCurrency] = useState<AnalysisCurrency>(initialSettings.currency);
  const [depth, setDepth] = useState<AnalysisDepth>(initialSettings.depth);
  // Structured client-stated facts (D029) — plain strings for controlled
  // inputs, parsed on submit. Both optional; an unparsable/empty value is
  // simply omitted from the request rather than blocking submission.
  const [clientBudget, setClientBudget] = useState("");
  const [clientBudgetType, setClientBudgetType] = useState<ClientBudgetType>("fixed");
  const [clientDeadlineDays, setClientDeadlineDays] = useState("");
  const [clientDeadlineUnit, setClientDeadlineUnit] = useState<ClientDeadlineUnit>("days");
  const [flow, setFlow] = useState<FlowState>("editing");
  const [stageIndex, setStageIndex] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState("");
  const [conceptChips, setConceptChips] = useState<string[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const wordCount = brief.trim().length === 0 ? 0 : brief.trim().split(/\s+/).length;
  const stages = buildPipelineStages(wordCount);
  const stageCount = stages.length;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const startAnalysis = useCallback(
    (depthOverride?: AnalysisDepth) => {
      if (wordCount < MIN_BRIEF_WORDS) {
        setValidationError(`Add a bit more detail — at least ${MIN_BRIEF_WORDS} words are needed for a useful analysis.`);
        return;
      }
      const effectiveDepth = depthOverride ?? depth;
      if (depthOverride) setDepth(depthOverride);
      setValidationError(null);
      setRequestError(null);
      setAnalysisId(generateAnalysisId());
      setConceptChips(extractConceptChips(brief));
      setStageIndex(0);
      setFlow("pipeline");

      const requestId = ++requestIdRef.current;
      let index = 0;
      const advance = () => {
        timeoutRef.current = setTimeout(() => {
          index += 1;
          setStageIndex(Math.min(index, stageCount - 1));
          if (index < stageCount - 1) advance();
        }, STAGE_INTERVAL_MS);
      };
      advance();

      const parsedBudget = Number(clientBudget);
      const parsedDeadlineValue = Number(clientDeadlineDays);
      // Deadline unit is a client-side-only convenience (D040) — the
      // backend schema only ever takes days, so "months" is converted here
      // before the request is built, not sent as a separate field.
      const parsedDeadlineDays = clientDeadlineUnit === "months" ? parsedDeadlineValue * 30 : parsedDeadlineValue;
      // Freelancer identity is a /settings default, not a per-analysis
      // input — read fresh at submit time so a just-saved name/bio takes
      // effect immediately (D030).
      const profile = settingsStore.load();

      analyzeProject({
        description: brief,
        experienceLevel: experience,
        currency,
        depth: effectiveDepth,
        clientBudget: clientBudget.trim() !== "" && Number.isFinite(parsedBudget) && parsedBudget >= 0 ? parsedBudget : undefined,
        clientBudgetType,
        clientDeadlineDays:
          clientDeadlineDays.trim() !== "" && Number.isFinite(parsedDeadlineDays) && parsedDeadlineDays >= 1
            ? Math.round(parsedDeadlineDays)
            : undefined,
        freelancerName: profile.freelancerName.trim() !== "" ? profile.freelancerName.trim() : undefined,
        freelancerBio: profile.freelancerBio.trim() !== "" ? profile.freelancerBio.trim() : undefined,
        // D047: preferred stack from /settings is passed to the prompt so the
        // proposal (especially the Technical variant) references it.
        preferredStack: profile.preferredStack.trim() !== "" ? profile.preferredStack.trim() : undefined
      })
        .then((analysis) => {
          if (requestId !== requestIdRef.current) return; // superseded by a retry or cancel
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          analysisStore.save(analysis);
          historyStore.add(summarizeAnalysis(analysis));
          void refreshUsage(); // sidebar usage plaque should reflect this analysis immediately (D039)
          router.push(`/analysis/${analysis.id}`);
        })
        .catch((error: unknown) => {
          if (requestId !== requestIdRef.current) return;
          if (timeoutRef.current) clearTimeout(timeoutRef.current);

          // Hitting a plan quota (D037) isn't a failure — it's an expected
          // boundary with a real next step (upgrade), so it gets its own
          // flow state and UI rather than folding into the generic error
          // branch below, which frames things as something worth retrying.
          if (error instanceof ApiError && error.code === "usage_limit_reached") {
            setRequestError(error.message);
            setFlow("limit_reached");
            return;
          }

          // D058: a signed-in account with an unverified email — same
          // reasoning as usage_limit_reached above, this is an expected
          // gate with one real next step (verify), not a failure to offer
          // a blind "retry" on.
          if (error instanceof ApiError && error.code === "email_verification_required") {
            setRequestError(error.message);
            setFlow("email_unverified");
            return;
          }

          const message =
            error instanceof ApiError
              ? error.code === "network_error"
                ? "Could not reach the analysis API. Make sure it is running, then retry."
                : error.message
              : "Something went wrong while analyzing this project.";
          setRequestError(message);
          setFlow("error");
        });
    },
    [
      brief,
      wordCount,
      stageCount,
      experience,
      currency,
      depth,
      clientBudget,
      clientBudgetType,
      clientDeadlineDays,
      clientDeadlineUnit,
      router,
      refreshUsage
    ]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && flow === "editing") {
        event.preventDefault();
        startAnalysis();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flow, startAnalysis]);

  function handleCancel() {
    requestIdRef.current += 1; // invalidate the in-flight request's callbacks
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setFlow("editing");
  }

  function handleLoadExample() {
    setBrief(EXAMPLE_BRIEF);
    setValidationError(null);
  }

  function handleClearBrief() {
    setBrief("");
    setValidationError(null);
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {flow === "pipeline" ? (
        <m.div key="pipeline" variants={flowVariants} initial="initial" animate="animate" exit="exit">
          <PageHeader
            eyebrow="ScopeForge"
            title="Analyzing project"
            description="Your brief is saved. We are structuring scope, economics, and risk."
            actions={
              <button
                type="button"
                onClick={handleCancel}
                className="text-[13px] font-medium text-text-tertiary transition-colors duration-150 hover:text-text-primary"
              >
                Cancel
              </button>
            }
          />
          <AnalysisPipeline stages={stages} currentStageIndex={stageIndex} analysisId={analysisId} conceptChips={conceptChips} />
        </m.div>
      ) : flow === "limit_reached" ? (
        <m.div key="limit_reached" variants={flowVariants} initial="initial" animate="animate" exit="exit">
          <PageHeader eyebrow="ScopeForge" title="New analysis" description="Your input is safe." />
          <UsageLimitState message={requestError ?? undefined} onBackToEditor={() => setFlow("editing")} />
        </m.div>
      ) : flow === "email_unverified" ? (
        <m.div key="email_unverified" variants={flowVariants} initial="initial" animate="animate" exit="exit">
          <PageHeader eyebrow="ScopeForge" title="New analysis" description="Your input is safe." />
          <EmailVerificationRequiredState message={requestError ?? undefined} onBackToEditor={() => setFlow("editing")} />
        </m.div>
      ) : flow === "error" ? (
        <m.div key="error" variants={flowVariants} initial="initial" animate="animate" exit="exit">
          <PageHeader
            eyebrow="ScopeForge"
            title="New analysis"
            description="Your input is safe. Retry without re-entering the project brief."
          />
          <AnalysisErrorState
            brief={brief}
            message={requestError ?? undefined}
            onRetryDetailed={() => startAnalysis("detailed")}
            onBackToEditor={() => setFlow("editing")}
            onSwitchToQuick={() => startAnalysis("quick")}
          />
        </m.div>
      ) : (
        <m.div key="editing" variants={flowVariants} initial="initial" animate="animate" exit="exit">
          <PageHeader
            eyebrow="ScopeForge"
            title="New analysis"
            description="Paste a client brief and get a complete project breakdown."
            actions={
              <>
                <Button variant="secondary" size="sm" onClick={handleLoadExample}>
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Load example
                </Button>
                <Link href="/history" aria-label="History" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  <HistoryIcon className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <BriefEditor value={brief} onChange={setBrief} depth={depth} onClear={handleClearBrief} />

              <ClientDetailsFields
                budget={clientBudget}
                onBudgetChange={setClientBudget}
                budgetType={clientBudgetType}
                onBudgetTypeChange={setClientBudgetType}
                currency={currency}
                deadlineDays={clientDeadlineDays}
                onDeadlineDaysChange={setClientDeadlineDays}
                deadlineUnit={clientDeadlineUnit}
                onDeadlineUnitChange={setClientDeadlineUnit}
              />

              <AnalysisSettings
                experience={experience}
                onExperienceChange={setExperience}
                currency={currency}
                onCurrencyChange={setCurrency}
                depth={depth}
                onDepthChange={setDepth}
              />

              {validationError ? (
                <p role="alert" className="mt-3 text-[13px] text-danger">
                  {validationError}
                </p>
              ) : null}

              <Button variant="primary" className="mt-4 w-full" onClick={() => startAnalysis()}>
                <span className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Analyze project
                  </span>
                  <span className="text-xs opacity-80">⌘ Enter</span>
                </span>
              </Button>
            </div>

            <div className="lg:col-span-4">
              <AnalyzeContextPanel />
            </div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
