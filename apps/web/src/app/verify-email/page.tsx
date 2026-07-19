"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Logo } from "@/components/product/Logo";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, verifyEmail } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

// D042 — landing target for the link in the verification email
// (email.py builds it as `${APP_BASE_URL}/verify-email?token=...`).
// useSearchParams() needs a Suspense boundary in the App Router, same
// pattern already used on /billing for its `?upgraded=1` banner.
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailCard state="loading" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { refresh } = useAuth();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      setError("This verification link is missing its token.");
      return;
    }
    let cancelled = false;
    verifyEmail(token)
      .then(async () => {
        if (cancelled) return;
        await refresh();
        setState("success");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "This verification link is invalid or has expired.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return <VerifyEmailCard state={state} error={error} />;
}

function VerifyEmailCard({ state, error }: { state: "loading" | "success" | "error"; error?: string | null }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center">
          <Logo />
        </div>

        <div className="mt-8 rounded-card border border-border-default bg-surface-1 p-6 text-center">
          {state === "loading" ? (
            <>
              <Skeleton className="mx-auto h-9 w-9 rounded-full" />
              <Skeleton className="mx-auto mt-4 h-5 w-40" />
              <Skeleton className="mx-auto mt-2 h-4 w-56" />
            </>
          ) : state === "success" ? (
            <>
              <CheckCircle2 className="mx-auto h-9 w-9 text-success" aria-hidden="true" />
              <h1 className="mt-4 text-[17px] font-semibold text-text-primary">Email verified</h1>
              <p className="mt-1.5 text-[13px] text-text-secondary">Your ScopeForge account email is confirmed.</p>
              <Link href="/settings" className={buttonClasses({ variant: "primary", className: "mt-5 w-full" })}>
                Go to settings
              </Link>
            </>
          ) : (
            <>
              <XCircle className="mx-auto h-9 w-9 text-danger" aria-hidden="true" />
              <h1 className="mt-4 text-[17px] font-semibold text-text-primary">Verification failed</h1>
              <p className="mt-1.5 text-[13px] text-text-secondary">{error}</p>
              <Link href="/settings" className={buttonClasses({ variant: "secondary", className: "mt-5 w-full" })}>
                Request a new link from Settings
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
