"use client";

import { getPasswordStrength } from "@/lib/password-strength";
import { cn } from "@/lib/cn";

const FILL_COLOR: Record<number, string> = {
  1: "bg-danger",
  2: "bg-warning",
  3: "bg-success"
};

const MESSAGE_COLOR: Record<number, string> = {
  0: "text-text-tertiary",
  1: "text-danger",
  2: "text-warning",
  3: "text-success"
};

/**
 * Live password-strength feedback for /signup (D044, user-flagged — the
 * password field only ever showed a pass/fail hint, not a "how am I doing"
 * signal while typing). Updates on every keystroke for free: `password` is
 * already a controlled input value re-rendering this on each change, and
 * getPasswordStrength() is a cheap pure function, so no debounce is needed.
 *
 * Mirrors UsageMeter's bar treatment (bg-surface-2 track, a colored fill,
 * width transition) rather than inventing a new meter language, just sized
 * down for a form field and using the three semantic status colors
 * (danger/warning/success) instead of the accent color UsageMeter uses.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, message } = getPasswordStrength(password);
  const percent = (score / 3) * 100;

  return (
    <div className="mt-2">
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={3}
        aria-label="Password strength"
      >
        <div
          className={cn("h-full rounded-full transition-all duration-300 ease-out", score > 0 ? FILL_COLOR[score] : "bg-transparent")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className={cn("mt-1.5 text-[12px]", MESSAGE_COLOR[score])}>{message}</p>
    </div>
  );
}
