import Link from "next/link";
import { Zap } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";

export interface UsageLimitStateProps {
  message?: string;
  onBackToEditor: () => void;
}

/**
 * Shown when POST /v1/analyses returns 402 usage_limit_reached (D037) —
 * deliberately a distinct component from AnalysisErrorState rather than a
 * branch inside it. Hitting a plan quota isn't a failure (nothing broke,
 * the brief is fine, no need to imply retrying might work) — it's an
 * expected product boundary with one real next step: upgrade. Framing it
 * as an error would be misleading and would bury the actual call to action
 * (a "Retry" button here would just fail again with the same 402).
 */
export function UsageLimitState({ message, onBackToEditor }: UsageLimitStateProps) {
  return (
    <div className="flex justify-center pt-6 sm:pt-10">
      <div className="w-full max-w-[560px] rounded-modal border border-border-default bg-surface-1 p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-control bg-accent-muted text-accent">
          <Zap className="h-5 w-5" aria-hidden="true" />
        </span>

        <h2 className="mt-5 text-[22px] font-semibold leading-[28px] text-text-primary">
          You&apos;ve reached this month&apos;s limit
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          {message ?? "You've used all the analyses included on your current plan this month. Upgrade for more, or wait until next month."}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">Your project brief is still saved.</p>

        <div className="mt-6 flex flex-col-reverse items-center justify-center gap-2.5 sm:flex-row">
          <Button variant="secondary" onClick={onBackToEditor} className="w-full sm:w-auto">
            Back to editor
          </Button>
          <Link href="/billing" className={buttonClasses({ variant: "primary", className: "w-full sm:w-auto" })}>
            View plans
          </Link>
        </div>
      </div>
    </div>
  );
}
