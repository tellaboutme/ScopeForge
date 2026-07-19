"use client";

import { useState } from "react";
import { Check, Copy, HelpCircle } from "lucide-react";
import type { ProjectAnalysis } from "@/types/analysis";
import { Skeleton } from "@/components/ui/Skeleton";

export interface ClientQuestionListProps {
  questions?: ProjectAnalysis["clientQuestions"];
  loading?: boolean;
}

export function ClientQuestionList({ questions, loading }: ClientQuestionListProps) {
  const [copied, setCopied] = useState(false);

  if (loading || !questions) {
    return (
      <div className="h-full rounded-card border border-border-default bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-4 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex h-full flex-col items-start gap-3 rounded-card border border-border-default bg-surface-1 p-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-control bg-surface-2 text-text-tertiary" aria-hidden="true">
          <HelpCircle className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">Questions for the client</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">No open questions were identified for this brief.</p>
        </div>
      </div>
    );
  }

  async function copyAll() {
    if (!questions) return;
    try {
      await navigator.clipboard.writeText(questions.map((question, index) => `${index + 1}. ${question}`).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied by the browser; fail silently.
    }
  }

  return (
    <div className="h-full rounded-card border border-border-default bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">Questions for the client</h3>
        <button
          type="button"
          onClick={() => void copyAll()}
          className="flex items-center gap-1.5 text-[12px] font-medium text-accent transition-colors duration-150 hover:text-accent-hover"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? "Copied" : "Copy all"}
        </button>
      </div>

      <ol className="mt-3 flex flex-col divide-y divide-border-subtle">
        {questions.map((question, index) => (
          <li key={index} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="mt-0.5 shrink-0 font-mono text-[11px] text-text-tertiary">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-[13px] leading-relaxed text-text-secondary">{question}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
