"use client";

import type { ReactNode } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  EXPERIENCE_OPTIONS,
  CURRENCY_OPTIONS,
  DEPTH_OPTIONS,
  type ExperienceLevel,
  type AnalysisCurrency,
  type AnalysisDepth
} from "@/lib/constants";

export interface AnalysisSettingsProps {
  experience: ExperienceLevel;
  onExperienceChange: (value: ExperienceLevel) => void;
  currency: AnalysisCurrency;
  onCurrencyChange: (value: AnalysisCurrency) => void;
  depth: AnalysisDepth;
  onDepthChange: (value: AnalysisDepth) => void;
}

function SettingGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex-1 rounded-card border border-border-default bg-surface-1 p-3.5">
      <p className="mb-2 text-[12px] text-text-tertiary">{label}</p>
      {children}
    </div>
  );
}

export function AnalysisSettings({
  experience,
  onExperienceChange,
  currency,
  onCurrencyChange,
  depth,
  onDepthChange
}: AnalysisSettingsProps) {
  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
      <SettingGroup label="Experience level">
        <SegmentedControl aria-label="Experience level" options={EXPERIENCE_OPTIONS} value={experience} onChange={onExperienceChange} />
      </SettingGroup>
      <SettingGroup label="Currency">
        <SegmentedControl aria-label="Currency" options={CURRENCY_OPTIONS} value={currency} onChange={onCurrencyChange} />
      </SettingGroup>
      <SettingGroup label="Analysis depth">
        <SegmentedControl aria-label="Analysis depth" options={DEPTH_OPTIONS} value={depth} onChange={onDepthChange} />
      </SettingGroup>
    </div>
  );
}
