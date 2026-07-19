"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ProjectAnalysis } from "@/types/analysis";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { IconButton } from "@/components/ui/IconButton";
import { DeleteConfirmDialog } from "@/components/product/DeleteConfirmDialog";
import { Badge } from "@/components/ui/Badge";
import { generateAnalysisId } from "@/lib/concepts";
import { analysisStore } from "@/lib/analysis-store";
import { historyStore, summarizeAnalysis } from "@/lib/history-store";
import { duplicateAnalysisRemote, deleteAnalysisRemote } from "@/lib/api";

export function ReportOverflowMenu({ analysis }: { analysis: ProjectAnalysis }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied by the browser; fail silently.
    }
  }

  async function duplicate() {
    if (duplicating) return;
    setDuplicating(true);
    try {
      // Prefer the server's copy (it exists as a DB record there); fall
      // back to a local-only duplicate for analyses that only ever lived
      // in this browser (e.g. the "demo" record, never POSTed).
      let copy: ProjectAnalysis;
      try {
        copy = await duplicateAnalysisRemote(analysis.id);
      } catch {
        copy = {
          ...analysis,
          id: generateAnalysisId(),
          createdAt: new Date().toISOString(),
          source: {
            ...analysis.source,
            title: analysis.source.title ? `${analysis.source.title} (copy)` : undefined
          }
        };
      }
      analysisStore.save(copy);
      historyStore.add(summarizeAnalysis(copy));
      router.push(`/analysis/${copy.id}`);
    } finally {
      setDuplicating(false);
    }
  }

  async function confirmDelete() {
    analysisStore.remove(analysis.id);
    historyStore.remove(analysis.id);
    try {
      await deleteAnalysisRemote(analysis.id);
    } catch {
      // Best-effort — the record is already gone locally either way, and
      // may never have existed server-side (e.g. the "demo" record).
    }
    router.push("/history");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label="More report actions" variant="secondary">
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={(event) => { event.preventDefault(); void duplicate(); }}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {duplicating ? "Duplicating…" : "Duplicate analysis"}
          </DropdownMenuItem>
          <DropdownMenuItem disabled onSelect={(event) => event.preventDefault()}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Rename (coming soon)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(event) => { event.preventDefault(); void copyLink(); }}>
            {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? "Link copied" : "Copy report link"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete analysis
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this analysis?"
        description="This removes the analysis from your local history and the server record, if one exists. This action cannot be undone."
        itemSummary={
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] font-medium text-text-primary">
              {analysis.source.title ?? "Untitled analysis"}
            </span>
            <Badge tone="neutral">{analysis.score.total}/100</Badge>
          </div>
        }
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
