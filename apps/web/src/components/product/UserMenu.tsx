"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, Download, LogIn, LogOut, MoreHorizontal, Settings, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { DeleteConfirmDialog } from "@/components/product/DeleteConfirmDialog";
import { downloadFile } from "@/lib/export";
import { analysisStore } from "@/lib/analysis-store";
import { historyStore } from "@/lib/history-store";
import { settingsStore } from "@/lib/settings-store";
import { useMountedAfterPaint } from "@/lib/use-mounted";
import { useAuth } from "@/lib/auth-store";
import { PLAN_LABELS } from "@/lib/constants";

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const [clearOpen, setClearOpen] = useState(false);
  const { user, status, logout } = useAuth();
  // Local-profile identity from /settings (D030) is still the fallback for
  // an anonymous browser (D004/D037) — signing in is opt-in, not required,
  // so this component has to represent both states cleanly rather than
  // assuming an account always exists. useMountedAfterPaint avoids a
  // hydration mismatch (localStorage is only readable client-side).
  const mounted = useMountedAfterPaint();
  const localName = mounted ? settingsStore.load().freelancerName.trim() : "";

  const signedIn = status === "ready" && user !== null;
  const displayName = signedIn ? user.displayName || user.email : localName || "Your profile";
  const displayLabel = signedIn ? `${PLAN_LABELS[user.subscription.tier]} plan` : "Local profile";
  const initials = signedIn
    ? initialsFrom(user.displayName || user.email)
    : localName
      ? initialsFrom(localName)
      : "—";

  function handleExportAll() {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings: settingsStore.load(),
      history: historyStore.list(),
      // Full cached reports too, so "Export all data" is genuinely complete
      // rather than just the history summaries.
      analyses: analysisStore.list()
    };
    downloadFile("scopeforge-data.json", JSON.stringify(payload, null, 2), "application/json");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Open account menu"
            className="flex w-full items-center gap-2.5 rounded-control px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-surface-hover"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-text-primary">
              {initials}
            </span>
            {!compact ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-text-primary">{displayName}</span>
                <span className="block truncate text-[12px] text-text-tertiary">{displayLabel}</span>
              </span>
            ) : null}
            <MoreHorizontal className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top">
          {!signedIn ? (
            <>
              <DropdownMenuItem asChild>
                <Link href="/login">
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Sign in
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings className="h-4 w-4" aria-hidden="true" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/billing">
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              Billing
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(event) => { event.preventDefault(); handleExportAll(); }}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export all data
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {signedIn ? (
            <DropdownMenuItem onSelect={() => { void logout(); }}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem destructive onSelect={() => setClearOpen(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Clear local data
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear local data?"
        description="This removes every saved analysis and resets your preferences to their defaults in this browser. This action cannot be undone."
        itemSummary={<p className="text-[13px] text-text-secondary">History and settings will both be cleared.</p>}
        confirmLabel="Clear local data"
        onConfirm={() => {
          historyStore.clear();
          settingsStore.reset();
          // Was missing before D043 — the dialog's own copy above already
          // promised "every saved analysis" gets removed, but the cached
          // ProjectAnalysis records analysisStore holds (used for instant
          // /analysis/[id] reads, D022) were never actually included.
          analysisStore.clear();
        }}
      />
    </>
  );
}
