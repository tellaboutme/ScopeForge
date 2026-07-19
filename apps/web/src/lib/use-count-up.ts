"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Animates an integer from 0 up to `target` on mount (ease-out cubic).
 * Jumps straight to `target` when the user prefers reduced motion.
 */
export function useCountUp(target: number, duration = 900): number {
  const reducedMotion = useReducedMotion();
  const [value, setValue] = useState(reducedMotion ? target : 0);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reducedMotion) {
      setValue(target);
      return;
    }

    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, reducedMotion]);

  return value;
}
