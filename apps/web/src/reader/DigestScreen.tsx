import { useState } from 'react';
import { ScreenHeader } from '../shell/ScreenHeader';
import { AiBadge, SectionLabel } from '../ui/atoms';
import { Chip } from '../ui/Chip';
import { CitationRow } from '../ui/CitationRow';
import { DIGESTS } from './fixtures';

const KINDS = ['Daily', 'Weekly'] as const;

export function DigestScreen() {
  const [kind, setKind] = useState<(typeof KINDS)[number]>('Daily');
  const digest = DIGESTS[kind];

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
      </ScreenHeader>
      <div className="flex min-h-0 max-w-760 flex-1 flex-col gap-18 overflow-y-auto px-16 py-20">
        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-8">
            <AiBadge />
            <span className="font-mono text-meta text-mute">Written from your stream</span>
          </div>
          <h2 className="text-headline leading-headline font-semibold">{digest.title}</h2>
          <div className="text-read leading-prose text-pretty">{digest.lead}</div>
        </div>
        {digest.sections.map((d) => (
          <section key={d.head} className="flex flex-col gap-6">
            <SectionLabel as="h3">{d.head}</SectionLabel>
            <div className="text-prose leading-prose text-pretty">{d.text}</div>
            {d.items.map((item) => (
              <CitationRow key={item.title} src={item.src} title={item.title} surface="card" />
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
