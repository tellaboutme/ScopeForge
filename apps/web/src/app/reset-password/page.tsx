"use client";

import { Suspense, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/product/Logo";
import { PasswordStrengthMeter } from "@/components/product/PasswordStrengthMeter";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, resetPassword } from "@/lib/api";
import { checkPasswordStrength } from "@/lib/password-strength";

// D051 — landing target for the emailed reset link
// (email.py builds it as `${APP_BASE_URL}/reset-password?token=...`).
// useSearchParams() needs a Suspense boundary in the App Router, same
// pattern as /verify-email and /billing.
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <ResetShell>
          <Skeleton className="mx-auto h-5 w-40" />
          <Skeleton className="mx-auto mt-2 h-4 w-56" />
        </ResetShell>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("This reset link is missing its token. Request a new one.");
      return;
    }
    const strengthError = checkPasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_token") {
        setError("This reset link is invalid or has expired. Request a new one.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <ResetShell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-success" aria-hidden="true" />
          <h1 className="mt-4 text-[17px] font-semibold text-text-primary">Password updated</h1>
          <p className="mt-1.5 text-[13px] text-text-secondary">
            Your password has been changed and you&apos;ve been signed out everywhere. Sign in with your new password.
          </p>
          <Link href="/login" className={buttonClasses({ variant: "primary", className: "mt-5 w-full" })}>
            Go to sign in
          </Link>
        </div>
      </ResetShell>
    );
  }

  if (!token) {
    return (
      <ResetShell>
        <div className="text-center">
          <h1 className="text-[17px] font-semibold text-text-primary">Reset link incomplete</h1>
          <p className="mt-1.5 text-[13px] text-text-secondary">
            This link is missing its token. Request a new password reset link.
          </p>
          <Link href="/forgot-password" className={buttonClasses({ variant: "secondary", className: "mt-5 w-full" })}>
            Request a new link
          </Link>
        </div>
      </ResetShell>
    );
  }

  return (
    <ResetShell>
      <h1 className="text-center text-[19px] font-semibold text-text-primary">Set a new password</h1>
      <p className="mt-1 text-center text-[13px] text-text-secondary">
        Choose a new password for your ScopeForge account.
      </p>

      <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="reset-password" className="mb-2 block text-[12.5px] font-medium text-text-secondary">
            New password
          </label>
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordStrengthMeter password={password} />
        </div>

        {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}

        <Button type="submit" variant="primary" className="mt-1 w-full" disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </Button>
      </form>
    </ResetShell>
  );
}

function ResetShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center">
          <Logo />
        </div>
        <div className="mt-8 rounded-card border border-border-default bg-surface-1 p-6">{children}</div>
      </div>
    </div>
  );
}
