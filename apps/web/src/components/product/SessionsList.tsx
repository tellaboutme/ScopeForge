"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { LogOut, Monitor } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/product/DeleteConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, fetchSessions, revokeOtherSessions, revokeSession } from "@/lib/api";
import type { UserSessionPublic } from "@/types/auth";
import { relativeTimeFromNow } from "@/lib/format";
import { rowVariants } from "@/lib/motion";

/** D042 — a raw User-Agent string reduced to something someone can actually
 * scan at a glance, without a full parser dependency. Good enough for "was
 * this me" at a glance; not meant to be a precise device fingerprint. */
function summarizeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Mac OS X/.test(userAgent)
      ? "macOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export function SessionsList() {
  const [sessions, setSessions] = useState<UserSessionPublic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<UserSessionPublic | null>(null);
  const [signOutAllOpen, setSignOutAllOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSessions()
      .then((result) => {
        if (!cancelled) setSessions(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load active sessions.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      await revokeSession(id);
      setSessions((current) => current?.filter((row) => row.id !== id) ?? current);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign out that session.");
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeOthers() {
    try {
      await revokeOtherSessions();
      setSessions((current) => current?.filter((row) => row.isCurrent) ?? current);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign out other sessions.");
    }
  }

  if (error) {
    return <p className="text-[13px] text-danger">{error}</p>;
  }

  if (!sessions) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full rounded-control" />
        <Skeleton className="h-14 w-full rounded-control" />
      </div>
    );
  }

  const otherCount = sessions.filter((row) => !row.isCurrent).length;

  return (
    <div>
      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {sessions.map((row) => (
            <m.div
              key={row.id}
              layout
              variants={rowVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface-2 p-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-1">
                  <Monitor className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-text-primary">
                    {summarizeUserAgent(row.userAgent)}
                    {row.isCurrent ? <span className="ml-2 text-[11px] font-semibold text-accent">This device</span> : null}
                  </p>
                  <p className="text-[12px] text-text-tertiary">Last active {relativeTimeFromNow(row.lastSeenAt)}</p>
                </div>
              </div>
              {!row.isCurrent ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRevokeTarget(row)}
                  disabled={revokingId === row.id}
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  Sign out
                </Button>
              ) : null}
            </m.div>
          ))}
        </AnimatePresence>
      </div>

      {otherCount > 0 ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => setSignOutAllOpen(true)}>
          Sign out of {otherCount} other session{otherCount === 1 ? "" : "s"}
        </Button>
      ) : null}

      <DeleteConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="Sign out this session?"
        description="That device will need to sign in again to use ScopeForge."
        itemSummary={<p className="text-[13px] text-text-secondary">{summarizeUserAgent(revokeTarget?.userAgent ?? null)}</p>}
        confirmLabel="Sign out"
        onConfirm={() => {
          if (revokeTarget) void handleRevoke(revokeTarget.id);
        }}
      />

      <DeleteConfirmDialog
        open={signOutAllOpen}
        onOpenChange={setSignOutAllOpen}
        title="Sign out of all other sessions?"
        description="Every other signed-in device or browser will need to sign in again. This device stays signed in."
        itemSummary={<p className="text-[13px] text-text-secondary">{otherCount} session{otherCount === 1 ? "" : "s"} will be signed out.</p>}
        confirmLabel="Sign out others"
        onConfirm={() => void handleRevokeOthers()}
      />
    </div>
  );
}
