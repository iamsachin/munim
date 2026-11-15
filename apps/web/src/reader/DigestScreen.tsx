import { useState } from 'react';
import type { Digests } from '../api/client';
import { ScreenHeader } from '../shell/ScreenHeader';
import { AiBadge, SectionLabel } from '../ui/atoms';
import { Chip } from '../ui/Chip';
import { CitationRow } from '../ui/CitationRow';
import { EmptyState, ErrorState, LoadingRows } from '../ui/States';
import { Toggle } from '../ui/Toggle';
import { DIGEST_OFF, EMPTY } from './copy';
import { useDigests, useSetDigests } from './queries';

const KINDS = ['Daily', 'Weekly'] as const;
const DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const WEEK = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

/**
 * What a digest is headed: its day, or for a weekly one the Monday its week began. The day is
 * the owner's own date, so it is read at noon: no time zone can move it to another day.
 */
export function digestTitle(digest: NonNullable<Digests['daily']>): string {
  const day = new Date(`${digest.day}T12:00:00`);
  if (digest.kind === 'daily') return DATE.format(day);
  day.setDate(day.getDate() - 6);
  return `Week of ${WEEK.format(day)}`;
}

/**
 * The latest daily or weekly digest: what came in, written up by the model chosen for Digest,
 * with the items it is about. The worker writes it; nothing is written until the owner
 * switches Digest on here.
 */
export function DigestScreen() {
  const [kind, setKind] = useState<(typeof KINDS)[number]>('Daily');
  const digests = useDigests();
  const set = useSetDigests();
  const digest = kind === 'Daily' ? digests.data?.daily : digests.data?.weekly;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Digest">
        {KINDS.map((k) => (
          <Chip
            key={k}
            on={kind === k}
            onClick={() => {
              setKind(k);
            }}
          >
            {k}
          </Chip>
        ))}
        <span className="ml-auto font-mono text-meta text-mute">
          Daily at 7:00 · Weekly on Sunday
        </span>
        {digests.data && (
          <Toggle
            label="Write digests"
            on={digests.data.on}
            onChange={(on) => {
              set.mutate(on);
            }}
          />
        )}
      </ScreenHeader>
      <div className="flex min-h-0 max-w-760 flex-1 flex-col gap-18 overflow-y-auto px-16 py-20">
        {digests.isPending && <LoadingRows what="the digest" rows={4} />}
        {digests.isError && <ErrorState what="the digest" onRetry={() => void digests.refetch()} />}
        {set.isError && (
          <div role="alert" className="text-note text-a3">
            That could not be changed. Try again.
          </div>
        )}
        {digests.data && !digest && (
          <EmptyState compact>{digests.data.on ? EMPTY.digest : DIGEST_OFF}</EmptyState>
        )}
        {digest && (
          <>
            <div className="flex flex-col gap-8">
              <div className="flex items-center gap-8">
                <AiBadge />
                <span className="font-mono text-meta text-mute">Written from your stream</span>
              </div>
              <h2 className="text-headline leading-headline font-semibold">
                {digestTitle(digest)}
              </h2>
              <div className="text-read leading-prose text-pretty">
                {digest.lead || digest.problem}
              </div>
            </div>
            {digest.sections.map((section, n) => (
              <section key={n} className="flex flex-col gap-6">
                <SectionLabel as="h3">{section.head}</SectionLabel>
                <div className="text-prose leading-prose text-pretty">{section.text}</div>
                {section.cites.map((cite, i) => (
                  <CitationRow
                    key={i}
                    src={cite.source}
                    icon={cite.icon}
                    title={cite.title}
                    surface="card"
                    to={cite.item_id === null ? undefined : `/stream?item=${String(cite.item_id)}`}
                  />
                ))}
              </section>
            ))}
            {!digests.data?.on && <EmptyState compact>{DIGEST_OFF}</EmptyState>}
          </>
        )}
      </div>
    </main>
  );
}
