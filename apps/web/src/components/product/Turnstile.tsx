"use client";

import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

export interface TurnstileWidgetProps {
  onVerify: (token: string | null) => void;
  /** Bump this to force a fresh challenge (e.g. after a failed submit —
   * Turnstile tokens are single-use, so a retry needs a new one). */
  resetKey?: number;
}

/**
 * Renders a Cloudflare Turnstile CAPTCHA widget (D042). Deliberately
 * vanilla-JS (Cloudflare's official script + explicit render API) rather
 * than an npm wrapper package — avoids a new dependency for something this
 * small, per the contributing guide's "don't add dependencies for trivial utilities".
 *
 * Renders nothing at all when NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't set
 * (the default, until the user adds their own Cloudflare site key) — the
 * backend's TURNSTILE_ENABLED defaults to false in lockstep (see
 * apps/api/app/captcha.py), so login/signup work identically with or
 * without this configured, no broken half-state either way.
 */
export function TurnstileWidget({ onVerify, resetKey }: TurnstileWidgetProps) {
  const containerId = useId().replace(/:/g, "-");
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(`#${containerId}`, {
          sitekey: SITE_KEY,
          callback: (token: string) => onVerify(token),
          "expired-callback": () => onVerify(null),
          "error-callback": () => onVerify(null),
          theme: "dark"
        });
      })
      .catch(() => onVerify(null));

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      cancelled = true;
    };
    // resetKey intentionally triggers a full remount (new widget id) rather
    // than calling .reset() — simpler than threading a reset method back
    // out to the parent for what's normally a once-per-failed-submit event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, containerId]);

  if (!SITE_KEY) return null;

  return <div id={containerId} className="mt-1" />;
}
