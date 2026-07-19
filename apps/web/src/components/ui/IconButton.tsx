import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type IconButtonVariant = "ghost" | "secondary";

const variantClasses: Record<IconButtonVariant, string> = {
  ghost: "bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary",
  secondary:
    "bg-surface-2 text-text-primary border border-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] " +
    "hover:bg-surface-hover hover:border-white/[0.24]"
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  /** Required — icon-only controls must expose an accessible name. */
  "aria-label": string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "ghost", className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control",
        "transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-standard)] active:scale-[0.94]",
        "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
        "disabled:opacity-45 disabled:pointer-events-none",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
