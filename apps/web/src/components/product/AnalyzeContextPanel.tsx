import Link from "next/link";
import { mockAnalysis } from "@/lib/mock-analysis";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";

const VALUE_PROPS = [
  { title: "Decision-ready verdict", description: "Take, negotiate, or skip with a clear reason." },
  { title: "Price and timeline", description: "A realistic range adjusted to your level." },
  { title: "Hidden scope and risks", description: "Requirements the client did not mention." },
  { title: "Client response", description: "Questions and a proposal ready to copy." }
];

export function AnalyzeContextPanel() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-border-default bg-surface-1 p-5">
        <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">What you will get</h3>
        <ul className="mt-3 flex flex-col gap-4">
          {VALUE_PROPS.map((item, index) => (
            <li key={item.title} className="flex gap-3">
              <span className="mt-0.5 shrink-0 font-mono text-[11px] text-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-text-primary">{item.title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-card border border-border-default bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold leading-[20px] text-text-primary">Recent example</h3>
          <Badge tone="success" dot>
            {mockAnalysis.score.total} score
          </Badge>
        </div>
        <p className="mt-3 text-[13px] font-medium text-text-primary">{mockAnalysis.source.title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
          Authentication, billing, reporting, and team access. Recommended: negotiate first.
        </p>
        <Link href="/analysis/demo" className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-4 w-full" })}>
          Open demo report
        </Link>
      </div>
    </div>
  );
}
