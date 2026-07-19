"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Logo } from "@/components/product/Logo";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { ApiError, requestPasswordReset } from "@/lib/api";

// The server allows at most one reset request per minute (per email and per
// IP). We mirror that client-side as a live cooldown: after every request —
// whether it succeeded (start a fresh 60s) or came back 429 (use the exact
// retryAfter the server sent) — the resend control is disabled and a thin
// accent bar drains down to a mono countdown, so the limit reads as a
// deliberate, visible part of the flow instead of a surprise error.
const RESET_COOLDOWN_SECONDS = 60;

function useCooldown() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [total, setTotal] = useState(RESET_COOLDOWN_SECONDS);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) setEndsAt(null);
    };
    tick();
    // 250ms so the countdown never visibly lags a whole second behind.
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const start = useCallback((seconds: number) => {
    const clamped = Math.max(1, Math.round(seconds));
    setTotal(clamped);
    setRemaining(clamped);
    setEndsAt(Date.now() + clamped * 1000);
  }, []);

  return { active: remaining > 0, remaining, total, start };
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// The draining bar + countdown, shown while a resend is on cooldown. Same
// bar treatment as PasswordStrengthMeter/UsageMeter (surface-2 track, a
// single fill, width transition) rather than a new meter language — and no
// circular gauge, per the UI rules. `ease-linear` over the 250ms tick makes
// the drain read as continuous instead of stepping once a second.
function ResendCooldown({ remaining, total }: { remaining: number; total: number }) {
  const percent = Math.max(0, Math.min(100, (remaining / total) * 100));
  return (
    <div className="mt-4" aria-live="polite">
      <div className="flex items-center justify-between text-[12px] text-text-tertiary">
        <span>You can request another link in</span>
        <span className="font-mono tabular-nums text-text-secondary">{formatSeconds(remaining)}</span>
      </div>
      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={remaining}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Time until you can request another reset link"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200 ease-linear motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// D051 — "forgot password" entry point. The server always responds 204
// (no account enumeration), so on success we show the same neutral
// "if an account exists, a link is on its way" confirmation regardless of
// whether the address is registered. A dedicated 1-request-per-minute limit
// (per email + IP) is surfaced as the live cooldown above.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const cooldown = useCooldown();

  const submitRequest = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
      cooldown.start(RESET_COOLDOWN_SECONDS);
    } catch (err) {
      if (err instanceof ApiError && err.code === "reset_rate_limited") {
        cooldown.start(err.retryAfter ?? RESET_COOLDOWN_SECONDS);
        setError(null);
      } else if (err instanceof ApiError && err.code === "too_many_attempts") {
        setError("Too many attempts. Wait a while and try again.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [email, cooldown]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (cooldown.active || submitting) return;
    await submitRequest();
  }

  const busy = submitting;
  const disabled = busy || cooldown.active;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center">
          <Logo />
        </div>

        <div className="mt-8 rounded-card border border-border-default bg-surface-1 p-6">
          {sent ? (
            <div className="text-center">
              <MailCheck className="mx-auto h-9 w-9 text-success" aria-hidden="true" />
              <h1 className="mt-4 text-[17px] font-semibold text-text-primary">Check your email</h1>
              <p className="mt-1.5 text-[13px] text-text-secondary">
                If an account exists for <span className="text-text-primary">{email}</span>, we&apos;ve sent a link to
                reset your password. The link expires in 1 hour.
              </p>

              <Button
                type="button"
                variant="secondary"
                className="mt-5 w-full"
                disabled={disabled}
                onClick={submitRequest}
              >
                {busy ? "Sending…" : cooldown.active ? `Resend in ${formatSeconds(cooldown.remaining)}` : "Resend link"}
              </Button>
              {cooldown.active ? <ResendCooldown remaining={cooldown.remaining} total={cooldown.total} /> : null}

              <Link href="/login" className={buttonClasses({ variant: "ghost", className: "mt-3 w-full" })}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-center text-[19px] font-semibold text-text-primary">Reset your password</h1>
              <p className="mt-1 text-center text-[13px] text-text-secondary">
                Enter your account email and we&apos;ll send you a link to set a new password.
              </p>

              <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="forgot-email" className="mb-2 block text-[12.5px] font-medium text-text-secondary">
                    Email
                  </label>
                  <Input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>

                {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}

                <Button type="submit" variant="primary" className={cn("mt-1 w-full")} disabled={disabled}>
                  {busy ? "Sending…" : cooldown.active ? `Try again in ${formatSeconds(cooldown.remaining)}` : "Send reset link"}
                </Button>
              </form>

              {cooldown.active ? <ResendCooldown remaining={cooldown.remaining} total={cooldown.total} /> : null}
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[13px] text-text-secondary">
          Remembered it?{" "}
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
