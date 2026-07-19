"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { AppSidebar } from "@/components/product/AppSidebar";
import { MobileNav } from "@/components/product/MobileNav";

// The landing page owns its own header/nav (docs/PAGE_SPECS.md) — it never
// gets the app shell. /login and /signup (D037, Phase 9) are the same kind
// of standalone entry point: a centered auth form reads wrong wrapped in the
// app sidebar chrome for someone who isn't signed in yet.
const SHELL_EXCLUDED_ROUTES = new Set(["/", "/login", "/signup"]);

export function ShellGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const withShell = !SHELL_EXCLUDED_ROUTES.has(pathname);

  if (!withShell) {
    return <TooltipProvider>{children}</TooltipProvider>;
  }

  return (
    <TooltipProvider>
      <div className="min-h-dvh">
        {/* Phase 8 accessibility pass: visually hidden until keyboard-focused,
            lets a keyboard/screen-reader user skip the sidebar nav entirely
            instead of tabbing through every nav item on every page load. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-accent focus:px-4 focus:py-2.5 focus:text-[13px] focus:font-medium focus:text-white focus:outline-2 focus:outline-white focus:outline-offset-2"
        >
          Skip to main content
        </a>
        <AppSidebar />
        <MobileNav />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[1480px] px-4 pb-12 pt-20 md:px-5 md:pt-24 lg:ml-56 lg:px-6 lg:pb-16 lg:pt-8"
        >
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
