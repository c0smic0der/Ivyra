"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/insights", label: "Insights" },
  { href: "/how-it-works", label: "How it works" },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="flex min-w-0 items-center gap-6 overflow-x-auto text-[15px]">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "shrink-0 whitespace-nowrap transition-colors",
              active ? "font-medium text-accent" : "text-ink-secondary hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
