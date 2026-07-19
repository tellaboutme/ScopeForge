const INSTALLATION_ID_KEY = "scopeforge.installation-id";

/**
 * Anonymous per-browser identity (D004 — no real auth in the MVP). Generated
 * once, persisted in localStorage, and sent as the `X-Installation-Id`
 * header on every API request so the backend can scope list/get/delete to
 * "this browser" without any account system. Never sent anywhere except our
 * own API.
 */
export function getInstallationId(): string {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;

  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `inst_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

  try {
    window.localStorage.setItem(INSTALLATION_ID_KEY, generated);
  } catch {
    // Storage unavailable (private mode, quota) — the id just won't persist across reloads.
  }
  return generated;
}
