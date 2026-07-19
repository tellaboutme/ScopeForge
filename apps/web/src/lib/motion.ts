// Centralized motion tokens — motion-polish milestone.
//
// Every `m`-driven animation in the app should read its duration/easing/
// distance from here rather than hardcoding a number, so the whole product
// stays inside the same restrained "calm, technical" motion budget. Radix
// overlays (Dialog/Dropdown/Popover/Select/mobile drawer) stay CSS-keyframe
// driven — see globals.css — but use the same underlying duration/easing
// values by convention, kept in sync by hand since CSS can't import this file.
//
// Values and rationale:
//   micro (140ms)   — icon/state swaps, tiny replacements (AnalysisPipeline stage icon).
//   normal (200ms)  — routine hover/press-adjacent transitions.
//   state (260ms)   — a full UI region swapping to a different state (Analyze flow).
//   reveal (340ms)  — content appearing for the first time (row reveals).
//   exitFast (140-180ms) — exits are always faster than entrances; content
//     leaving the screen doesn't need to be watched as closely as content
//     arriving does.
export const DURATION = {
  micro: 0.14,
  normal: 0.2,
  state: 0.26,
  reveal: 0.34,
  exitFast: 0.16
} as const;

// Standard entrance easing is a gentle deceleration (fast-out, settles
// softly) — never a bounce/elastic curve. Exit easing accelerates out
// (ease-in) so departing content gets out of the way quickly.
export const EASE = {
  standard: [0.22, 1, 0.36, 1] as [number, number, number, number],
  exit: [0.4, 0, 1, 1] as [number, number, number, number]
};

// Entrance/exit travel distance, in px. Never animate from further away
// than `max` — anything larger reads as a slide/reposition rather than a
// quiet settle.
export const DISTANCE = {
  normal: 6,
  small: 4,
  max: 8
} as const;

// Stagger step and hard cap on total accumulated stagger across a list —
// a 20-row list must never take longer to finish revealing than `maxTotal`.
export const STAGGER = {
  step: 0.035,
  maxTotal: 0.16
} as const;

export function staggerDelay(index: number, step: number = STAGGER.step, max: number = STAGGER.maxTotal): number {
  return Math.min(index * step, max);
}

// Shared variants for the Analyze page's top-level flow states (editing /
// pipeline / error / limit_reached). The whole state branch (header +
// content) animates together as one unit — see analyze/page.tsx.
export const flowVariants = {
  initial: { opacity: 0, y: DISTANCE.normal },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.state, ease: EASE.standard } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.exitFast, ease: EASE.exit } }
};

// Shared variants for a single list row entering/leaving (History table,
// Settings save-status). Rows never slide horizontally.
export const rowVariants = {
  initial: { opacity: 0, y: DISTANCE.small },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.normal, ease: EASE.standard } },
  exit: { opacity: 0, y: -3, transition: { duration: DURATION.exitFast, ease: EASE.exit } }
};

// Shared variants for a small inline icon/value swap (AnalysisPipeline
// current-stage icon, current_stage text crossfade). Scale never leaves the
// 0.94–1 band — this is a "settle," not a pop.
export const microSwapVariants = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 1, scale: 1, transition: { duration: DURATION.micro, ease: EASE.standard } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: EASE.exit } }
};
