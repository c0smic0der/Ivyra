"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  type Annotation,
  entryHref,
  groupByMonth,
  type JournalEntry,
  type JournalPage,
} from "@/lib/journal/journalView";
import { loadMoreJournal, restoreJournal } from "./journalActions";
import { buttonVariants } from "@/components/ui/button";

// sessionStorage keys — how many pages were loaded and where the user was
// scrolled. They let the timeline survive the resolve round-trip: navigate out to
// resolve an entry, come back, and land on the same pages at the same offset with
// the resolved entry's annotation refreshed. Only counts and an offset are stored
// — never entry content — and the data itself is always refetched fresh.
const PAGES_KEY = "journal:pageCount";
const SCROLL_KEY = "journal:scrollY";

const emptySubscribe = () => () => {};

/**
 * The viewer's IANA timezone. `useSyncExternalStore` returns the server snapshot
 * ("UTC") during SSR and the first hydration render — so the markup matches — then
 * re-renders with the real browser zone. Month grouping and day labels are done in
 * this zone, keeping section boundaries and dates mutually consistent (Session 17).
 */
function useTimeZone(): string {
  return useSyncExternalStore(
    emptySubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC",
  );
}

function AnnotationView({ annotation }: { annotation: Annotation }) {
  if (annotation.kind === "open") {
    return (
      <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-ink-tertiary">
        {annotation.confidencePct}% · resolves {annotation.resolvesLabel}
      </span>
    );
  }
  if (annotation.kind === "void") {
    return (
      <span className="shrink-0 text-xs uppercase tracking-wide text-ink-tertiary">Void</span>
    );
  }
  const hit = annotation.outcome;
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-ink-tertiary"
      title={`${hit ? "Resolved yes" : "Resolved no"} · Brier ${annotation.brier.toFixed(2)}`}
    >
      {hit ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-danger" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )}
      {annotation.brier.toFixed(2)}
    </span>
  );
}

function EntryRow({ entry, dayLabel }: { entry: JournalEntry; dayLabel: string }) {
  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xs tabular-nums text-ink-tertiary">{dayLabel}</span>
        <AnnotationView annotation={entry.annotation} />
      </div>
      <p className="mt-1 text-[13px] leading-snug text-ink">{entry.text}</p>
      {entry.preview && (
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-tertiary">{entry.preview}</p>
      )}
    </>
  );

  // Every entry is one tap deep: open → its resolve screen; resolved/void → the
  // read-only record view (the /insights history card, focused by id).
  return (
    <Link
      href={entryHref(entry)}
      className="interactive-surface block rounded-lg px-2 py-3 hover:bg-surface"
    >
      {inner}
    </Link>
  );
}

export function JournalTimeline({ initial }: { initial: JournalPage }) {
  const tz = useTimeZone();
  const [entries, setEntries] = useState<JournalEntry[]>(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [pageCount, setPageCount] = useState(1);
  const [isPending, startTransition] = useTransition();
  const restoreScrollTo = useRef<number | null>(null);

  // On return from a resolve round-trip, restore the pages the user had loaded.
  // Runs once on mount: page 1 is already fresh from the (revalidated) server
  // render, so we only refetch when more than one page was open.
  useEffect(() => {
    const savedPages = Number(sessionStorage.getItem(PAGES_KEY) ?? "1");
    const savedScroll = Number(sessionStorage.getItem(SCROLL_KEY) ?? "0");
    if (savedPages > 1) {
      restoreScrollTo.current = savedScroll;
      startTransition(async () => {
        const res = await restoreJournal(savedPages);
        setEntries(res.items);
        setHasMore(res.hasMore);
        setPageCount(savedPages);
      });
    } else if (savedScroll > 0) {
      requestAnimationFrame(() => window.scrollTo(0, savedScroll));
    }
    // Mount-only: all setters and refs used here are stable.
  }, []);

  // After the restored pages have painted, jump to the saved offset exactly once.
  useEffect(() => {
    if (restoreScrollTo.current !== null && !isPending) {
      const y = restoreScrollTo.current;
      restoreScrollTo.current = null;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [isPending]);

  // Continuously remember the scroll offset (rAF-throttled) so any navigation away
  // — including tapping an entry to resolve it — can be restored on return.
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const loadMore = useCallback(() => {
    const next = pageCount + 1;
    startTransition(async () => {
      const res = await loadMoreJournal(next);
      setEntries((prev) => [...prev, ...res.items]);
      setHasMore(res.hasMore);
      setPageCount(next);
      sessionStorage.setItem(PAGES_KEY, String(next));
    });
  }, [pageCount]);

  const sections = groupByMonth(entries, tz);

  return (
    <div>
      {sections.map((section) => (
        <section key={section.key} className="mt-8 first:mt-0">
          <h2 className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-tertiary">
            {section.label}
          </h2>
          <div className="mt-2 divide-y divide-border-subtle">
            {section.entries.map(({ entry, dayLabel }) => (
              <EntryRow key={entry.id} entry={entry} dayLabel={dayLabel} />
            ))}
          </div>
        </section>
      ))}

      {hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isPending}
            className={buttonVariants("secondary", { size: "md" })}
          >
            {isPending ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
