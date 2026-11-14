import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '../shell/ScreenHeader';
import { AiBadge, Highlight, SectionLabel, SourceTag, SOURCES, type Source } from '../ui/atoms';
import { buttonClass } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/States';
import { EMPTY } from './copy';
import { DIGESTS, ITEMS } from './fixtures';
import { laterRows, sourceCount, useReader, watchRows } from './store';

const SOURCE_ORDER: Source[] = ['RD', 'X', 'IG', 'HN', 'YT', 'RSS'];

// Mock: in the handoff these are fixed. `item` is the thread each reply belongs to.
const TODAY = 'Saturday 14 November';
const REPLIES = [
  {
    who: 'tin_orchard',
    where: 'r/selfhosted · 1h',
    text: 'Same, but replies still fail for me about one time in ten.',
    item: 0,
  },
  {
    who: '@ops_notes',
    where: 'X · 3h',
    text: 'Did you consider CRDTs or was that too heavy?',
    item: 1,
  },
];

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
  const { state, update } = useReader();
  const watches = watchRows(state)
    .filter((w) => w.on && w.count > 0)
    .slice(0, 4);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ScreenHeader title="Today">
        <span className="font-mono text-meta text-mute">{TODAY}</span>
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
            {SOURCE_ORDER.map((s) => (
              <Link
                key={s}
                to={`/stream/${s.toLowerCase()}`}
                className="grid grid-cols-[30px_96px_24px_minmax(0,1fr)] items-baseline gap-x-10 rounded-5 px-6 py-dn-3 text-ink hover:bg-card"
              >
                <SourceTag src={s} />
                <span className="font-medium">{SOURCES[s].name}</span>
                <span className="text-right font-mono text-meta text-mute">{sourceCount(s)}</span>
                <span className="truncate text-mute">{ITEMS.find((i) => i.src === s)?.title}</span>
              </Link>
            ))}
          </Section>

          <Section label="Replies to you">
            {REPLIES.map((r) => (
              <Link
                key={r.who}
                to="/stream"
                onClick={() => {
                  update({ selected: r.item });
                }}
                className="rounded-5 px-6 py-dn-3 text-ink hover:bg-card"
              >
                <span className="font-semibold">{r.who}</span>{' '}
                <span className="font-mono text-code text-mute">{r.where}</span>
                <br />
                {r.text}
              </Link>
            ))}
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
            {laterRows(state)
              .slice(0, 3)
              .map((l) => (
                <div
                  key={l.key}
                  className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-baseline gap-x-10 px-6 py-dn-3"
                >
                  <SourceTag src={l.src} />
                  <span className="truncate">{l.title}</span>
                  <span className="font-mono text-meta text-mute">
                    {l.mins ? `${String(l.mins)} min` : ''}
                  </span>
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
