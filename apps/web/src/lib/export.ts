import type { ProjectAnalysis } from "@/types/analysis";
import { applyProposalName, formatCurrency, formatCurrencyRange, VERDICT_LABEL } from "@/lib/format";
import { settingsStore } from "@/lib/settings-store";

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function buildMarkdownReport(analysis: ProjectAnalysis): string {
  const lines: string[] = [];
  const title = analysis.source.title ?? "Project analysis";

  lines.push(`# ${title}`, "");
  lines.push(`**Verdict:** ${VERDICT_LABEL[analysis.verdict.decision]} (${analysis.verdict.confidence}% confidence)`, "");
  lines.push(analysis.verdict.summary, "");
  lines.push(`**Project score:** ${analysis.score.total}/100`, "");
  lines.push(
    `**Recommended price:** ${formatCurrency(analysis.estimate.budgetRecommended, analysis.estimate.currency)} ` +
      `(range ${formatCurrencyRange(analysis.estimate.budgetMin, analysis.estimate.budgetMax, analysis.estimate.currency)})`,
    ""
  );
  lines.push(`**Estimated duration:** ${analysis.estimate.durationMinDays}–${analysis.estimate.durationMaxDays} days`, "");

  if (analysis.risks.length) {
    lines.push("## Key risks", "");
    for (const risk of analysis.risks) {
      lines.push(`- **${risk.title}** (${risk.severity}) — ${risk.description} _Mitigation: ${risk.mitigation}_`);
    }
    lines.push("");
  }

  if (analysis.clientQuestions.length) {
    lines.push("## Questions for the client", "");
    analysis.clientQuestions.forEach((question, index) => lines.push(`${index + 1}. ${question}`));
    lines.push("");
  }

  // D047: substitute the Settings name into the "[YOUR NAME]" placeholder so
  // the exported proposal matches what's shown on screen (falls back to the
  // placeholder when no name is set).
  lines.push("## Proposal", "", applyProposalName(analysis.proposal.full, settingsStore.load().freelancerName));

  return lines.join("\n");
}

export function buildJsonReport(analysis: ProjectAnalysis): string {
  return JSON.stringify(analysis, null, 2);
}
