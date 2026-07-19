"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Custom-styled checkbox (the UI guidelines: avoid default shadcn
 * composition) — a bare button acting as a checkbox rather than a native
 * <input type="checkbox">, so focus/hover/checked states can follow the
 * same token-driven treatment as SegmentedControl/Select.
 */
export function Checkbox({ checked, onChange, label, disabled, className, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 select-none",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        className
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label ? undefined : props["aria-label"]}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border outline-none",
          "transition-[background-color,border-color] duration-150 ease-[var(--ease-standard)]",
          "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
          checked
            ? "border-accent bg-accent text-white"
            : "border-border-default bg-surface-2 hover:border-white/[0.24]"
        )}
      >
        <Check
          className={cn("h-3 w-3 transition-[opacity,transform] duration-150", checked ? "scale-100 opacity-100" : "scale-75 opacity-0")}
          aria-hidden="true"
        />
      </button>
      {label ? <span className="text-[12.5px] font-medium text-text-secondary">{label}</span> : null}
    </label>
  );
}
