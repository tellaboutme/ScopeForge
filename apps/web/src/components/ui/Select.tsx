"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  placeholder?: string;
  className?: string;
}

export function Select<T extends string>({
  options,
  value,
  onChange,
  placeholder,
  className,
  ...props
}: SelectProps<T>) {
  return (
    <RadixSelect.Root value={value} onValueChange={(next) => onChange(next as T)}>
      <RadixSelect.Trigger
        aria-label={props["aria-label"]}
        className={cn(
          "group flex h-11 w-full items-center justify-between gap-2 rounded-input border border-border-default bg-surface-2 px-3.5 text-left text-[13.5px] text-text-primary",
          "outline-none transition-colors duration-150 hover:border-white/[0.18]",
          "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-muted",
          "data-[placeholder]:text-text-tertiary",
          className
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-150 ease-[var(--ease-standard)] group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="animate-menu-pop z-50 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-card border border-border-default bg-surface-1 p-1.5 shadow-[0_16px_40px_rgba(2,3,10,0.55)]"
        >
          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className={cn(
                  "flex h-9 cursor-pointer select-none items-center justify-between gap-2.5 rounded-control px-2.5 text-[13.5px] outline-none",
                  "text-text-primary data-[highlighted]:bg-surface-hover"
                )}
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator>
                  <Check className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
