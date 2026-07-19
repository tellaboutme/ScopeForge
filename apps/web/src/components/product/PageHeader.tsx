import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** "center" (D040, user-flagged on /billing) centers the eyebrow/title/
   * description block instead of the default left-aligned-with-right-actions
   * layout every other page uses. Only meant for pages with no `actions` and
   * their own centered content column below (e.g. /billing) — left unused
   * elsewhere so the report-hierarchy-driven pages are untouched.
   *
   * D044: the caller must render this header *inside* the same
   * width-constrained centered container as the content below it (see
   * /billing's single `mx-auto max-w-[880px]` wrapper) — otherwise "center"
   * centers this block against the full, wider content column instead of
   * against the narrower content underneath, visibly misaligning the two. */
  align?: "left" | "center";
}

export function PageHeader({ eyebrow, title, description, actions, align = "left" }: PageHeaderProps) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 lg:mb-8",
        // D045: when centered, emit ONLY the centering classes. Previously
        // this always emitted the left-aligned row layout (lg:flex-row
        // lg:items-start lg:justify-between) and *appended* lg:flex-col
        // lg:items-center for the centered case — but Tailwind resolves
        // conflicting utilities by stylesheet order, not className order,
        // and lg:items-start won over lg:items-center, so the header block
        // stayed pinned to the left edge of its wrapper (visibly off-center
        // over the plan cards on /billing). Choosing one set or the other
        // avoids the conflict entirely.
        centered ? "lg:items-center" : "lg:flex-row lg:items-start lg:justify-between"
      )}
    >
      <div className={cn("min-w-0", centered && "text-center")}>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-[26px] font-[650] leading-[32px] text-text-primary sm:text-[28px] sm:leading-[34px]">
          {title}
        </h1>
        {description ? (
          <div className={cn("mt-1.5 text-sm text-text-secondary", !centered && "truncate")}>{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
