import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-btn text-sm font-medium " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-standard)] " +
  "disabled:opacity-45 disabled:pointer-events-none active:scale-[0.97] " +
  "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover active:bg-accent-hover",
  secondary:
    "bg-surface-2 text-text-primary border border-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] " +
    "hover:bg-surface-hover hover:border-white/[0.24]",
  ghost: "bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary",
  destructive: "bg-danger-muted text-danger hover:bg-danger/20"
};

const sizeClasses: Record<ButtonSize, string> = {
  md: "h-10 px-4",
  sm: "h-9 px-3 text-[13px]"
};

export function buttonClasses(options: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  const { variant = "primary", size = "md", className } = options;
  return cn(base, variantClasses[variant], sizeClasses[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, ...props },
  ref
) {
  return <button ref={ref} className={buttonClasses({ variant, size, className })} {...props} />;
});
