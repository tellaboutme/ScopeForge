import Link from "next/link";
import type { AnalysisSummary } from "@/types/history";
import { VERDICT_LABEL, VERDICT_TONE, formatCurrency, formatDurationRange, relativeTimeFromNow, scoreStatus } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { HistoryRowMenu } from "@/components/product/HistoryRowMenu";

const SCORE_TILE_TONE: Record<ReturnType<typeof scoreStatus>["tone"], string> = {
  success: "bg-success-muted text-success",
  info: "bg-info-muted text-info",
  warning: "bg-warning-muted text-warning",
  danger: "bg-danger-muted text-danger"
};

export interface HistoryRowProps {
  analysis: AnalysisSummary;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, title: string) => void;
  /** Whether to draw the bottom border. Previously a `last:border-b-0` CSS
   * rule on this element handled that automatically, but the motion-polish
   * milestone wraps each row in its own `m.div` for enter/exit animation —
   * making this row the DOM's only child of that wrapper and permanently
   * "last" from `last:`'s point of view. The caller now computes "is this
   * the last row in the actual filtered list" and passes it down instead. */
  showBorder?: boolean;
}

export function HistoryRow({ analysis, onDelete, onDuplicate, onRename, showBorder = true }: HistoryRowProps) {
  const tone = scoreStatus(analysis.score).tone;

  return (
    <div
      className={cn(
        "grid grid-cols-[44px_minmax(0,1fr)_auto_40px] items-center gap-3 px-4 py-3.5 sm:px-5 lg:grid-cols-[48px_minmax(0,1fr)_112px_100px_120px_40px] lg:gap-4",
        showBorder && "border-b border-border-subtle"
      )}
    >
      <Link
        href={`/analysis/${analysis.id}`}
        className="col-span-2 flex min-w-0 items-center gap-3 rounded-control outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        aria-label={`Open ${analysis.title}`}
      >
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-control font-mono text-[15px] font-semibold",
            SCORE_TILE_TONE[tone]
          )}
        >
          {analysis.score}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-text-primary">{analysis.title}</span>
          <span className="mt-0.5 block truncate text-[12px] text-text-tertiary">
            {analysis.platform} · {analysis.wordCount} words · {relativeTimeFromNow(analysis.createdAt)}
          </span>
        </span>
      </Link>

      <div className="hidden lg:block">
        <Badge tone={VERDICT_TONE[analysis.verdict]}>{VERDICT_LABEL[analysis.verdict]}</Badge>
      </div>

      <span className="hidden font-mono text-[13px] text-text-primary lg:block">
        {formatCurrency(analysis.estimateRecommended, analysis.currency)}
      </span>

      <span className="hidden text-[13px] text-text-secondary lg:block">
        {formatDurationRange(analysis.durationMinDays, analysis.durationMaxDays)}
      </span>

      <div className="flex items-center justify-end gap-2 lg:hidden">
        <Badge tone={VERDICT_TONE[analysis.verdict]}>{VERDICT_LABEL[analysis.verdict]}</Badge>
      </div>

      <HistoryRowMenu analysis={analysis} onDelete={onDelete} onDuplicate={onDuplicate} onRename={onRename} />
    </div>
  );
}
