"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/insights", label: "Insights" },
  { href: "/how-it-works", label: "How it works" },
];

// "Account" sits alongside the primary tabs but only for a signed-in user — a
// signed-out visitor has no account to manage.
const ACCOUNT_ITEM = { href: "/account", label: "Account" };

export function HeaderNav({ authed = false }: { authed?: boolean }) {
  const pathname = usePathname();
  const items = authed ? [...NAV_ITEMS, ACCOUNT_ITEM] : NAV_ITEMS;

  return (
    <nav className="flex min-w-0 items-center gap-6 overflow-x-auto text-[15px]">
      {items.map((item) => {
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
