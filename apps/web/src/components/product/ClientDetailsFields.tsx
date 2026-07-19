"use client";

import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { AnalysisCurrency, ClientBudgetType, ClientDeadlineUnit } from "@/lib/constants";
import { BUDGET_TYPE_OPTIONS, CURRENCY_SYMBOL, DEADLINE_UNIT_OPTIONS } from "@/lib/constants";

export interface ClientDetailsFieldsProps {
  budget: string;
  onBudgetChange: (value: string) => void;
  budgetType: ClientBudgetType;
  onBudgetTypeChange: (value: ClientBudgetType) => void;
  currency: AnalysisCurrency;
  deadlineDays: string;
  onDeadlineDaysChange: (value: string) => void;
  deadlineUnit: ClientDeadlineUnit;
  onDeadlineUnitChange: (value: ClientDeadlineUnit) => void;
  disabled?: boolean;
}

/**
 * Structured client-stated facts, entered directly from the listing (D029)
 * instead of left for the model to extract from free-text prose — the brief
 * often just doesn't state a budget/deadline in a way that survives copy-paste
 * (e.g. Upwork shows it in a separate sidebar, not the description body).
 * Both fields are optional: not every listing states a fixed budget or a
 * hard deadline, and leaving either blank is a normal, expected case, not
 * an error state.
 *
 * D040: each field also gets a unit toggle — a listing might state a fixed
 * total ("$2,000 for the whole project") or an hourly rate ("$50/hr"), and
 * a deadline in days or months. The toggle travels with the value (budget
 * type all the way to the model prompt, deadline unit converted to days
 * client-side before submit) rather than being a cosmetic label only.
 */
export function ClientDetailsFields({
  budget,
  onBudgetChange,
  budgetType,
  onBudgetTypeChange,
  currency,
  deadlineDays,
  onDeadlineDaysChange,
  deadlineUnit,
  onDeadlineUnitChange,
  disabled
}: ClientDetailsFieldsProps) {
  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
      <div className="flex-1 rounded-card border border-border-default bg-surface-1 p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[12px] text-text-tertiary">Client budget (optional)</p>
        </div>
        <SegmentedControl
          aria-label="Budget type"
          options={BUDGET_TYPE_OPTIONS}
          value={budgetType}
          onChange={onBudgetTypeChange}
          className="mb-2"
        />
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-text-tertiary">
            {CURRENCY_SYMBOL[currency]}
          </span>
          <Input
            value={budget}
            onChange={(event) => onBudgetChange(event.target.value)}
            inputMode="decimal"
            placeholder="e.g. 50"
            aria-label="Client budget"
            disabled={disabled}
            className={budgetType === "hourly" ? "pl-7 pr-10" : "pl-7"}
          />
          {budgetType === "hourly" ? (
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-text-tertiary">
              /hr
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex-1 rounded-card border border-border-default bg-surface-1 p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[12px] text-text-tertiary">Client deadline (optional)</p>
        </div>
        <SegmentedControl
          aria-label="Deadline unit"
          options={DEADLINE_UNIT_OPTIONS}
          value={deadlineUnit}
          onChange={onDeadlineUnitChange}
          className="mb-2"
        />
        <div className="relative">
          <Input
            value={deadlineDays}
            onChange={(event) => onDeadlineDaysChange(event.target.value)}
            inputMode="numeric"
            placeholder={deadlineUnit === "months" ? "e.g. 2" : "e.g. 14"}
            aria-label={`Client deadline in ${deadlineUnit}`}
            disabled={disabled}
            className="pr-16"
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-text-tertiary">
            {deadlineUnit}
          </span>
        </div>
      </div>
    </div>
  );
}
