"use client";

import { useState } from "react";
import { Check, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { AnalysisSummary } from "@/types/history";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DeleteConfirmDialog } from "@/components/product/DeleteConfirmDialog";
import { relativeTimeFromNow } from "@/lib/format";

export interface HistoryRowMenuProps {
  analysis: AnalysisSummary;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function HistoryRowMenu({ analysis, onDelete, onDuplicate, onRename }: HistoryRowMenuProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(analysis.title);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/analysis/${analysis.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied by the browser; fail silently.
    }
  }

  function submitRename() {
    const trimmed = draftTitle.trim();
    if (trimmed.length > 0) onRename(analysis.id, trimmed);
    setRenameOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label={`More actions for ${analysis.title}`} variant="ghost">
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => onDuplicate(analysis.id)}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            Duplicate analysis
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              // R016: previously called event.preventDefault() here, which
              // blocks Radix's default close-on-select behavior — the
              // dropdown stayed open behind the Rename dialog until an
              // extra outside click. The Delete item below never had this
              // problem specifically because it doesn't preventDefault;
              // matching that (letting the menu close normally, same as
              // any other item) fixes it the same way.
              setDraftTitle(analysis.title);
              setRenameOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Rename
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

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogTitle>Rename analysis</DialogTitle>
          <DialogDescription>This only changes the label in your local history.</DialogDescription>
          <Input
            autoFocus
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitRename();
            }}
            className="mt-4"
            aria-label="Analysis title"
          />
          <div className="mt-6 flex justify-end gap-2.5">
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="primary" size="sm" onClick={submitRename} disabled={draftTitle.trim().length === 0}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this analysis?"
        description="The report and generated proposal will be removed from this browser. This action cannot be undone."
        itemSummary={
          <div>
            <p className="truncate text-[13px] font-medium text-text-primary">{analysis.title}</p>
            <p className="mt-0.5 text-[12px] text-text-tertiary">
              Score {analysis.score} · created {relativeTimeFromNow(analysis.createdAt)}
            </p>
          </div>
        }
        onConfirm={() => onDelete(analysis.id)}
      />
    </>
  );
}
