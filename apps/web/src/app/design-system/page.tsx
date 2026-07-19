"use client";

import { mockAnalysis } from "@/lib/mock-analysis";
import { PageHeader } from "@/components/product/PageHeader";
import { VerdictCard } from "@/components/product/VerdictCard";
import { ScoreCard } from "@/components/product/ScoreCard";
import { BudgetCard } from "@/components/product/BudgetCard";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { ScoreBreakdownSkeleton } from "@/components/product/ScoreBreakdownCard";

// Code-split, same reasoning as /analysis/[id] (D036) — recharts shouldn't
// be part of this route's initial bundle just because one demo card uses it.
const ScoreBreakdownCard = dynamic(
  () => import("@/components/product/ScoreBreakdownCard").then((mod) => mod.ScoreBreakdownCard),
  { ssr: false, loading: () => <ScoreBreakdownSkeleton /> }
);
import { TimelineCard } from "@/components/product/TimelineCard";
import { RiskList } from "@/components/product/RiskList";
import { RequirementsTabs } from "@/components/product/RequirementsTabs";
import { ProposalEditor } from "@/components/product/ProposalEditor";
import { TechStackGrid } from "@/components/product/TechStackGrid";
import { ClientQuestionList } from "@/components/product/ClientQuestionList";
import { SectionFailure } from "@/components/product/SectionFailure";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import { ClientDetailsFields } from "@/components/product/ClientDetailsFields";
import type { ClientBudgetType, ClientDeadlineUnit } from "@/lib/constants";
import { Checkbox } from "@/components/ui/Checkbox";
import { useState } from "react";

const COLOR_TOKENS: Array<{ name: string; className: string; hex: string }> = [
  { name: "background", className: "bg-background", hex: "#070812" },
  { name: "background-elevated", className: "bg-background-elevated", hex: "#0b0d18" },
  { name: "surface-1", className: "bg-surface-1", hex: "#0e1020" },
  { name: "surface-2", className: "bg-surface-2", hex: "#121528" },
  { name: "surface-hover", className: "bg-surface-hover", hex: "#171a31" },
  { name: "accent", className: "bg-accent", hex: "#7c5cff" },
  { name: "accent-hover", className: "bg-accent-hover", hex: "#8d72ff" },
  { name: "success", className: "bg-success", hex: "#35d69f" },
  { name: "warning", className: "bg-warning", hex: "#f1b955" },
  { name: "danger", className: "bg-danger", hex: "#f36b78" },
  { name: "info", className: "bg-info", hex: "#63a7ff" }
];

// Stress fixtures for docs/QA_CHECKLIST.md content tests — not part of the
// canonical mock-analysis.ts, which stays a clean "happy path" demo payload.
const STRESS_RISKS = [
  { title: "Undefined analytics scope and reporting requirements", description: "The brief lists a dashboard but never states which metrics, filters, date ranges, or export formats the client actually needs, so the backend data model cannot be finalized yet.", severity: "high" as const, mitigation: "Request a written inventory of every metric, chart, and filter the client expects to see before writing the schema." },
  { title: "Ambiguous multi-tenant permission model", description: "Team management is mentioned once with no detail on roles, invite flow, or whether permissions are per-project or account-wide.", severity: "high" as const, mitigation: "Propose a simple three-role matrix (owner/editor/viewer) as a starting point and confirm it in writing." },
  { title: "Unclear third-party billing edge cases", description: "Trial periods, failed payments, downgrades, and refunds are not addressed anywhere in the brief.", severity: "medium" as const, mitigation: "List the standard Stripe subscription lifecycle states and ask which ones are in scope for v1." },
  { title: "No performance or scale targets provided", description: "There's no indication of expected data volume, concurrent users, or response-time expectations for the analytics queries.", severity: "medium" as const, mitigation: "Ask for rough current or projected user/data counts to size the database and caching layer correctly." },
  { title: "Design assets are not finalized", description: "The client references \"a clean modern look\" but has not shared mockups, a style guide, or brand colors.", severity: "medium" as const, mitigation: "Clarify whether UI design is in scope or whether a lightweight design system should be assumed." },
  { title: "Fixed deadline mentioned informally in chat, not in the brief", description: "A launch date was mentioned in a prior message but is not part of the written scope, creating risk of a mismatch later.", severity: "low" as const, mitigation: "Get the target date restated in writing as part of the signed scope document." }
];

const STRESS_MILESTONES = [
  { title: "Discovery and requirements workshop", description: "Confirm scope, data model, and delivery plan with the client.", durationDays: 3, percentage: 8 },
  { title: "Information architecture and wireframes", description: "Map every screen and state before writing code.", durationDays: 4, percentage: 9 },
  { title: "Design system and UI kit", description: "Establish tokens, primitives, and core layout.", durationDays: 5, percentage: 10 },
  { title: "Authentication and account management", description: "Sign-up, sign-in, password reset, and sessions.", durationDays: 6, percentage: 9 },
  { title: "Core application shell", description: "Navigation, routing, and layout scaffolding.", durationDays: 4, percentage: 7 },
  { title: "Analytics data pipeline", description: "Ingestion, aggregation, and storage for reporting.", durationDays: 8, percentage: 12 },
  { title: "Analytics dashboard UI", description: "Charts, filters, and export for the reporting views.", durationDays: 7, percentage: 10 },
  { title: "Billing integration", description: "Stripe subscriptions, webhooks, and invoices.", durationDays: 5, percentage: 8 },
  { title: "Team and permissions", description: "Roles, invites, and access control.", durationDays: 5, percentage: 8 },
  { title: "Settings and account preferences", description: "User and workspace-level configuration.", durationDays: 3, percentage: 6 },
  { title: "QA pass and bug fixing", description: "Cross-browser and cross-device verification.", durationDays: 5, percentage: 8 },
  { title: "Deployment and handoff documentation", description: "Production deploy plus a short operations guide.", durationDays: 3, percentage: 5 }
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-[16px] font-semibold leading-[22px] text-text-primary">{title}</h2>
      {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function DesignSystemPage() {
  const [demoOption, setDemoOption] = useState<"beginner" | "intermediate" | "expert">("intermediate");
  const [demoBudget, setDemoBudget] = useState("");
  const [demoBudgetType, setDemoBudgetType] = useState<ClientBudgetType>("fixed");
  const [demoDeadlineDays, setDemoDeadlineDays] = useState("");
  const [demoDeadlineUnit, setDemoDeadlineUnit] = useState<ClientDeadlineUnit>("days");
  const [demoChecked, setDemoChecked] = useState(true);

  return (
    <div>
      <PageHeader
        eyebrow="ScopeForge"
        title="Design system"
        description="Internal QA route — tokens, primitives, and component states. Not linked in public navigation."
      />

      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {COLOR_TOKENS.map((token) => (
            <div key={token.name} className="rounded-card border border-border-default bg-surface-1 p-3">
              <div className={`h-14 w-full rounded-control border border-border-subtle ${token.className}`} />
              <p className="mt-2 text-[12px] font-medium text-text-primary">{token.name}</p>
              <p className="font-mono text-[11px] text-text-tertiary">{token.hex}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography scale">
        <div className="flex flex-col gap-4 rounded-card border border-border-default bg-surface-1 p-5">
          <p className="text-[28px] font-[650] leading-[34px] text-text-primary">Page title / 28 / 650</p>
          <p className="text-[16px] font-semibold leading-[22px] text-text-primary">Section title / 16 / 600</p>
          <p className="text-[14px] font-semibold leading-[20px] text-text-primary">Card title / 14 / 600</p>
          <p className="text-[14px] leading-[21px] text-text-secondary">Body / 14 — the quick brown fox jumps over the lazy dog.</p>
          <p className="text-[13px] leading-[19px] text-text-tertiary">Secondary / 13 — the quick brown fox jumps over the lazy dog.</p>
          <p className="text-[12px] leading-[16px] text-text-tertiary">Caption / 12 — the quick brown fox jumps over the lazy dog.</p>
        </div>
      </Section>

      <Section
        title="Custom fonts"
        description="User-supplied local fonts, each scoped to one job — not mixed into general UI copy."
      >
        <div className="flex flex-col gap-5 rounded-card border border-border-default bg-surface-1 p-5">
          <div>
            <p className="text-[12px] text-text-tertiary">Logo — Cinzel SemiBold, logo/wordmark only</p>
            <p className="font-logo mt-1 text-[28px] font-semibold tracking-wide text-text-primary">ScopeForge</p>
          </div>
          <div>
            <p className="text-[12px] text-text-tertiary">Display — Bebas Neue, verdict decision headline only</p>
            <p className="font-display mt-1 text-[44px] font-normal uppercase leading-[46px] tracking-wide text-text-primary">
              Negotiate first
            </p>
          </div>
          <div>
            <p className="text-[12px] text-text-tertiary">Mono — Roboto Mono, numeric/technical family (scores, prices, durations)</p>
            <p className="font-mono mt-1 text-[28px] font-semibold text-text-primary">84/100 · $5,500 · 6–8 weeks</p>
          </div>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-border-default bg-surface-1 p-5">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="primary" size="sm">
            Primary sm
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <IconButton aria-label="Example icon button" variant="secondary">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
      </Section>

      <Section title="Badges and status">
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-border-default bg-surface-1 p-5">
          <Badge tone="success" dot>
            Excellent
          </Badge>
          <Badge tone="info" dot>
            Good
          </Badge>
          <Badge tone="warning" dot>
            Fair
          </Badge>
          <Badge tone="danger" dot>
            Weak
          </Badge>
          <Badge tone="neutral">Fixed</Badge>
          <Badge tone="accent">Verdict</Badge>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="flex flex-col gap-4 rounded-card border border-border-default bg-surface-1 p-5">
          <div className="max-w-xs">
            <SegmentedControl
              aria-label="Demo segmented control"
              options={[
                { value: "beginner", label: "Beginner" },
                { value: "intermediate", label: "Intermediate" },
                { value: "expert", label: "Expert" }
              ]}
              value={demoOption}
              onChange={setDemoOption}
            />
          </div>
          <Textarea placeholder="Paste the complete project description here…" className="min-h-[120px] max-w-lg" />
          <div className="max-w-lg">
            <ClientDetailsFields
              budget={demoBudget}
              onBudgetChange={setDemoBudget}
              budgetType={demoBudgetType}
              onBudgetTypeChange={setDemoBudgetType}
              currency="USD"
              deadlineDays={demoDeadlineDays}
              onDeadlineDaysChange={setDemoDeadlineDays}
              deadlineUnit={demoDeadlineUnit}
              onDeadlineUnitChange={setDemoDeadlineUnit}
            />
          </div>
          <Checkbox checked={demoChecked} onChange={setDemoChecked} label="Include client questions when copying" />
        </div>
      </Section>

      <Section title="Skeleton / loading">
        <div className="flex flex-col gap-2 rounded-card border border-border-default bg-surface-1 p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Section>

      <Section title="Verdict, score, and price — loaded" description="Report top region using the deterministic mock payload.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <VerdictCard verdict={mockAnalysis.verdict} score={mockAnalysis.score} />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-4">
            <ScoreCard score={mockAnalysis.score} />
            <BudgetCard estimate={mockAnalysis.estimate} />
          </div>
        </div>
      </Section>

      <Section title="Verdict, score, and price — loading" description="Cards preserve their final dimensions while loading.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <VerdictCard loading />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-4">
            <ScoreCard loading />
            <BudgetCard loading />
          </div>
        </div>
      </Section>

      <Section title="Report — second row" description="Score breakdown (hidden below lg), timeline, key risks.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <ScoreBreakdownCard score={mockAnalysis.score} />
          </div>
          <div className="lg:col-span-5">
            <TimelineCard milestones={mockAnalysis.milestones} estimate={mockAnalysis.estimate} />
          </div>
          <div className="lg:col-span-3">
            <RiskList risks={mockAnalysis.risks} />
          </div>
        </div>
      </Section>

      <Section title="Report — third row" description="Scope tabs and the generated proposal.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <RequirementsTabs requirements={mockAnalysis.requirements} />
          </div>
          <div className="lg:col-span-5">
            <ProposalEditor
              proposal={mockAnalysis.proposal}
              clientQuestions={mockAnalysis.clientQuestions}
            />
          </div>
        </div>
      </Section>

      <Section title="Report — fourth row" description="Recommended stack and client questions.">
        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
          <TechStackGrid techStack={mockAnalysis.techStack} />
          <ClientQuestionList questions={mockAnalysis.clientQuestions} />
        </div>
      </Section>

      <Section title="Zero-state variants" description="Empty risks and empty client questions.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RiskList risks={[]} />
          <ClientQuestionList questions={[]} />
        </div>
      </Section>

      <Section title="Section failure" description="Independent fallback shown when a single report section fails to load.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SectionFailure message="The model provider returned an invalid response for this section." onRetry={() => {}} />
          <SectionFailure title="Timeline unavailable" message="Milestones could not be generated for this brief." />
        </div>
      </Section>

      <Section
        title="Content stress test"
        description="docs/QA_CHECKLIST.md: six long risks and twelve timeline milestones. Layout must not break."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TimelineCard
            milestones={STRESS_MILESTONES}
            estimate={{ ...mockAnalysis.estimate, durationMinDays: 45, durationMaxDays: 58 }}
          />
          <RiskList risks={STRESS_RISKS} />
        </div>
      </Section>
    </div>
  );
}
