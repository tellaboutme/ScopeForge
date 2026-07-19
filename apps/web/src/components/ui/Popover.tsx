"use client";

import * as RadixPopover from "@radix-ui/react-popover";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverClose = RadixPopover.Close;

export function PopoverContent({
  className,
  sideOffset = 8,
  align = "end",
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "animate-menu-pop z-50 w-[min(320px,calc(100vw-32px))] rounded-card border border-border-default",
          "bg-surface-1 p-4 shadow-[0_16px_40px_rgba(2,3,10,0.55)] outline-none",
          className
        )}
        {...props}
      >
        {children}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}
