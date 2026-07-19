"use client";

import type { KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  ...props
}: SegmentedControlProps<T>) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + options.length) % options.length;
    onChange(options[nextIndex].value);
    const group = event.currentTarget.parentElement;
    const nextButton = group?.querySelectorAll("button")[nextIndex];
    (nextButton as HTMLButtonElement | undefined)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={props["aria-label"]}
      className={cn(
        "flex w-full items-center gap-1 rounded-control border border-border-subtle bg-surface-2 p-1",
        className
      )}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "flex-1 rounded-[6px] px-3 py-1.5 text-center text-[13px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150",
              "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
              active
                ? "bg-surface-hover text-text-primary border border-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                : "border border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
