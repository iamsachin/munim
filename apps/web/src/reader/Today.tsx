import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '../shell/ScreenHeader';
import { AiBadge, Highlight, SectionLabel, SourceTag, SOURCES, type Source } from '../ui/atoms';
import { buttonClass } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState, ErrorState, LoadingRows } from '../ui/States';
import { EMPTY } from './copy';
import { DIGESTS } from './fixtures';
import { useItems } from './queries';
import { useReader, watchRows } from './store';

const SOURCE_ORDER: Source[] = ['RD', 'X', 'IG', 'HN', 'YT', 'RSS'];
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
  const { state } = useReader();
  const items = useItems();
  const later = useItems({ show: 'later' });
  const [now] = useState(() => Date.now());

  // "New since yesterday": what was published in the last day, grouped by where it came from.
  const fresh = (items.data ?? []).filter((item) => now - Date.parse(item.published_at) < DAY_MS);
  const bySource = SOURCE_ORDER.map((source) => ({
    source,
    rows: fresh.filter((item) => item.source === source),
  })).filter((group) => group.rows.length > 0);
  const watches = watchRows(state)
    .filter((w) => w.on && w.count > 0)
    .slice(0, 4);

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
              <h2 className="font-semibold">This morning&apos;s digest</h2>
              <Link to="/digest" className={`${buttonClass()} ml-auto`}>
                Open digest
              </Link>
            </div>
            <div className="text-prose leading-prose text-pretty">{DIGESTS.Daily.lead}</div>
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
                <SourceTag src={source} />
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
            {watches.map((w) => (
              <div key={w.name} className="flex items-baseline gap-10 px-6 py-dn-3">
                <span className="font-medium">{w.name}</span>
                <span className="font-mono text-meta text-accent">{w.count} new</span>
                <span className="ml-auto font-mono text-meta text-mute">{w.last}</span>
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
                <SourceTag src={item.source} />
                <span className="truncate">{item.title}</span>
                <span className="font-mono text-meta text-mute">{item.minutes} min</span>
              </div>
            ))}
          </Section>

          <Section label="Recent highlights" to="/highlights" action="All highlights">
            {state.highlights.length === 0 && <EmptyState compact>{EMPTY.highlights}</EmptyState>}
            {state.highlights.slice(0, 2).map((h) => (
              <div key={h.quote} className="p-6">
                <Highlight>{h.quote}</Highlight>
                <div className="pt-3 font-mono text-code text-mute">
                  {h.title} · {h.from}
                </div>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </main>
  );
}
