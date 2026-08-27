"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  type Annotation,
  entryHref,
  groupByMonth,
  isDue,
  type JournalEntry,
  type JournalPage,
  monthNavFromTimestamps,
  type NavMonth,
} from "@/lib/journal/journalView";
import { loadMoreJournal, restoreJournal } from "./journalActions";
import { buttonVariants } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";

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
      <span className="shrink-0 whitespace-nowrap text-[13px] tabular-nums text-ink-tertiary">
        {annotation.confidencePct}% · resolves {annotation.resolvesLabel}
      </span>
    );
  }
  if (annotation.kind === "void") {
    return <span className="shrink-0 text-[13px] uppercase tracking-wide text-ink-tertiary">Void</span>;
  }
  const hit = annotation.outcome;
  return (
    <span
      className={cx(
        "flex shrink-0 items-center gap-1.5 text-[13px] font-medium tabular-nums",
        hit ? "text-success" : "text-danger",
      )}
      title={`${hit ? "Resolved yes" : "Resolved no"} · Brier ${annotation.brier.toFixed(2)}`}
    >
      {hit ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )}
      <span className="text-ink-tertiary">{annotation.brier.toFixed(2)}</span>
    </span>
  );
}

function EntryRow({ entry, dayLabel, todayIso }: { entry: JournalEntry; dayLabel: string; todayIso: string }) {
  // Every entry is a uniform row: same padding, same width, same text size. The
  // only per-state difference is the left marker — an accent dot (warning once
  // due) for open entries, nothing for completed ones — and its gutter is always
  // reserved so dates, claims, and the top-right info line up across all rows.
  const { annotation } = entry;
  const open = annotation.kind === "open";
  const due = annotation.kind === "open" && isDue(annotation.resolutionDate, todayIso);
  return (
    <Link
      href={entryHref(entry)}
      className="group interactive-surface flex gap-3 rounded-lg px-2 py-5 hover:bg-surface"
    >
      <span className="flex w-3 shrink-0 justify-center pt-[7px]" aria-hidden>
        {open && (
          <span
            className={cx(
              "h-2.5 w-2.5 rounded-full transition-transform duration-200 group-hover:scale-125",
              due ? "bg-warning" : "bg-accent",
            )}
          />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[13px] tabular-nums text-ink-tertiary">{dayLabel}</span>
          <AnnotationView annotation={annotation} />
        </div>
        <p className="mt-1 text-sm leading-snug text-ink">{entry.headline}</p>
        {entry.preview && (
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-ink-tertiary">{entry.preview}</p>
        )}
      </span>
    </Link>
  );
}

/** The sticky month/year rail — lists EVERY month in the timeline (not only the
 *  loaded pages); click one to scroll to it (loading older pages first if needed),
 *  and the active month (scroll-spy) lights up in accent. */
function MonthNav({
  months,
  activeKey,
  onJump,
}: {
  months: NavMonth[];
  activeKey: string;
  onJump: (key: string) => void;
}) {
  return (
    <nav aria-label="Jump to month" className="flex flex-col gap-1.5">
      {months.map((month, i) => {
        const year = month.key.slice(0, 4);
        const showYear = i === 0 || months[i - 1]!.key.slice(0, 4) !== year;
        const active = month.key === activeKey;
        return (
          <Fragment key={month.key}>
            {showYear && (
              <span className="mt-2 text-[10px] font-semibold tabular-nums tracking-wider text-ink-tertiary/60 first:mt-0">
                {year}
              </span>
            )}
            <button
              type="button"
              onClick={() => onJump(month.key)}
              className={cx(
                "group flex items-center gap-2 text-left text-[10px] font-semibold uppercase tracking-wider transition-colors",
                active ? "text-accent" : "text-ink-tertiary hover:text-ink",
              )}
            >
              <span
                className={cx(
                  "h-1 rounded-full transition-all duration-200",
                  active ? "w-3 bg-accent" : "w-1 bg-ink-tertiary/40 group-hover:bg-ink-tertiary",
                )}
              />
              {month.label.slice(0, 3)}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}

/** Smooth-scroll a rendered month section into view. Returns false when that
 *  month hasn't been paged in yet (so the caller can load more first). */
function scrollToMonth(key: string): boolean {
  const el = document.getElementById(`m-${key}`);
  if (!el) return false;
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  return true;
}

export function JournalTimeline({
  initial,
  todayIso,
  allTimestamps,
}: {
  initial: JournalPage;
  todayIso: string;
  /** Every entry timestamp (newest first) — drives the full month nav. */
  allTimestamps: string[];
}) {
  const tz = useTimeZone();
  const [entries, setEntries] = useState<JournalEntry[]>(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [pageCount, setPageCount] = useState(1);
  const [activeKey, setActiveKey] = useState("");
  const [isPending, startTransition] = useTransition();
  const restoreScrollTo = useRef<number | null>(null);
  // A month the user clicked in the rail that isn't paged in yet — resolved by
  // loading more pages until its section renders (see the effect below).
  const pendingJump = useRef<string | null>(null);

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
  const sectionKeys = sections.map((s) => s.key).join("|");
  // The FULL month list for the rail — every month in the timeline, even those
  // whose entries haven't been paged in yet. Falls back to the loaded sections'
  // months if the timestamps somehow lag behind.
  const navMonths = monthNavFromTimestamps(allTimestamps, tz);
  // Always highlight something so the rail never reads as "nothing selected".
  const activeOrFirst = activeKey || navMonths[0]?.key || sections[0]?.key || "";

  // Scroll-spy: the month whose header sits in the band just below the sticky
  // app header becomes active. Re-armed whenever the set of months changes.
  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(`m-${s.key}`))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (obsEntries) => {
        const visible = obsEntries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveKey(visible[0].target.id.slice(2));
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the month set
  }, [sectionKeys]);

  const onJump = useCallback(
    (key: string) => {
      if (scrollToMonth(key)) {
        setActiveKey(key);
        return;
      }
      // That month isn't loaded yet — remember it and start paging in older
      // entries; the effect below scrolls to it once its section renders.
      pendingJump.current = key;
      if (hasMore) loadMore();
    },
    [hasMore, loadMore],
  );

  // Resolve a pending jump after each page loads: scroll if the month has now
  // rendered, keep loading while there's more, else give up.
  useEffect(() => {
    if (!pendingJump.current) return;
    if (scrollToMonth(pendingJump.current)) {
      pendingJump.current = null;
    } else if (hasMore) {
      loadMore();
    } else {
      pendingJump.current = null;
    }
  }, [entries, hasMore, loadMore]);

  return (
    <div className="flex gap-5">
      {navMonths.length > 0 && (
        <div className="hidden shrink-0 md:block">
          <div className="sticky top-24">
            <MonthNav months={navMonths} activeKey={activeOrFirst} onJump={onJump} />
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        {sections.map((section) => (
          <section key={section.key} id={`m-${section.key}`} className="mt-8 scroll-mt-24 first:mt-0">
            <h2
              className={cx(
                "px-1 text-xs font-semibold uppercase tracking-[0.14em] transition-colors",
                section.key === activeOrFirst ? "text-accent" : "text-ink-tertiary",
              )}
            >
              {section.label} <span className="text-ink-tertiary/50">{section.key.slice(0, 4)}</span>
            </h2>
            <div className="mt-2 divide-y divide-border">
              {section.entries.map(({ entry, dayLabel }) => (
                <EntryRow key={entry.id} entry={entry} dayLabel={dayLabel} todayIso={todayIso} />
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
    </div>
  );
}
