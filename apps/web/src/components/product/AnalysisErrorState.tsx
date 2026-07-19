import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface AnalysisErrorStateProps {
  brief: string;
  message?: string;
  onRetryDetailed: () => void;
  onBackToEditor: () => void;
  onSwitchToQuick: () => void;
}

export function AnalysisErrorState({ brief, message, onRetryDetailed, onBackToEditor, onSwitchToQuick }: AnalysisErrorStateProps) {
  const preview = brief.length > 140 ? `${brief.slice(0, 140).trim()}…` : brief;

  return (
    <div className="flex justify-center pt-6 sm:pt-10">
      <div className="w-full max-w-[560px] rounded-modal border border-border-default bg-surface-1 p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-control bg-danger-muted text-danger">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>

        <h2 className="mt-5 text-[22px] font-semibold leading-[28px] text-text-primary">
          We could not complete the analysis
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          {message ?? "The model provider returned an invalid response. Your project description and settings have been preserved."}
        </p>

        <div className="mt-5 rounded-control border border-border-subtle bg-surface-2 p-3.5 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Saved brief</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">{preview}</p>
        </div>

        <div className="mt-6 flex flex-col-reverse items-center justify-center gap-2.5 sm:flex-row">
          <Button variant="secondary" onClick={onBackToEditor} className="w-full sm:w-auto">
            Back to editor
          </Button>
          <Button variant="primary" onClick={onRetryDetailed} className="w-full sm:w-auto">
            Retry detailed analysis
          </Button>
        </div>

        <button
          type="button"
          onClick={onSwitchToQuick}
          className="mt-4 text-[13px] font-medium text-text-tertiary transition-colors duration-150 hover:text-text-primary"
        >
          Switch to quick analysis
        </button>
      </div>
    </div>
  );
}
