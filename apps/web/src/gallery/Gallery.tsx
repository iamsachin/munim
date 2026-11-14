import { useState, type ReactNode } from 'react';
import { useTheme } from '../settings';
import { ACCENTS, DENSITIES, THEMES } from '../theme';
import {
  AiBadge,
  Highlight,
  Kbd,
  MediaThumb,
  SaveDot,
  SectionLabel,
  SourceTag,
  SOURCES,
  StatusDot,
  type Source,
} from '../ui/atoms';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip, SuggestChip } from '../ui/Chip';
import { CitationRow } from '../ui/CitationRow';
import { cx } from '../ui/cx';
import { Input } from '../ui/Input';
import { NavRow } from '../ui/NavRow';
import { EMPTY } from '../reader/copy';
import { Select } from '../ui/Select';
import { EmptyState, ErrorState, LoadingRows } from '../ui/States';
import { Swatch } from '../ui/Swatch';
import { Cell, RowButton, Table, TableHeader, TableRow, Th } from '../ui/Table';
import { Toggle } from '../ui/Toggle';

const keys = <T extends object>(o: T) => Object.keys(o) as (keyof T)[];

const COLORS = [
  ['bg', 'bg-bg'],
  ['panel', 'bg-panel'],
  ['card', 'bg-card'],
  ['line', 'bg-line'],
  ['dim', 'bg-dim'],
  ['mute', 'bg-mute'],
  ['ink', 'bg-ink'],
  ['accent', 'bg-accent'],
  ['a2', 'bg-a2'],
  ['a3', 'bg-a3'],
  ['a4', 'bg-a4'],
  ['ok', 'bg-ok'],
  ['ai-fill', 'bg-ai-fill'],
  ['mark', 'bg-mark'],
] as const;

const SIZES = [
  ['headline 22', 'text-headline leading-headline font-semibold'],
  ['title 17', 'text-title font-semibold'],
  ['brand 15.5', 'text-brand font-semibold'],
  ['read 15', 'text-read leading-read'],
  ['prose 14.5', 'text-prose leading-prose'],
  ['input 14', 'text-input'],
  ['base 13.5', 'text-base'],
  ['btn 13', 'text-btn font-semibold'],
  ['note 12.5', 'text-note'],
  ['sm 12', 'text-sm'],
  ['meta 11.5', 'font-mono text-meta'],
  ['code 11', 'font-mono text-code font-medium'],
  ['label 10.5', 'font-mono text-label tracking-label uppercase'],
  ['micro 9', 'font-mono text-micro'],
] as const;

const STREAM_COLS = 'grid-cols-[34px_minmax(0,1fr)_40px_30px_16px]';

interface StreamRow {
  src: Source;
  title: string;
  sub: string;
  replies: number | '';
  age: string;
  unread: boolean;
  media?: 'Video' | 'Image';
}

// From ITEMS in the handoff.
const STREAM: StreamRow[] = [
  {
    src: 'RD',
    title: 'What finally got you to move your feeds off five different apps?',
    sub: 'r/selfhosted · I kept losing threads I meant to come back to',
    replies: 214,
    age: '3h',
    unread: true,
  },
  {
    src: 'X',
    title: 'Shipped offline sync this week. The hard part was deciding which device wins',
    sub: '@lena_builds',
    replies: 37,
    age: '4h',
    unread: true,
  },
  {
    src: 'YT',
    title: 'Building a home server rack from scratch',
    sub: 'Bench Hours · video 18:24',
    replies: 142,
    age: '5h',
    unread: true,
    media: 'Video',
  },
  {
    src: 'RSS',
    title: 'A year of running my own feed reader',
    sub: 'Low Tech Notes · What broke and what I stopped reading',
    replies: '',
    age: '6h',
    unread: true,
  },
  {
    src: 'IG',
    title: 'New studio shelving finally up',
    sub: '@studio.kiln · photo',
    replies: 4,
    age: '13h',
    unread: false,
    media: 'Image',
  },
  {
    src: 'HN',
    title: 'SQLite as an application file format, ten years on',
    sub: '431 points',
    replies: 172,
    age: '9h',
    unread: false,
  },
];

const WATCHES = [
  ['rate limits', 7, '15h ago'],
  ['@lena_builds', 3, '4h ago'],
  ['local-first', 5, '4h ago'],
] as const;

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cx('gap-10', className)}>
      <SectionLabel as="h2">{title}</SectionLabel>
      {children}
    </Card>
  );
}

export function Gallery() {
  const { theme, setTheme: set } = useTheme();
  const [filter, setFilter] = useState('All');
  const [lock, setLock] = useState(true);
  const [previews, setPreviews] = useState(false);
  const [selected, setSelected] = useState(0);
  const [saved, setSaved] = useState<ReadonlySet<number>>(new Set([0, 2]));

  const toggleSaved = (i: number) => {
    setSaved((s) => {
      const next = new Set(s);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  };

  return (
    <main className="mx-auto flex max-w-1120 flex-col gap-12 p-16">
      <title>Design system · Munim</title>
      <header className="flex flex-wrap items-center gap-x-20 gap-y-8 border-b border-line pb-12">
        <h1 className="text-title font-semibold">Munim design system</h1>
        <div role="group" aria-label="Theme" className="flex gap-6">
          {keys(THEMES).map((t) => (
            <Chip
              key={t}
              on={theme.theme === t}
              onClick={() => {
                set({ theme: t });
              }}
            >
              {t}
            </Chip>
          ))}
        </div>
        <div role="group" aria-label="Accent" className="flex gap-8">
          {keys(ACCENTS).map((a) => (
            <Swatch
              key={a}
              name={a}
              color={ACCENTS[a]}
              on={theme.accent === a}
              onPick={() => {
                set({ accent: a });
              }}
            />
          ))}
        </div>
        <div role="group" aria-label="Density" className="flex gap-6">
          {keys(DENSITIES).map((d) => (
            <Chip
              key={d}
              on={theme.density === d}
              onClick={() => {
                set({ density: d });
              }}
            >
              {d}
            </Chip>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 items-start gap-12">
        <Section title="Colour">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-8">
            {COLORS.map(([name, bg]) => (
              <div key={name} className="flex flex-col gap-4">
                <div className={cx('h-36 rounded-5 border border-line', bg)} />
                <span className="font-mono text-code text-mute">{name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type" className="row-span-3">
          {SIZES.map(([name, cls]) => (
            <div key={name} className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-x-10">
              <span className="font-mono text-code text-mute">{name}</span>
              <span className={cx('truncate', cls)}>Chunking by reply tree beats length 0123</span>
            </div>
          ))}
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-6">
            <Button>Open digest</Button>
            <Button size="md">Disconnect</Button>
            <Button size="lg">Rotate keys</Button>
            <Button size="lg" danger>
              Delete all data
            </Button>
            <Button size="md" disabled>
              This device
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Button variant="primary">Ask</Button>
            <Button variant="primary" disabled>
              Reply
            </Button>
          </div>
        </Section>

        <Section title="Chips, toggles, swatches">
          <div className="flex flex-wrap items-center gap-6">
            {['All', 'Unread', 'Saved', 'Video'].map((label) => (
              <Chip
                key={label}
                on={filter === label}
                onClick={() => {
                  setFilter(label);
                }}
              >
                {label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <SuggestChip>Summarize this thread</SuggestChip>
            <SuggestChip>Which threads have replies to me?</SuggestChip>
          </div>
          <div className="flex items-center gap-12">
            <div className="flex-1">
              <div className="font-medium">Lock when idle</div>
              <div className="text-note text-mute">After 5 minutes</div>
            </div>
            <Toggle on={lock} label="Lock when idle" onChange={setLock} />
          </div>
          <div className="flex items-center gap-12">
            <div className="flex-1">
              <div className="font-medium">Hide previews in notifications</div>
              <div className="text-note text-mute">Show only the source name</div>
            </div>
            <Toggle on={previews} label="Hide previews in notifications" onChange={setPreviews} />
          </div>
        </Section>

        <Section title="Inputs">
          <Input aria-label="Search the stream" placeholder="Search the stream" />
          <Select aria-label="Model" defaultValue="gpt-5.5">
            <optgroup label="OpenAI">
              <option>gpt-5.5</option>
              <option>gpt-5.4-mini</option>
            </optgroup>
          </Select>
          <div className="flex gap-6">
            <Input className="flex-1" aria-label="Feed URL" placeholder="Feed URL" />
            <Button variant="accent">Ask</Button>
          </div>
          <div className="flex gap-6">
            <Input size="lg" className="flex-1" aria-label="Reply" placeholder="Reply on Reddit" />
            <Button variant="primary">Reply</Button>
          </div>
        </Section>

        <Section title="Marks">
          <div className="flex flex-wrap items-center gap-12">
            <AiBadge />
            {keys(SOURCES).map((s) => (
              <SourceTag key={s} src={s} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-12">
            <span className="flex items-center gap-6 text-note">
              <StatusDot tone="ok" />
              Connected
            </span>
            <span className="flex items-center gap-6 text-note">
              <StatusDot tone="a3" />
              Disconnected
            </span>
            <span className="flex items-center gap-6 text-note">
              <StatusDot tone="line" />
              Not available yet
            </span>
            <MediaThumb kind="Video" onClick={() => undefined} />
            <MediaThumb kind="Image" onClick={() => undefined} />
            <span className="flex gap-4">
              <Kbd>g</Kbd>
              <Kbd>s</Kbd>
            </span>
          </div>
          <div>
            <Highlight>
              Recovery is where most schemes quietly give the server a copy of the key.
            </Highlight>
            <div className="pt-3 font-mono text-code text-mute">
              Notes on end-to-end encryption for small apps · Plain Crypto
            </div>
          </div>
        </Section>

        <Card tone="ai" className="gap-8">
          <div className="flex items-center gap-8">
            <AiBadge />
            <h2 className="font-semibold">This morning&apos;s digest</h2>
            <Button className="ml-auto">Open digest</Button>
          </div>
          <div className="text-prose leading-prose text-pretty">
            Eighteen new items since yesterday evening. Two threads you replied to have new answers.
            The busiest discussion is the Hacker News thread on a local-first reading archive, and
            three of your watches matched.
          </div>
          <CitationRow
            index={1}
            src="RD"
            title="What finally got you to move your feeds off five different apps?"
            from="r/selfhosted"
          />
          <CitationRow
            index={2}
            src="X"
            title="Rate limits changed again. Summary of what moved"
            from="@api_watch"
          />
        </Card>

        <Card className="gap-4">
          <div className="flex items-center justify-between pb-4">
            <SectionLabel as="h2">Watches</SectionLabel>
            <Button>All watches</Button>
          </div>
          {WATCHES.map(([name, n, last]) => (
            <div key={name} className="flex items-baseline gap-10 px-6 py-dn-3">
              <span className="font-medium">{name}</span>
              <span className="font-mono text-meta text-accent">{n} new</span>
              <span className="ml-auto font-mono text-meta text-mute">{last}</span>
            </div>
          ))}
          <CitationRow
            src="HN"
            title="Show HN: A local-first archive for everything you read"
            surface="card"
          />
        </Card>
      </div>

      <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-12">
        <nav
          aria-label="Sidebar sample"
          className="flex flex-col rounded-6 border border-line bg-panel px-8 py-14"
        >
          <SectionLabel as="h2" className="px-8 pb-4">
            Views
          </SectionLabel>
          <NavRow name="Today" to="/today" />
          <NavRow name="Stream" count={18} to="/stream" />
          <NavRow name="Design system" to="/gallery" />
          <NavRow name="Reddit" count={4} dot="accent" to="/stream/rd" />
          <NavRow name="YouTube" count={3} dot="a4" to="/stream/yt" />
          <NavRow name="Calendar" />
        </nav>

        <div className="rounded-6 border border-line">
          <Table label="Stream">
            <TableHeader className={STREAM_COLS}>
              <Th>Src</Th>
              <Th>Item</Th>
              <Th className="text-right">Repl</Th>
              <Th className="text-right">Age</Th>
              <Th>
                <span className="sr-only">Saved</span>
              </Th>
            </TableHeader>
            {STREAM.map((r, i) => (
              <TableRow
                key={r.title}
                selected={i === selected}
                className={cx(STREAM_COLS, 'min-h-44 items-center')}
              >
                <Cell>
                  <SourceTag src={r.src} />
                </Cell>
                <Cell className="flex min-w-0 items-center gap-10">
                  {r.media && <MediaThumb kind={r.media} onClick={() => undefined} />}
                  <RowButton
                    onClick={() => {
                      setSelected(i);
                    }}
                    className={cx('min-w-0 flex-1 truncate', r.unread && 'font-semibold')}
                  >
                    {r.title}{' '}
                    <span className="pl-6 font-mono text-meta font-normal text-mute">{r.sub}</span>
                  </RowButton>
                </Cell>
                <Cell className="text-right font-mono text-meta text-mute">{r.replies}</Cell>
                <Cell className="text-right font-mono text-meta text-mute">{r.age}</Cell>
                <Cell>
                  <SaveDot
                    saved={saved.has(i)}
                    onToggle={() => {
                      toggleSaved(i);
                    }}
                  />
                </Cell>
              </TableRow>
            ))}
          </Table>
        </div>
      </div>
      <h2 className="pt-8 text-title font-semibold">States</h2>
      <div className="grid grid-cols-3 items-start gap-12">
        <div className="rounded-6 border border-line">
          <SectionLabel className="border-b border-line px-16 py-5">Loading</SectionLabel>
          <LoadingRows what="the stream" rows={4} />
        </div>
        <div className="rounded-6 border border-line">
          <SectionLabel className="border-b border-line px-16 py-5">Could not load</SectionLabel>
          <ErrorState
            what="the stream"
            detail="The server did not answer."
            onRetry={() => undefined}
          />
        </div>
        <div className="rounded-6 border border-line">
          <SectionLabel className="border-b border-line px-16 py-5">Empty</SectionLabel>
          <EmptyState>{EMPTY.stream}</EmptyState>
        </div>
      </div>
      <Section title="Empty wording">
        {keys(EMPTY).map((k) => (
          <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-x-10">
            <span className="font-mono text-code text-mute">{k}</span>
            <span className="text-mute">{EMPTY[k]}</span>
          </div>
        ))}
      </Section>
    </main>
  );
}
