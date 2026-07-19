import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-input border border-border-default bg-surface-2 px-3.5 text-[13.5px] text-text-primary",
        "placeholder:text-text-tertiary outline-none",
        "transition-[border-color,background-color,box-shadow] duration-200 ease-[var(--ease-standard)]",
        "focus-visible:border-accent focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent-muted",
        className
      )}
      {...props}
    />
  );
});
