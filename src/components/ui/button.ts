import { cx } from "./cx";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "inline-flex items-center justify-center rounded-xl font-medium transition-colors bg-accent text-white hover:bg-accent-hover",
  secondary:
    "inline-flex items-center justify-center rounded-xl font-medium transition-colors border border-border text-ink hover:bg-surface",
  ghost: "text-ink-secondary hover:underline",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
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
