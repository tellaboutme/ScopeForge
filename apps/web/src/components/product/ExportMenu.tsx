"use client";

import { Download, FileJson, FileText, Printer } from "lucide-react";
import type { ProjectAnalysis } from "@/types/analysis";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { Button } from "@/components/ui/Button";
import { buildJsonReport, buildMarkdownReport, downloadFile } from "@/lib/export";

export function ExportMenu({ analysis }: { analysis: ProjectAnalysis }) {
  const fileBase = (analysis.source.title ?? "scopeforge-analysis").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <Download className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => downloadFile(`${fileBase}.md`, buildMarkdownReport(analysis), "text/markdown")}>
          <FileText className="h-4 w-4" aria-hidden="true" />
          Export as Markdown
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadFile(`${fileBase}.json`, buildJsonReport(analysis), "application/json")}>
          <FileJson className="h-4 w-4" aria-hidden="true" />
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print report
        </DropdownMenuItem>
        <p className="px-2.5 pb-1 pt-2 text-[11px] leading-snug text-text-tertiary">
          The complete report is included, not just the visible sections.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
