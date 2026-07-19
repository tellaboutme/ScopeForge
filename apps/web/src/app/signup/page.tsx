"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/product/Logo";
import { PasswordStrengthMeter } from "@/components/product/PasswordStrengthMeter";
import { TurnstileWidget } from "@/components/product/Turnstile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { MIN_PASSWORD_LENGTH, checkPasswordStrength } from "@/lib/password-strength";

export default function SignupPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const strengthError = checkPasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }

    setSubmitting(true);
    try {
      await register({
        email,
        password,
        displayName: displayName.trim() || undefined,
        turnstileToken: captchaToken ?? undefined
      });
      router.push("/settings");
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") {
        setError("An account with this email already exists.");
      } else if (err instanceof ApiError && err.code === "captcha_failed") {
        setError("CAPTCHA verification failed. Try again.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
      // Turnstile tokens are single-use — force a fresh challenge on retry.
      setCaptchaToken(null);
      setCaptchaResetKey((key) => key + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center">
          <Logo />
        </div>

        <div className="mt-8 rounded-card border border-border-default bg-surface-1 p-6">
          {/* D044, user-flagged: centered like the logo above and the
              "Already have an account?" line below — only the field
              labels/inputs in the form itself stay left-aligned, matching
              normal form conventions. */}
          <h1 className="text-center text-[19px] font-semibold text-text-primary">Create an account</h1>
          <p className="mt-1 text-center text-[13px] text-text-secondary">
            Starts you on the free Spark plan. Upgrade any time from Billing — no account is required just to try
            ScopeForge.
          </p>

          <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="signup-name" className="mb-2 block text-[12.5px] font-medium text-text-secondary">
                Name (optional)
              </label>
              <Input
                id="signup-name"
                autoComplete="name"
                maxLength={80}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="signup-email" className="mb-2 block text-[12.5px] font-medium text-text-secondary">
                Email
              </label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="signup-password" className="mb-2 block text-[12.5px] font-medium text-text-secondary">
                Password
              </label>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <PasswordStrengthMeter password={password} />
            </div>

            <TurnstileWidget onVerify={setCaptchaToken} resetKey={captchaResetKey} />

            {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}

            <Button type="submit" variant="primary" className="mt-1 w-full" disabled={submitting}>
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-[13px] text-text-secondary">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-accent underline decoration-accent/40 underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:decoration-accent-hover"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
