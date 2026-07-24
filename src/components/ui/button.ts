import { cx } from "./cx";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: `inline-flex items-center justify-center rounded-xl font-medium transition-colors bg-accent text-white shadow-[var(--shadow-accent)] hover:bg-accent-hover ${FOCUS}`,
  secondary: `inline-flex items-center justify-center rounded-xl font-medium transition-colors border border-border text-ink hover:bg-surface ${FOCUS}`,
  ghost: `text-ink-secondary hover:underline ${FOCUS}`,
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-1.5 text-sm",
};

export function buttonVariants(
  variant: ButtonVariant,
  options?: { size?: ButtonSize; className?: string },
): string {
  const size = options?.size ?? "md";
  if (variant === "ghost") {
    return cx(VARIANTS.ghost, size === "sm" ? "text-xs" : "text-sm", options?.className);
  }
  return cx(VARIANTS[variant], SIZES[size], options?.className);
}
