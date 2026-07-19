"use client";

import type { ChangeEvent } from "react";
import { briefQuality } from "@/lib/format";
import { DEPTH_BADGE_LABEL, type AnalysisDepth } from "@/lib/constants";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";

export interface BriefEditorProps {
  value: string;
  onChange: (value: string) => void;
  depth: AnalysisDepth;
  onClear: () => void;
  disabled?: boolean;
}

export function BriefEditor({ value, onChange, depth, onClear, disabled }: BriefEditorProps) {
  const trimmed = value.trim();
  const wordCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  const charCount = value.length;
  const quality = briefQuality(wordCount);

  const qualityColor =
    quality.tone === "success" ? "text-success" : quality.tone === "warning" ? "text-warning" : "text-danger";

  return (
    <div className="rounded-card border border-border-default bg-surface-1 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold leading-[20px] text-text-primary">Project brief</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
            Paste the complete client description. ScopeForge will separate facts from assumptions.
          </p>
        </div>
        <Badge tone="accent" className="shrink-0">
          {DEPTH_BADGE_LABEL[depth]}
        </Badge>
      </div>

      <Textarea
        value={value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        placeholder="Paste the complete project description here…"
        className="mt-4 min-h-[300px] lg:min-h-[360px]"
        aria-label="Project brief"
        disabled={disabled}
      />

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className="flex items-center gap-1.5 text-text-tertiary">
          <span>
            {wordCount} words · {charCount} characters
          </span>
          {wordCount > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span className={qualityColor}>{quality.label}</span>
            </>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled || value.length === 0}
          className="text-text-tertiary transition-colors duration-150 hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
        >
          Clear brief
        </button>
      </div>
    </div>
  );
}
