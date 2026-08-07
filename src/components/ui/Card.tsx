import type { ElementType, ReactNode } from "react";
import { cx } from "./cx";

export function Card({
  as: Component = "section",
  id,
  className,
  children,
}: {
  as?: ElementType;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Component
      id={id}
      className={cx(
        "bg-canvas rounded-xl border border-border p-6 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function CardLabel({
  as: Component = "h2",
  className,
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Component className={cx("text-xs font-medium uppercase tracking-wide text-ink-tertiary", className)}>
      {children}
    </Component>
  );
}
