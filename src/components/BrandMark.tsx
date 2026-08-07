import { cx } from "@/components/ui/cx";

/**
 * The Ivyra brand mark — icon.svg's shapes inlined (rounded square + calibration
 * diagonal + dot). Inline SVG, not an <img>, so it inherits sizing from
 * `className` (e.g. `h-6 w-6`); the square uses the accent token via
 * `currentColor` so it matches the app, favicons, and PWA icons exactly. The
 * diagonal and dot stay white. wordmark.svg is for README/OG only, not the app.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cx("text-accent", className)} aria-hidden>
      <rect x="0" y="0" width="64" height="64" rx="14" fill="currentColor" />
      <line
        x1="17"
        y1="47"
        x2="47"
        y2="17"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="26" cy="21.5" r="6" fill="#FFFFFF" />
    </svg>
  );
}
