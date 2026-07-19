/**
 * Lightweight keyword matcher used only to make the demo analysis pipeline's
 * "Live extraction" panel feel responsive to the pasted brief. This is a UI
 * demo aid, not analysis — the real extraction happens server-side once the
 * Phase 7 model provider adapter exists.
 */
const CONCEPT_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bsaas\b/i, label: "SaaS application" },
  { pattern: /\bauth(entication)?\b|\blogin\b|\bsign[- ]?up\b/i, label: "Authentication" },
  { pattern: /\bstripe\b|\bbilling\b|\bpayment/i, label: "Stripe billing" },
  { pattern: /\banalytics\b|\bdashboard\b|\breporting\b/i, label: "Analytics" },
  { pattern: /\bteam\b|\bpermission|\brole/i, label: "Team access" },
  { pattern: /\bresponsive\b|\bmobile\b/i, label: "Responsive UI" },
  { pattern: /\bapi\b|\bintegration/i, label: "API integration" },
  { pattern: /\bnotification/i, label: "Notifications" },
  { pattern: /\bemail\b/i, label: "Email" },
  { pattern: /\bsearch\b/i, label: "Search" },
  { pattern: /\bchat\b|\bmessag/i, label: "Messaging" },
  { pattern: /\bupload\b|\bfile\b|\bimage\b/i, label: "File handling" },
  { pattern: /\be-?commerce\b|\bshop\b|\bcart\b/i, label: "E-commerce" },
  { pattern: /\bdeploy|\bhosting\b/i, label: "Deployment" }
];

export function extractConceptChips(brief: string, max = 6): string[] {
  const matches = CONCEPT_KEYWORDS.filter(({ pattern }) => pattern.test(brief)).map((entry) => entry.label);
  if (matches.length === 0) {
    return ["Custom application", "Core functionality"];
  }
  return matches.slice(0, max);
}

export function generateAnalysisId(): string {
  return `analysis_${Math.random().toString(36).slice(2, 7)}`;
}
