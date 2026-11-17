import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '../shell/ScreenHeader';
import { AiBadge, Highlight, SectionLabel, SourceTag, SOURCES, type Source } from '../ui/atoms';
import { buttonClass } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState, ErrorState, LoadingRows } from '../ui/States';
import { EMPTY } from './copy';
import { age, useDigests, useHighlights, useItems, useWatches } from './queries';

const SOURCE_ORDER: Source[] = ['RD', 'X', 'HN', 'YT', 'RSS'];
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function Section({
  label,
  to,
  action,
  children,
}: {
  label: string;
  to?: string;
  action?: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-4">
      <div className="flex items-center justify-between pb-4">
        <SectionLabel as="h2">{label}</SectionLabel>
        {to && (
          <Link to={to} className={buttonClass()}>
            {action}
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

export function Today() {
  const highlights = useHighlights();
  const digests = useDigests();
  const daily = digests.data?.daily;
  const items = useItems();
  const later = useItems({ show: 'later' });
  const [now] = useState(() => Date.now());
  // The owner's own date, as a digest's day is written: 2026-11-15.
  const today = new Date(now).toLocaleDateString('en-CA');

  // "New since yesterday": what was published in the last day, grouped by where it came from.
  const fresh = (items.data ?? []).filter((item) => now - Date.parse(item.published_at) < DAY_MS);
  const bySource = SOURCE_ORDER.map((source) => ({
    source,
    rows: fresh.filter((item) => item.source === source),
  })).filter((group) => group.rows.length > 0);
  const watching = useWatches();
  const watches = (watching.data?.watches ?? []).filter((w) => w.on && w.week > 0).slice(0, 4);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ScreenHeader title="Today">
        <span className="font-mono text-meta text-mute">{DATE.format(now)}</span>
      </ScreenHeader>
      <div className="grid max-w-1120 grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-12 p-16">
        <div className="flex min-w-0 flex-col gap-12">
          <Card tone="ai" className="gap-8">
            <div className="flex items-center gap-8">
              <AiBadge />
              <h2 className="font-semibold">
                {/* Said as this morning's only if it is today's. */}
                {daily && daily.day !== today ? 'The last digest' : "This morning's digest"}
              </h2>
              <Link to="/digest" className={`${buttonClass()} ml-auto`}>
                Open digest
              </Link>
            </div>
            {digests.isPending && <LoadingRows what="the digest" rows={2} />}
            {digests.isError && (
              <ErrorState what="the digest" onRetry={() => void digests.refetch()} />
            )}
            {digests.data && (
              <div className="text-prose leading-prose text-pretty">
                {daily
                  ? daily.lead || daily.problem
                  : digests.data.on
                    ? EMPTY.digest
                    : 'Digest is off. Switch it on under Digest.'}
              </div>
            )}
          </Card>

          <Section label="New since yesterday" to="/stream" action="Open stream">
            {items.isPending && <LoadingRows what="new items" rows={3} />}
            {items.isError && <ErrorState what="new items" onRetry={() => void items.refetch()} />}
            {items.isSuccess && bySource.length === 0 && (
              <EmptyState compact>{EMPTY.newItems}</EmptyState>
            )}
            {bySource.map(({ source, rows }) => (
              <Link
                key={source}
                to={`/stream/${source.toLowerCase()}`}
                className="grid grid-cols-[30px_96px_24px_minmax(0,1fr)] items-baseline gap-x-10 rounded-5 px-6 py-dn-3 text-ink hover:bg-card"
              >
                {/* Feeds each have their own icon; the rest have one for the whole source. */}
                <SourceTag src={source} icon={source === 'RSS' ? null : rows[0]?.icon} />
                <span className="font-medium">{SOURCES[source].name}</span>
                <span className="text-right font-mono text-meta text-mute">{rows.length}</span>
                <span className="truncate text-mute">{rows[0]?.title}</span>
              </Link>
            ))}
          </Section>

          <Section label="Replies to you">
            {/* No source that carries replies is connected yet. */}
            <EmptyState compact>{EMPTY.repliesToYou}</EmptyState>
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-12">
          <Section label="Watches" to="/watches" action="All watches">
            {watching.isPending && <LoadingRows what="watches" rows={2} />}
            {watching.isError && (
              <ErrorState what="the watches" onRetry={() => void watching.refetch()} />
            )}
            {watching.isSuccess && watches.length === 0 && (
              <EmptyState compact>{EMPTY.matches}</EmptyState>
            )}
            {watches.map((w) => (
              <div key={w.name} className="flex items-baseline gap-10 px-6 py-dn-3">
                <span className="font-medium">{w.name}</span>
                <span className="font-mono text-meta text-accent">{w.week} new</span>
                <span className="ml-auto font-mono text-meta text-mute">
                  {w.last && `${age(w.last, now)} ago`}
                </span>
              </div>
            ))}
          </Section>

          <Section label="Read later" to="/later" action="Open queue">
            {later.isPending && <LoadingRows what="the queue" rows={3} />}
            {later.isError && <ErrorState what="the queue" onRetry={() => void later.refetch()} />}
            {later.data?.length === 0 && <EmptyState compact>{EMPTY.later}</EmptyState>}
            {later.data?.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-baseline gap-x-10 px-6 py-dn-3"
              >
                <SourceTag src={item.source} icon={item.icon} />
                <span className="truncate">{item.title}</span>
                <span className="font-mono text-meta text-mute">{item.minutes} min</span>
              </div>
            ))}
          </Section>

          <Section label="Recent highlights" to="/highlights" action="All highlights">
            {highlights.isPending && <LoadingRows what="highlights" rows={2} />}
            {highlights.isError && (
              <ErrorState what="the highlights" onRetry={() => void highlights.refetch()} />
            )}
            {highlights.data?.length === 0 && <EmptyState compact>{EMPTY.highlights}</EmptyState>}
            {highlights.data?.slice(0, 2).map((h) => (
              <div key={h.id} className="p-6">
                <Highlight>{h.quote}</Highlight>
                <div className="flex items-center gap-6 pt-3 font-mono text-code text-mute">
                  {!h.source && <AiBadge />}
                  {h.title} · {h.origin}
                </div>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </main>
  );
}
