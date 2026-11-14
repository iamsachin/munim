import { useEffect, useState, type CSSProperties } from 'react';
import { Navigate, useParams } from 'react-router';
import { useTheme } from '../settings';
import { focusId, useKeys } from '../shell/keys';
import { ScreenHeader } from '../shell/ScreenHeader';
import { MediaThumb, SaveDot, SourceTag, SOURCES, type Source } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { cx } from '../ui/cx';
import { Input } from '../ui/Input';
import { Cell, RowButton, Table, TableBody, TableHeader, TableRow, Th } from '../ui/Table';
import { EmptyState } from '../ui/States';
import { AskCard } from './AskCard';
import { EMPTY } from './copy';
import { ITEMS } from './fixtures';
import { highlightable, Marked } from './Marked';
import { NO_REPLY } from './marks';
import { MediaPreview } from './MediaPreview';
import { itemAt, laterRowFor, laterToggled, toggled, useReader } from './store';

const COLS = 'grid-cols-[34px_minmax(0,1fr)_40px_30px_16px]';
const FILTERS = ['All', 'Unread', 'Saved', 'Video'] as const;
type Filter = (typeof FILTERS)[number];

const isSource = (code: string): code is Source => Object.hasOwn(SOURCES, code);

export function Stream() {
  const { state, update } = useReader();
  const param = useParams().source?.toUpperCase();
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState<number | null>(null);

  const { theme } = useTheme();
  const source = param !== undefined && isSource(param) ? param : undefined;

  // The open thread must belong to the stream being shown: if the selected item is from another
  // source, show this source's first item instead.
  const first = source ? ITEMS.findIndex((item) => item.src === source) : -1;
  const current = first >= 0 && itemAt(state.selected).src !== source ? first : state.selected;

  const q = query.trim().toLowerCase();
  const rows = ITEMS.map((item, i) => ({ item, i })).filter(
    ({ item, i }) =>
      (!source || item.src === source) &&
      (filter === 'All' ||
        (filter === 'Unread' && item.unread) ||
        (filter === 'Saved' && state.saved.has(i)) ||
        (filter === 'Video' && item.sub.includes('video'))) &&
      (!q || (item.title + item.from).toLowerCase().includes(q)),
  );
  const select = (i: number) => {
    update({ selected: i });
  };
  /** Moves the selection through the rows on screen, stopping at either end. */
  const move = (step: number) => {
    const at = rows.findIndex((r) => r.i === current);
    const next = rows[at < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, at + step))];
    if (next) select(next.i);
  };
  useKeys(
    {
      j: () => {
        move(1);
      },
      k: () => {
        move(-1);
      },
      s: () => {
        update((st) => ({ saved: toggled(st.saved, current) }));
      },
      l: () => {
        update((st) => laterToggled(st, current));
      },
      a: () => {
        focusId('item-ask');
      },
      r: () => {
        focusId('thread-reply');
      },
    },
    theme.shortcuts === 'On',
  );
  // Keep the selected row in view when it is moved with the keyboard.
  useEffect(() => {
    document
      .querySelector('[role="row"][aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  // An address like /stream/mastodon names no source we have.
  if (param !== undefined && !source) return <Navigate to="/today" replace />;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
      <main className="flex min-h-0 min-w-0 flex-col">
        <ScreenHeader title={source ? SOURCES[source].name : 'Stream'}>
          {FILTERS.map((f) => (
            <Chip
              key={f}
              on={filter === f}
              onClick={() => {
                setFilter(f);
              }}
            >
              {f}
            </Chip>
          ))}
          <Input
            aria-label="Search the stream"
            placeholder="Search the stream"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            className="ml-auto max-w-220 flex-[1_1_100px]"
          />
        </ScreenHeader>
        <Table label="Stream" className="flex min-h-0 flex-1 flex-col">
          <TableHeader className={COLS}>
            <Th>Src</Th>
            <Th>Item</Th>
            <Th className="text-right">Repl</Th>
            <Th className="text-right">Age</Th>
            <Th>
              <span className="sr-only">Saved</span>
            </Th>
          </TableHeader>
          <TableBody className="min-h-0 flex-1 overflow-y-auto">
            {rows.map(({ item, i }) => {
              const replies = item.replies + (state.replies[i]?.length ?? 0);
              return (
                <TableRow
                  key={i}
                  selected={i === current}
                  className={cx(COLS, 'min-h-44 items-center')}
                >
                  <Cell>
                    <SourceTag src={item.src} />
                  </Cell>
                  <Cell className="flex min-w-0 items-center gap-10">
                    {item.media && (
                      <MediaThumb
                        kind={item.media}
                        onClick={() => {
                          setZoom(i);
                        }}
                      />
                    )}
                    <RowButton
                      onClick={() => {
                        select(i);
                      }}
                      className={cx('min-w-0 flex-1 truncate', item.unread && 'font-semibold')}
                    >
                      {item.title}{' '}
                      <span className="pl-6 font-mono text-meta font-normal text-mute">
                        {[item.from, item.sub].filter(Boolean).join(' · ')}
                      </span>
                    </RowButton>
                  </Cell>
                  <Cell className="text-right font-mono text-meta text-mute">{replies || ''}</Cell>
                  <Cell className="text-right font-mono text-meta text-mute">{item.age}</Cell>
                  <Cell>
                    <SaveDot
                      saved={state.saved.has(i)}
                      onToggle={() => {
                        update((s) => ({ saved: toggled(s.saved, i) }));
                      }}
                    />
                  </Cell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <div role="row">
                <Cell className="px-16 py-24 text-mute">{EMPTY.filter}</Cell>
              </div>
            )}
          </TableBody>
        </Table>
      </main>

      <Thread key={current} index={current} />

      {zoom !== null && (
        <MediaPreview
          item={itemAt(zoom)}
          onOpenThread={() => {
            select(zoom);
            setZoom(null);
          }}
          onClose={() => {
            setZoom(null);
          }}
        />
      )}
    </div>
  );
}

/** The selected item: a question field, replies and the reply box. Keyed by item, so drafts reset. */
function Thread({ index: i }: { index: number }) {
  const { state, update } = useReader();
  const [draft, setDraft] = useState('');

  const item = itemAt(i);
  const saved = state.saved.has(i);
  const queued = laterRowFor(state, i);
  const quotes = state.highlights.filter((h) => h.title === item.title).map((h) => h.quote);
  const blocked = NO_REPLY[item.src];
  const comments = [
    ...item.comments,
    ...(state.replies[i] ?? []).map((text) => ({ who: 'you', meta: 'now', text, depth: 0 })),
  ];

  return (
    <aside
      aria-label="Thread"
      className="flex min-h-0 min-w-0 flex-col gap-12 border-l border-line bg-panel p-14"
    >
      <div className="flex items-center gap-8 font-mono text-meta text-mute">
        <SourceTag src={item.src} inheritSize />
        {/* Truncates at narrow widths so the buttons keep their place. */}
        <span className="min-w-0 truncate">
          {item.from} · {item.age}
        </span>
        <Button
          className="ml-auto font-sans"
          aria-pressed={saved}
          onClick={() => {
            update((s) => ({ saved: toggled(s.saved, i) }));
          }}
        >
          {saved ? 'Saved' : 'Save'}
        </Button>
        <Button
          className="font-sans"
          aria-pressed={!!queued}
          onClick={() => {
            update((s) => laterToggled(s, i));
          }}
        >
          {queued ? 'Queued' : 'Read later'}
        </Button>
      </div>
      <h2 className="text-title leading-title font-semibold text-pretty">{item.title}</h2>

      <AskCard what="thread" />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {comments.map((c, n) => (
          <div
            key={n}
            style={{ '--depth': c.depth } as CSSProperties}
            className={cx(
              'thread-indent border-b border-l border-b-rule py-dn-4 pl-10',
              c.who === 'you' ? 'border-l-accent' : 'border-l-line',
            )}
          >
            <span className="font-semibold">{c.who}</span>{' '}
            <span className="font-mono text-code text-mute">{c.meta}</span>
            <br />
            <span {...highlightable(item)}>
              <Marked text={c.text} quotes={quotes} />
            </span>
          </div>
        ))}
        {comments.length === 0 && <EmptyState compact>{EMPTY.replies}</EmptyState>}
      </div>

      {blocked ? (
        <div className="flex items-center gap-8">
          <span className="flex-1 text-note text-mute">{blocked}</span>
          {/* The mock has no addresses to open, so this says why rather than doing nothing. */}
          <Button size="md" disabled title="Available when sources are connected">
            Open original
          </Button>
        </div>
      ) : (
        <form
          className="flex gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text) return;
            setDraft('');
            update((s) => ({ replies: { ...s.replies, [i]: [...(s.replies[i] ?? []), text] } }));
          }}
        >
          <Input
            id="thread-reply"
            size="lg"
            className="flex-1"
            aria-label={`Reply on ${SOURCES[item.src].name}`}
            placeholder={`Reply on ${SOURCES[item.src].name}`}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
          />
          <Button type="submit" variant="primary">
            Reply
          </Button>
        </form>
      )}
    </aside>
  );
}
