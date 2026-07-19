"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Check, CreditCard, MailCheck, RotateCcw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/product/PageHeader";
import { DeleteConfirmDialog } from "@/components/product/DeleteConfirmDialog";
import { SessionsList } from "@/components/product/SessionsList";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { downloadFile } from "@/lib/export";
import { historyStore } from "@/lib/history-store";
import { settingsStore, type AnalysisSettingsData } from "@/lib/settings-store";
import { useAuth } from "@/lib/auth-store";
import { unlinkCard, resendVerificationEmail, ApiError } from "@/lib/api";
import { PLAN_LABELS } from "@/lib/constants";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { DURATION, EASE } from "@/lib/motion";
import {
  CURRENCY_OPTIONS,
  DEPTH_OPTIONS,
  EXPERIENCE_OPTIONS,
  RISK_TOLERANCE_OPTIONS,
  TONE_OPTIONS
} from "@/lib/constants";

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "billing", label: "Payment method" },
  { id: "analysis-defaults", label: "Analysis defaults" },
  { id: "proposal-preferences", label: "Proposal preferences" },
  { id: "data-and-privacy", label: "Data and privacy" }
];

function formatPeriodEnd(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export default function SettingsPage() {
  const initial = useRef(settingsStore.load()).current;
  const [saved, setSaved] = useState<AnalysisSettingsData>(initial);
  const [draft, setDraft] = useState<AnalysisSettingsData>(initial);
  const [hourlyRateInput, setHourlyRateInput] = useState(String(initial.hourlyRate));
  const [hourlyRateError, setHourlyRateError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "success">("idle");
  const [resetOpen, setResetOpen] = useState(false);
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const { user, refresh } = useAuth();
  const reducedMotion = useReducedMotion();

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  async function handleResendVerification() {
    setResendState("sending");
    setResendError(null);
    try {
      await resendVerificationEmail();
      setResendState("sent");
    } catch (err) {
      setResendError(err instanceof ApiError ? err.message : "Could not resend the verification email. Try again.");
      setResendState("idle");
    }
  }

  async function handleUnlinkCard() {
    setUnlinking(true);
    setUnlinkError(null);
    try {
      await unlinkCard();
      await refresh();
    } catch (error) {
      setUnlinkError(error instanceof ApiError ? error.message : "Could not unlink the card. Try again.");
    } finally {
      setUnlinking(false);
    }
  }

  const isDirty = hourlyRateInput !== String(saved.hourlyRate) || Object.keys(draft).some((key) => {
    const field = key as keyof AnalysisSettingsData;
    return field !== "hourlyRate" && draft[field] !== saved[field];
  });

  function scrollToSection(id: string) {
    setActiveSection(id);
    // On desktop the section nav is a sticky sidebar, so aligning the target
    // section to the top of the viewport reads correctly. On mobile the nav is
    // a horizontal pill bar that scrolls away with the page — aligning to the
    // top there leaves the tapped section jammed against the very top edge
    // (and partly under the app's mobile top bar). Center it instead so the
    // block lands comfortably in the middle of the screen (user request).
    const isDesktop = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
    // Gated by the existing useReducedMotion hook (not the Motion library's
    // own reduced-motion handling, which only covers `m`-driven animations) —
    // this is a native browser scroll, so it needs to check the same signal by
    // hand rather than smooth-scrolling regardless of the user's OS setting.
    sectionRefs.current[id]?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: isDesktop ? "start" : "center"
    });
  }

  function update<K extends keyof AnalysisSettingsData>(key: K, value: AnalysisSettingsData[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaveState("idle");
  }

  function handleSave() {
    const parsedRate = Number(hourlyRateInput);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setHourlyRateError("Enter a positive hourly rate.");
      return;
    }
    const next: AnalysisSettingsData = { ...draft, hourlyRate: parsedRate };
    settingsStore.save(next);
    setSaved(next);
    setDraft(next);
    setHourlyRateInput(String(parsedRate));
    setHourlyRateError(null);
    setSaveState("success");
    setTimeout(() => setSaveState("idle"), 2400);
  }

  function handleReset() {
    const defaults = settingsStore.reset();
    setSaved(defaults);
    setDraft(defaults);
    setHourlyRateInput(String(defaults.hourlyRate));
    setHourlyRateError(null);
    setSaveState("idle");
  }

  function handleExportAll() {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings: saved,
      history: historyStore.list()
    };
    downloadFile("scopeforge-data.json", JSON.stringify(payload, null, 2), "application/json");
  }

  return (
    <div>
      <PageHeader
        eyebrow="ScopeForge"
        title="Settings"
        description="Set defaults for future analyses and manage local data."
        actions={
          <div className="flex items-center gap-2.5">
            <AnimatePresence mode="wait" initial={false}>
              {saveState === "success" ? (
                <m.span
                  key="saved"
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: DURATION.normal - 0.03, ease: EASE.standard }}
                  className="flex items-center gap-1.5 text-[12.5px] font-medium text-success"
                >
                  <m.span
                    initial={{ scale: 0.92 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: DURATION.micro, ease: EASE.standard }}
                    className="flex"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </m.span>
                  Saved
                </m.span>
              ) : isDirty ? (
                <m.span
                  key="unsaved"
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: DURATION.normal - 0.03, ease: EASE.standard }}
                  className="text-[12.5px] font-medium text-warning"
                >
                  Unsaved changes
                </m.span>
              ) : null}
            </AnimatePresence>
            <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset to defaults
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={!isDirty}>
              Save changes
            </Button>
          </div>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="hidden lg:block" aria-label="Settings sections">
          <div className="sticky top-6 flex flex-col gap-1">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                aria-current={activeSection === section.id ? "true" : undefined}
                className={cn(
                  "rounded-control px-3 py-2 text-left text-[13px] font-medium transition-colors duration-150",
                  activeSection === section.id
                    ? "bg-accent-muted text-accent-hover"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                )}
              >
                {section.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollToSection(section.id)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors duration-150",
                activeSection === section.id
                  ? "bg-accent-muted text-accent-hover"
                  : "bg-surface-2 text-text-secondary hover:bg-surface-hover"
              )}
            >
              {section.label}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <section
            id="profile"
            ref={(node) => {
              sectionRefs.current["profile"] = node;
            }}
            className="rounded-card border border-border-default bg-surface-1 p-5"
          >
            <h2 className="text-[15px] font-semibold text-text-primary">Profile</h2>
            <p className="mt-1 text-[13px] text-text-secondary">
              Used to sign generated proposals with your real name instead of a placeholder.
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-[12.5px] font-medium text-text-secondary">Your name</label>
                <Input
                  value={draft.freelancerName}
                  onChange={(event) => update("freelancerName", event.target.value)}
                  aria-label="Your name"
                  placeholder="e.g. Alex Rivera"
                  maxLength={80}
                />
                <p className="mt-1.5 text-[12px] text-text-tertiary">Signs the generated proposal. Left blank, no name is invented.</p>
              </div>
              <div>
                <label className="mb-2 block text-[12.5px] font-medium text-text-secondary">Short bio (optional)</label>
                <Textarea
                  value={draft.freelancerBio}
                  onChange={(event) => update("freelancerBio", event.target.value)}
                  aria-label="Short bio"
                  placeholder="e.g. Full-stack developer, 5 years building SaaS products."
                  maxLength={500}
                  className="min-h-[44px]"
                />
              </div>
            </div>
          </section>

          <section
            id="security"
            ref={(node) => {
              sectionRefs.current["security"] = node;
            }}
            className="rounded-card border border-border-default bg-surface-1 p-5"
          >
            <h2 className="text-[15px] font-semibold text-text-primary">Security</h2>
            <p className="mt-1 text-[13px] text-text-secondary">Email verification and devices signed into your account.</p>

            {!user ? (
              <p className="mt-5 text-[13px] text-text-secondary">
                <Link href="/login" className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover">
                  Sign in
                </Link>{" "}
                to manage email verification and active sessions.
              </p>
            ) : (
              <>
                <div className="mt-5 flex items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface-2 p-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-1">
                      {user.emailVerified ? (
                        <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
                      ) : (
                        <MailCheck className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <p className="text-[13px] font-medium text-text-primary">
                        {user.emailVerified ? "Email verified" : "Email not verified"}
                      </p>
                      <p className="text-[12px] text-text-tertiary">{user.email}</p>
                    </div>
                  </div>
                  {!user.emailVerified ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleResendVerification()}
                      disabled={resendState === "sending" || resendState === "sent"}
                    >
                      {resendState === "sent" ? "Email sent" : resendState === "sending" ? "Sending…" : "Resend email"}
                    </Button>
                  ) : null}
                </div>
                {resendError ? <p className="mt-2 text-[12.5px] text-danger">{resendError}</p> : null}

                <h3 className="mt-6 text-[13.5px] font-semibold text-text-primary">Active sessions</h3>
                <div className="mt-3">
                  <SessionsList />
                </div>
              </>
            )}
          </section>

          <section
            id="billing"
            ref={(node) => {
              sectionRefs.current["billing"] = node;
            }}
            className="rounded-card border border-border-default bg-surface-1 p-5"
          >
            <h2 className="text-[15px] font-semibold text-text-primary">Payment method</h2>
            <p className="mt-1 text-[13px] text-text-secondary">
              The card on file for your subscription. Nothing here is a real payment processor — see Billing for plan
              details.
            </p>

            <div className="mt-5">
              {!user ? (
                <p className="text-[13px] text-text-secondary">
                  <Link href="/login" className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover">
                    Sign in
                  </Link>{" "}
                  to manage a payment method.
                </p>
              ) : user.subscription.cardLast4 ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-control border border-border-default bg-surface-2">
                      <CreditCard className="h-5 w-5 text-accent" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[13.5px] font-medium text-text-primary">
                        {user.subscription.cardBrand} •••• {user.subscription.cardLast4}
                      </p>
                      <p className="text-[12px] text-text-tertiary">
                        On file for the {PLAN_LABELS[user.subscription.tier]} plan
                        {user.subscription.cancelAtPeriodEnd && user.subscription.currentPeriodEnd
                          ? ` · ends ${formatPeriodEnd(user.subscription.currentPeriodEnd)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setUnlinkOpen(true)}
                    disabled={user.subscription.cancelAtPeriodEnd}
                  >
                    {user.subscription.cancelAtPeriodEnd ? "Unlink scheduled" : "Unlink card"}
                  </Button>
                </div>
              ) : (
                <p className="text-[13px] text-text-secondary">
                  No payment method on file.{" "}
                  <Link href="/billing" className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover">
                    Upgrade a plan
                  </Link>{" "}
                  to add one.
                </p>
              )}
              {unlinkError ? <p className="mt-2 text-[12.5px] text-danger">{unlinkError}</p> : null}
            </div>
          </section>

          <section
            id="analysis-defaults"
            ref={(node) => {
              sectionRefs.current["analysis-defaults"] = node;
            }}
            className="rounded-card border border-border-default bg-surface-1 p-5"
          >
            <h2 className="text-[15px] font-semibold text-text-primary">Analysis defaults</h2>
            <p className="mt-1 text-[13px] text-text-secondary">
              These values are preselected when you start a new project analysis.
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-[12.5px] font-medium text-text-secondary">Experience level</label>
                <Select
                  aria-label="Experience level"
                  value={draft.experience}
                  onChange={(value) => update("experience", value)}
                  options={EXPERIENCE_OPTIONS}
                />
                <p className="mt-1.5 text-[12px] text-text-tertiary">Adjusts delivery estimates and recommended pricing.</p>
              </div>

              <div>
                <label className="mb-2 block text-[12.5px] font-medium text-text-secondary">Preferred currency</label>
                <Select
                  aria-label="Preferred currency"
                  value={draft.currency}
                  onChange={(value) => update("currency", value)}
                  options={CURRENCY_OPTIONS}
                />
              </div>

              <div>
                <label className="mb-2 block text-[12.5px] font-medium text-text-secondary">Target hourly rate</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[13.5px] text-text-tertiary">
                    $
                  </span>
                  <Input
                    value={hourlyRateInput}
                    onChange={(event) => {
                      setHourlyRateInput(event.target.value);
                      setHourlyRateError(null);
                      setSaveState("idle");
                    }}
                    inputMode="decimal"
                    aria-label="Target hourly rate"
                    aria-invalid={hourlyRateError ? "true" : undefined}
                    className={cn("pl-7", hourlyRateError && "border-danger focus-visible:ring-danger/20")}
                  />
                </div>
                {hourlyRateError ? (
                  <p className="mt-1.5 text-[12px] text-danger">{hourlyRateError}</p>
                ) : (
                  <p className="mt-1.5 text-[12px] text-text-tertiary">Used to translate estimates into an hourly view.</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-[12.5px] font-medium text-text-secondary">Analysis depth</label>
                <SegmentedControl
                  aria-label="Analysis depth"
                  options={DEPTH_OPTIONS}
                  value={draft.depth}
                  onChange={(value) => update("depth", value)}
                />
              </div>
            </div>
          </section>

          <section
            id="proposal-preferences"
            ref={(node) => {
              sectionRefs.current["proposal-preferences"] = node;
            }}
            className="rounded-card border border-border-default bg-surface-1 p-5"
          >
            <h2 className="text-[15px] font-semibold text-text-primary">Proposal preferences</h2>
            <p className="mt-1 text-[13px] text-text-secondary">Choose how client-ready proposal copy should sound by default.</p>

            <div className="mt-5">
              <label className="mb-2 block text-[12.5px] font-medium text-text-secondary">Default tone</label>
              <SegmentedControl
                aria-label="Default proposal tone"
                options={TONE_OPTIONS}
                value={draft.tone}
                onChange={(value) => update("tone", value)}
              />
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-[12.5px] font-medium text-text-secondary">Preferred stack</label>
                <Input
                  value={draft.preferredStack}
                  onChange={(event) => update("preferredStack", event.target.value)}
                  aria-label="Preferred stack"
                  placeholder="React, TypeScript, Python"
                />
              </div>
              <div>
                <label className="mb-2 block text-[12.5px] font-medium text-text-secondary">Risk tolerance</label>
                <Select
                  aria-label="Risk tolerance"
                  value={draft.riskTolerance}
                  onChange={(value) => update("riskTolerance", value)}
                  options={RISK_TOLERANCE_OPTIONS}
                />
              </div>
            </div>
          </section>

          <section
            id="data-and-privacy"
            ref={(node) => {
              sectionRefs.current["data-and-privacy"] = node;
            }}
            className="rounded-card border border-border-default bg-surface-1 p-5"
          >
            <h2 className="text-[15px] font-semibold text-text-primary">Local data</h2>
            <p className="mt-1 text-[13px] text-text-secondary">
              ScopeForge currently stores anonymous history and preferences in this browser.
            </p>

            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button variant="secondary" size="sm" onClick={handleExportAll}>
                Export all data
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setClearHistoryOpen(true)}>
                Clear analysis history
              </Button>
            </div>
          </section>
        </div>
      </div>

      <DeleteConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset settings to defaults?"
        description="This discards your saved analysis and proposal defaults and restores the original values."
        itemSummary={<p className="text-[13px] text-text-secondary">Your analysis history is not affected.</p>}
        onConfirm={handleReset}
        confirmLabel="Reset to defaults"
      />

      <DeleteConfirmDialog
        open={clearHistoryOpen}
        onOpenChange={setClearHistoryOpen}
        title="Clear analysis history?"
        description="This permanently removes every saved analysis from this browser. This action cannot be undone."
        itemSummary={
          <p className="text-[13px] text-text-secondary">
            {(() => {
              // Read once instead of twice (was calling historyStore.list()
              // — a localStorage read + JSON.parse — a second time in the
              // same expression just to check the count for "is"/"es").
              const count = historyStore.list().length;
              return (
                <>
                  {count} analys{count === 1 ? "is" : "es"} will be removed.
                </>
              );
            })()}
          </p>
        }
        onConfirm={() => historyStore.clear()}
        confirmLabel="Clear history"
      />

      {user ? (
        <DeleteConfirmDialog
          open={unlinkOpen}
          onOpenChange={setUnlinkOpen}
          title="Unlink this card?"
          description="Your plan and its benefits stay active until the end of the current billing period. After that, your account moves to the free Spark plan and this card is removed."
          itemSummary={
            <p className="text-[13px] text-text-secondary">
              {user.subscription.cardBrand} •••• {user.subscription.cardLast4}
            </p>
          }
          confirmLabel={unlinking ? "Unlinking…" : "Unlink card"}
          onConfirm={() => void handleUnlinkCard()}
        />
      ) : null}
    </div>
  );
}
