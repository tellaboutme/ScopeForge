"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Menu, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "@/lib/constants";
import { Logo } from "@/components/product/Logo";
import { UserMenu } from "@/components/product/UserMenu";
import { UsagePlaque } from "@/components/product/UsagePlaque";
import { DialogOverlay } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer automatically when the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-background-elevated px-4 lg:hidden">
        <Logo />
        <RadixDialog.Trigger asChild>
          <IconButton aria-label="Open navigation menu" variant="ghost">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </RadixDialog.Trigger>
      </header>

      <RadixDialog.Portal>
        <DialogOverlay />
        <RadixDialog.Content
          className={cn(
            // Dedicated slide keyframes (motion-polish milestone) — this
            // used to share .animate-dialog-pop with the centered Dialog,
            // which is a fade+scale animation with no meaning for a panel
            // pinned to the left edge. See globals.css.
            "animate-drawer-slide fixed inset-y-0 left-0 z-50 flex w-[calc(100vw-64px)] max-w-[320px] flex-col",
            "border-r border-border-subtle bg-background-elevated focus:outline-none"
          )}
        >
          <RadixDialog.Title className="sr-only">Navigation</RadixDialog.Title>
          <div className="flex h-14 items-center justify-between px-5">
            <Logo />
            <RadixDialog.Close asChild>
              <IconButton aria-label="Close navigation menu" variant="ghost">
                <X className="h-5 w-5" aria-hidden="true" />
              </IconButton>
            </RadixDialog.Close>
          </div>

          <nav className="flex flex-col gap-1 px-3 pt-2" aria-label="Primary">
            <Link
              href="/analyze"
              className="flex h-10 items-center gap-2.5 rounded-control bg-accent px-3 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-accent-hover"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New analysis
            </Link>
            {NAV_ITEMS.filter((item) => item.href !== "/analyze").map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-10 items-center gap-2.5 rounded-control px-3 text-[13px] font-medium transition-colors duration-150",
                    active
                      ? "bg-surface-hover text-text-primary before:absolute before:left-0 before:top-1/2 before:h-[18px] before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-accent"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "text-accent")} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border-subtle px-4 py-4">
            <UsagePlaque />
            <UserMenu />
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
