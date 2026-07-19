import localFont from "next/font/local";

/**
 * User-supplied local fonts (self-hosted, zero network dependency — same
 * rationale as D012 for Geist). Roles:
 * - Cinzel: logo/wordmark only — a distinct brand mark, never used in UI copy.
 * - Bebas Neue: the verdict decision headline only — the one moment per
 *   the UI guidelines report hierarchy that should visually dominate.
 * - Roboto Mono: the numeric/technical family (scores, prices, durations),
 *   replacing Geist Mono in that role. See the design notes.
 *
 * Files are WOFF2 (D036, Phase 8 performance pass) — the source TTFs were
 * ~2.3x larger (488KB combined vs 210KB) with no visual difference; WOFF2
 * has full support in every browser this app targets, so no TTF fallback
 * is kept. The original .ttf files may still be present alongside these on
 * disk (removal blocked in this sandbox) but nothing references them.
 *
 * `adjustFontFallback: false` on every one of these (D053): next/font's
 * build-time fallback-metrics reader (fontkit, `getFallbackMetricsFromFontFile`)
 * throws `Cannot read properties of undefined (reading 'ascent')` on these
 * WOFF2 files — reproducibly, on clean CI (GitHub Ubuntu runners) and on
 * Windows alike, not the "sandbox flake" earlier notes assumed. That metric
 * is only used to synthesize a size-adjusted system-font fallback to reduce
 * layout shift; turning it off skips the crashing path entirely. The fonts
 * still embed and render exactly the same, and each is used narrowly enough
 * (a logo, one headline, numeric text — all `display: "swap"`) that the lost
 * CLS micro-optimization is immaterial.
 */

export const cinzel = localFont({
  src: "./cinzel/Cinzel-SemiBold.woff2",
  weight: "600",
  style: "normal",
  variable: "--font-cinzel",
  display: "swap",
  adjustFontFallback: false
});

export const bebasNeue = localFont({
  src: "./bebas-neue/BebasNeue-Regular.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-bebas-neue",
  display: "swap",
  adjustFontFallback: false
});

export const robotoMono = localFont({
  variable: "--font-roboto-mono",
  display: "swap",
  adjustFontFallback: false,
  src: [
    { path: "./roboto-mono/RobotoMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./roboto-mono/RobotoMono-Medium.woff2", weight: "500", style: "normal" },
    { path: "./roboto-mono/RobotoMono-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./roboto-mono/RobotoMono-Bold.woff2", weight: "700", style: "normal" }
  ]
});
