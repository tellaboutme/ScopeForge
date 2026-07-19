"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/product/Logo";
import { TurnstileWidget } from "@/components/product/Turnstile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password, turnstileToken: captchaToken ?? undefined });
      router.push("/settings");
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_credentials") {
        setError("Incorrect email or password.");
      } else if (err instanceof ApiError && err.code === "too_many_attempts") {
        setError("Too many attempts. Wait a while and try again.");
      } else if (err instanceof ApiError && err.code === "captcha_failed") {
        setError("CAPTCHA verification failed. Try again.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
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
              "No account yet?" line below — only the field labels/inputs in
              the form itself stay left-aligned, matching normal form
              conventions. */}
          <h1 className="text-center text-[19px] font-semibold text-text-primary">Sign in</h1>
          <p className="mt-1 text-center text-[13px] text-text-secondary">
            Signing in is optional — you can keep analyzing projects anonymously without an account.
          </p>

          <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="login-email" className="mb-2 block text-[12.5px] font-medium text-text-secondary">
                Email
              </label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <label htmlFor="login-password" className="block text-[12.5px] font-medium text-text-secondary">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[12px] font-medium text-accent underline decoration-accent/40 underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:decoration-accent-hover"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <TurnstileWidget onVerify={setCaptchaToken} resetKey={captchaResetKey} />

            {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}

            <Button type="submit" variant="primary" className="mt-1 w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-[13px] text-text-secondary">
          No account yet?{" "}
          <Link
            href="/signup"
            className="font-semibold text-accent underline decoration-accent/40 underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:decoration-accent-hover"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
