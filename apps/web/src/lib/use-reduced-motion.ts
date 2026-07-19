"use client";

import { useEffect, useState } from "react";

/**
 * CSS transitions/animations already respect prefers-reduced-motion globally
 * (see the media query in globals.css). This hook exists for the JS-driven
 * animations (count-up numbers, requestAnimationFrame bar fills) that need
 * to make the same decision explicitly.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  return reduced;
}
