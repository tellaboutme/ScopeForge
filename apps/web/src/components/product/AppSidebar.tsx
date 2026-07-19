"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "@/lib/constants";
import { Logo } from "@/components/product/Logo";
import { UserMenu } from "@/components/product/UserMenu";
import { UsagePlaque } from "@/components/product/UsagePlaque";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border-subtle bg-background-elevated lg:flex">
      <div className="flex h-14 items-center px-5">
        <Logo />
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
    </aside>
  );
}
