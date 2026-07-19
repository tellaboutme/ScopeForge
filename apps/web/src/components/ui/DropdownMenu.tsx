"use client";

import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const DropdownMenu = RadixDropdown.Root;
export const DropdownMenuTrigger = RadixDropdown.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  align = "end",
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDropdown.Content>) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "animate-menu-pop z-50 min-w-[196px] max-w-[280px] rounded-card border border-border-default",
          "bg-surface-1 p-1.5 shadow-[0_16px_40px_rgba(2,3,10,0.55)]",
          className
        )}
        {...props}
      >
        {children}
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive = false,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDropdown.Item> & { destructive?: boolean }) {
  return (
    <RadixDropdown.Item
      className={cn(
        "flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-control px-2.5 text-sm outline-none",
        "text-text-primary data-[highlighted]:bg-surface-hover",
        destructive && "text-danger data-[highlighted]:bg-danger-muted",
        className
      )}
      {...props}
    >
      {children}
    </RadixDropdown.Item>
  );
}

export function DropdownMenuSeparator({ className, ...props }: ComponentPropsWithoutRef<typeof RadixDropdown.Separator>) {
  return <RadixDropdown.Separator className={cn("my-1.5 h-px bg-border-subtle", className)} {...props} />;
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 py-1.5 text-xs text-text-tertiary">{children}</div>;
}
