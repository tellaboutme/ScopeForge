"use client";

import { LazyMotion, domAnimation, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

// Central motion runtime for the whole app — the only place `domAnimation`
// and `MotionConfig` are configured. `LazyMotion` in `strict` mode keeps the
// animation engine out of the initial bundle until something on the page
// actually animates, but strict mode also throws if any component imports
// the full `motion.*` API instead of the lightweight `m` components from
// "motion/react-m" — that's intentional: it's the guardrail that stops this
// codebase from quietly growing two different ways to animate the same
// thing. `reducedMotion="user"` makes every `m`-driven animation respect
// prefers-reduced-motion automatically, on top of (not instead of) the
// existing useReducedMotion hook and the global CSS reduced-motion rule in
// globals.css, which still governs the CSS-keyframe-based Radix overlays.
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
