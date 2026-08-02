import Link from "next/link";

const LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/how-it-works", label: "How it works" },
];

// Global footer — rendered once in the root layout, so every page carries the
// legal + about links. Deliberately quiet and low-contrast so it sits at the
// bottom without competing with page content.
export function Footer() {
  const year = new Date().getUTCFullYear();

  return (
    <footer className="mt-auto border-t border-border-subtle">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-6 py-8 text-xs text-ink-tertiary sm:flex-row sm:justify-between lg:px-8">
        <p>
          <span className="text-ink-secondary">Ivyra</span> — a free decision journal. © {year}.
        </p>
        <nav className="flex items-center gap-5">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
