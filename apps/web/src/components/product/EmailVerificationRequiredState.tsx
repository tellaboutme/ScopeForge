"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { resendVerificationEmail, ApiError } from "@/lib/api";

export interface EmailVerificationRequiredStateProps {
  message?: string;
  onBackToEditor: () => void;
}

/**
 * Shown when POST /v1/analyses (or /v1/proposals/regenerate) returns 403
 * email_verification_required (D058) — a signed-in account whose email
 * isn't verified yet. Deliberately its own component rather than a branch
 * inside AnalysisErrorState, same reasoning as UsageLimitState: this isn't
 * a failure worth "retrying" as-is (retrying without verifying first would
 * just 403 again) — it's an expected gate with one real next step, verify
 * the account, so that's the action front and center.
 */
export function EmailVerificationRequiredState({ message, onBackToEditor }: EmailVerificationRequiredStateProps) {
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleResend() {
    setResendState("sending");
    setResendError(null);
    try {
      await resendVerificationEmail();
      setResendState("sent");
    } catch (error) {
      setResendState("idle");
      setResendError(error instanceof ApiError ? error.message : "Could not resend the verification email.");
    }
  }

  return (
    <div className="flex justify-center pt-6 sm:pt-10">
      <div className="w-full max-w-[560px] rounded-modal border border-border-default bg-surface-1 p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-control bg-accent-muted text-accent">
          <MailCheck className="h-5 w-5" aria-hidden="true" />
        </span>

        <h2 className="mt-5 text-[22px] font-semibold leading-[28px] text-text-primary">Verify your email to continue</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          {message ?? "Verify your email address before using ScopeForge. Check your inbox for the verification link, or resend it below."}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">Your project brief is still saved.</p>

        {resendError ? <p className="mt-3 text-[12.5px] text-danger">{resendError}</p> : null}

        <div className="mt-6 flex flex-col-reverse items-center justify-center gap-2.5 sm:flex-row">
          <Button variant="secondary" onClick={onBackToEditor} className="w-full sm:w-auto">
            Back to editor
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handleResend()}
            disabled={resendState === "sending" || resendState === "sent"}
            className="w-full sm:w-auto"
          >
            {resendState === "sent" ? "Email sent" : resendState === "sending" ? "Sending…" : "Resend email"}
          </Button>
          <Link href="/settings#security" className={buttonClasses({ variant: "primary", className: "w-full sm:w-auto" })}>
            Go to Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
