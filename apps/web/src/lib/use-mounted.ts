"use client";

import { useEffect, useState } from "react";

/**
 * False on first render, true one frame after mount. Use to trigger a CSS
 * width/transform transition from an initial state (e.g. a progress bar
 * animating in from 0). Reduced motion is already handled globally — the
 * CSS transition duration collapses to ~0 there, so the end state is
 * reached instantly with no extra branching needed here.
 */
export function useMountedAfterPaint(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return mounted;
}
