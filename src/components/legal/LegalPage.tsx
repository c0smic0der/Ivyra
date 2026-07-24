import type { ReactNode } from "react";
import { Header } from "@/components/Header";

// Shared shell for /privacy and /terms — one consistent measure, rhythm, and
// heading scale for both documents.
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 lg:px-8">
        <h1 className="font-wordmark text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-xs text-ink-tertiary">Last updated {updated}</p>
        <div className="mt-8 space-y-8 text-sm leading-relaxed text-ink-secondary">{children}</div>
      </main>
    </>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-medium text-ink">{heading}</h2>
      {children}
    </section>
  );
}
