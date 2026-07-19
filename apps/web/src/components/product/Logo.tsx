import { cn } from "@/lib/cn";

export function Logo({ withWordmark = true, className }: { withWordmark?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-br from-accent to-accent-hover text-[13px] font-bold text-white"
        aria-hidden="true"
      >
        S
      </span>
      {withWordmark ? (
        <span className="font-logo text-[16px] font-semibold tracking-wide text-text-primary">ScopeForge</span>
      ) : null}
    </div>
  );
}
