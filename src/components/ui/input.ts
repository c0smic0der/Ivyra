import { cx } from "./cx";

export function inputClasses(className?: string): string {
  return cx(
    "w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-accent",
    className,
  );
}
