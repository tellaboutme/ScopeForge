"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogOverlay({ className, ...props }: ComponentPropsWithoutRef<typeof RadixDialog.Overlay>) {
  return (
    <RadixDialog.Overlay
      className={cn("animate-overlay-fade fixed inset-0 z-50 bg-[#020208]/70 backdrop-blur-sm", className)}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDialog.Content>) {
  return (
    <RadixDialog.Portal>
      <DialogOverlay />
      <RadixDialog.Content
        className={cn(
          // Centering used to come from Tailwind's -translate-x-1/2/-translate-y-1/2
          // utilities layered under the animation; a running CSS `animation`
          // fully replaces the `transform` property for its duration, which
          // was silently uncentering this dialog for the whole open/close
          // animation. .animate-dialog-pop's keyframes now bake the -50%/-50%
          // offset into every frame directly (see globals.css), so those
          // translate utilities must NOT be reapplied here — that would just
          // reintroduce the same conflict.
          "animate-dialog-pop fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-28px))]",
          "rounded-modal border border-border-default bg-surface-1 p-6 shadow-[0_24px_60px_rgba(2,3,10,0.6)]",
          "focus:outline-none",
          className
        )}
        {...props}
      >
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof RadixDialog.Title>) {
  return <RadixDialog.Title className={cn("text-[17px] font-semibold text-text-primary", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentPropsWithoutRef<typeof RadixDialog.Description>) {
  return <RadixDialog.Description className={cn("mt-1.5 text-sm leading-relaxed text-text-secondary", className)} {...props} />;
}
