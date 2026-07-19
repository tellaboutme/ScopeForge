"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { ProjectAnalysis } from "@/types/analysis";
import { cn } from "@/lib/cn";
import { applyProposalName, stripMarkdown } from "@/lib/format";
import type { ProposalTone } from "@/lib/api";
import { settingsStore } from "@/lib/settings-store";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Skeleton } from "@/components/ui/Skeleton";

// D047: the analysis now generates three complete proposal variants up front
// (neutral base + Confident + Technical). These pills single-select the
// communication style — neither selected shows the neutral base, one selected
// shows that style, and the styles are mutually exclusive. Switching is
// instant: the matching prepared variant is already in the analysis, so
// nothing is fetched or regenerated on click.
const TONE_OPTIONS: Array<{ label: string; value: ProposalTone }> = [
  { label: "Confident", value: "confident" },
  { label: "Technical", value: "technical" }
];

export interface ProposalEditorProps {
  proposal?: ProjectAnalysis["proposal"];
  clientQuestions?: ProjectAnalysis["clientQuestions"];
  loading?: boolean;
}

/** Picks the variant text for the active tone, falling back to the neutral
 * base (`full`) whenever a specific variant is missing — e.g. an older cached
 * analysis saved before D047, which only has `full`. */
function variantFor(proposal: ProjectAnalysis["proposal"], tone: ProposalTone | null): string {
  if (tone === "confident") return proposal.confident || proposal.full;
  if (tone === "technical") return proposal.technical || proposal.full;
  return proposal.full;
}

export function ProposalEditor({ proposal, clientQuestions, loading }: ProposalEditorProps) {
  // Single-select, default null (neutral base) — per D047 the styles are
  // mutually exclusive and both start off.
  const [activeTone, setActiveTone] = useState<ProposalTone | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [includeQuestions, setIncludeQuestions] = useState(false);
  // Freelancer name from /settings, read client-side (localStorage is not
  // available during SSR) so the "[YOUR NAME]" placeholder in every variant is
  // substituted live — updates on remount after a Settings change.
  const [freelancerName, setFreelancerName] = useState("");

  const textRef = useRef<HTMLDivElement>(null);
  const [canExpand, setCanExpand] = useState(false);

  // Collapsed peek height. Long proposals (the norm now — every variant is a
  // full greeting-to-sign-off email, D047) clamp to this and reveal a "Show
  // full proposal" control; shorter ones show in full with no control. This
  // fixed cap is what makes the Show/Hide affordance meaningful again — the
  // earlier flex-fill layout let the card grow to fit any length, so the text
  // never overflowed and the control never appeared.
  const COLLAPSED_MAX_HEIGHT = "19rem";

  useEffect(() => {
    setFreelancerName(settingsStore.load().freelancerName);
  }, []);

  // Reset the selected style whenever a genuinely new analysis is loaded so a
  // style picked on a previous report never carries over.
  useEffect(() => {
    setActiveTone(null);
  }, [proposal]);

  const rawProposal = proposal ? variantFor(proposal, activeTone) : "";
  const cleanProposal = proposal ? stripMarkdown(applyProposalName(rawProposal, freelancerName)) : "";

  // Re-measure whenever the visible text changes (new analysis, style swap, or
  // the questions block toggling), the expand state changes, or the window
  // resizes. Skip while expanded — the text is unclamped then, so a naive
  // re-measure would wrongly hide the "Show less" control.
  useLayoutEffect(() => {
    if (expanded) return;
    function measure() {
      const node = textRef.current;
      if (!node) return;
      setCanExpand(node.scrollHeight > node.clientHeight + 1);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [cleanProposal, includeQuestions, clientQuestions, expanded]);

  if (loading || !proposal) {
    return (
      <div className="flex h-full flex-col rounded-card border border-border-default bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
        <div className="mt-4 flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="mt-4 h-10 w-full" />
      </div>
    );
  }

  function toggleTone(tone: ProposalTone) {
    // Mutually exclusive single-select: clicking the active style clears it
    // (back to neutral base), clicking the other style switches to it. The
    // matching variant is already loaded, so this is instant and does not
    // fetch anything.
    setActiveTone((current) => (current === tone ? null : tone));
  }

  function handleIncludeQuestionsChange(checked: boolean) {
    setIncludeQuestions(checked);
    // Auto-expand when checking so the appended questions are actually visible
    // rather than clipped below the collapsed peek height (D035).
    if (checked) setExpanded(true);
  }

  async function copyProposal() {
    const questionsBlock =
      includeQuestions && clientQuestions && clientQuestions.length > 0
        ? `\n\nQuestions before I start:\n${clientQuestions.map((question) => `- ${question}`).join("\n")}`
        : "";
    try {
      await navigator.clipboard.writeText(cleanProposal + questionsBlock);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied by the browser; fail silently.
    }
  }

  return (
    <div className="flex h-full flex-col rounded-card border border-border-default bg-surface-1 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">Generated proposal</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {TONE_OPTIONS.map((tone) => (
            <button
              key={tone.value}
              type="button"
              aria-pressed={activeTone === tone.value}
              onClick={() => toggleTone(tone.value)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                activeTone === tone.value
                  ? "bg-accent-muted text-accent-hover"
                  : "bg-surface-2 text-text-secondary hover:bg-surface-hover"
              )}
            >
              {tone.label}
            </button>
          ))}
        </div>
      </div>

      {/* Collapsed: the text is clamped to COLLAPSED_MAX_HEIGHT and a full
          proposal overflows it, filling the peek area (no dead gap, since the
          variants are long — D047) and revealing "Show full proposal".
          Expanded: the clamp is dropped and the card grows to the whole
          proposal. */}
      <div className="relative mt-3">
        <div
          ref={textRef}
          className={cn(
            "whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary",
            !expanded && "overflow-hidden"
          )}
          style={{ maxHeight: expanded ? undefined : COLLAPSED_MAX_HEIGHT }}
        >
          {cleanProposal}
          {clientQuestions && clientQuestions.length > 0 ? (
            <div
              className="overflow-hidden transition-[max-height,opacity] duration-300 ease-[var(--ease-standard)]"
              style={{ maxHeight: includeQuestions ? "600px" : "0px", opacity: includeQuestions ? 1 : 0 }}
            >
              <p className="mt-3 text-[11.5px] font-medium text-text-tertiary">Questions before I start:</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {clientQuestions.map((question) => (
                  <li key={question}>— {question}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {canExpand && !expanded ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface-1 to-transparent"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {canExpand ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 self-start text-[12px] font-medium text-accent transition-colors duration-150 hover:text-accent-hover"
        >
          {expanded ? "Show less" : "Show full proposal"}
        </button>
      ) : null}

      {clientQuestions && clientQuestions.length > 0 ? (
        <Checkbox
          className="mt-3"
          checked={includeQuestions}
          onChange={handleIncludeQuestionsChange}
          label="Include client questions"
        />
      ) : null}

      {/* Absorbs any leftover height so the Copy button sits at the card's
          bottom (matching the sibling card's height in the report row). With a
          long, clamped proposal there's little or none to absorb; it only
          grows when the proposal is genuinely shorter than the row height. */}
      <div className="flex-1" />

      <Button variant="primary" className="mt-4 w-full" onClick={() => void copyProposal()}>
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {copied ? "Copied" : "Copy proposal"}
      </Button>
    </div>
  );
}
