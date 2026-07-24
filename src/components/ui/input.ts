import { cx } from "./cx";

export function inputClasses(className?: string): string {
  return cx(
    "w-full rounded-xl border border-border bg-canvas px-3 py-1.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-tertiary focus:border-accent focus:ring-2 focus:ring-accent/20",
    className,
  );
}
