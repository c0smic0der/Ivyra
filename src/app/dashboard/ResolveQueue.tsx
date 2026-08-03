import Link from "next/link";
import { formatResolveDate } from "@/lib/journal/journalView";
import { cx } from "@/components/ui/cx";

// The old /dashboard/queue content, now a sidebar alongside the timeline — and
// styled to match it: small uppercase section headers, hairline-separated rows,
// the same quiet claim + meta line, each row a tap straight to its resolve
// screen. The only distinction from a timeline entry is a subtle warning-tinted
// "due" cue, in place of the old heavy warning box + button. Read-only; the
// dashboard server component fetches and scopes the rows.
export interface QueueItem {
  id: string;
  text: string;
  confidencePercent: number;
  resolutionDate: string;
}

function QueueSection({
  label,
  items,
  due,
  empty,
}: {
  label: string;
  items: QueueItem[];
  due: boolean;
  empty: string;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="px-2 text-[13px] font-semibold uppercase tracking-wider text-ink">{label}</h2>
      {items.length > 0 ? (
        <div className="mt-2 divide-y divide-border">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/predictions/${item.id}/resolve`}
              className="group interactive-surface flex gap-3 rounded-lg py-3 pl-1 pr-2 hover:bg-surface"
            >
              {/* Same colour language as the timeline nodes: due = warning, open = accent. */}
              <span className="flex w-3 shrink-0 justify-center pt-[7px]" aria-hidden>
                <span
                  className={cx(
                    "h-2.5 w-2.5 rounded-full transition-transform duration-200 group-hover:scale-125",
                    due ? "bg-warning" : "bg-accent",
                  )}
                />
              </span>
              <span className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 text-[13px] tabular-nums text-ink-tertiary">
                  <span>{item.confidencePercent}%</span>
                  <span className={due ? "font-medium text-warning" : undefined}>
                    {due ? "due" : "resolves"} {formatResolveDate(item.resolutionDate)}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-snug text-ink">{item.text}</p>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-2 px-2 text-sm leading-snug text-ink-tertiary">{empty}</p>
      )}
    </section>
  );
}

export function ResolveQueue({ due, upcoming }: { due: QueueItem[]; upcoming: QueueItem[] }) {
  return (
    <div>
      <QueueSection
        label="Ready to resolve"
        items={due}
        due
        empty={
          upcoming.length > 0
            ? `Nothing due yet — next is ${formatResolveDate(upcoming[0]!.resolutionDate)}.`
            : "Nothing due right now."
        }
      />
      <QueueSection
        label="Open entries"
        items={upcoming}
        due={false}
        empty={due.length > 0 ? "Nothing else open — resolve the ones above." : "Nothing open right now."}
      />
    </div>
  );
}
