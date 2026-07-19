import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full resize-none rounded-input border border-border-default bg-surface-2 px-4 py-3.5 text-[14px] leading-relaxed text-text-primary",
          "placeholder:text-text-tertiary outline-none",
          "transition-[border-color,background-color,box-shadow] duration-200 ease-[var(--ease-standard)]",
          "focus-visible:border-accent focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent-muted",
          className
        )}
        {...props}
      />
    );
  }
);
