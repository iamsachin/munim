import { useEffect, useState, type CSSProperties } from 'react';
import { Navigate, useParams } from 'react-router';
import { useTheme } from '../settings';
import { focusId, useKeys } from '../shell/keys';
import { ScreenHeader } from '../shell/ScreenHeader';
import { MediaThumb, SaveDot, SourceTag, SOURCES, type Source } from '../ui/atoms';
import { Button, buttonClass } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { cx } from '../ui/cx';
import { Input } from '../ui/Input';
import { EmptyState, ErrorState, LoadingRows } from '../ui/States';
import { Cell, RowButton, Table, TableBody, TableHeader, TableRow, Th } from '../ui/Table';
import { AskCard } from './AskCard';
import { Blocks } from './Blocks';
import { EMPTY } from './copy';
import { NO_REPLY } from './marks';
import { MediaPreview } from './MediaPreview';
import { age, useChangeItem, useItem, useItems } from './queries';
import { useReader } from './store';

const COLS = 'grid-cols-[34px_minmax(0,1fr)_40px_30px_16px]';
const FILTERS = ['All', 'Unread', 'Saved', 'Video'] as const;
type Filter = (typeof FILTERS)[number];

const isSource = (code: string): code is Source => Object.hasOwn(SOURCES, code);

export function Stream() {
  const param = useParams().source?.toUpperCase();
  const source = param !== undefined && isSource(param) ? param : undefined;
  const { theme } = useTheme();
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const [zoom, setZoom] = useState<number | null>(null);
  // Ages are worked out against one moment, so they do not change while the screen is open.
  const [now] = useState(() => Date.now());

  // Items opened while the Unread filter is on. They stay listed until the filter changes:
  // without this, opening an unread item would remove it from under the owner's eyes.
  const [keptOpen, setKeptOpen] = useState<ReadonlySet<number>>(new Set());

  const items = useItems({ source, show: filter === 'Saved' ? 'saved' : 'all', q: query.trim() });
  const change = useChangeItem();
  // Video (which the server has no notion of yet) and Unread are narrowed here.
  const rows = (items.data ?? []).filter(
    (item) =>
      (filter !== 'Video' || item.media === 'Video') &&
      (filter !== 'Unread' || item.unread || keptOpen.has(item.id)),
  );
  // The open item is the one chosen, if it is in the list on screen; otherwise the first row.
  const current = rows.find((item) => item.id === chosen) ?? rows[0];
  const zoomed = rows.find((item) => item.id === zoom);

  /**
   * Opens an item and marks it read. Only a deliberate choice does this: the row shown by
   * default stays unread, or opening the Unread filter would read its way down the list.
   */
  const open = (id: number) => {
    setChosen(id);
    if (filter === 'Unread') setKeptOpen((kept) => new Set(kept).add(id));
    if (rows.find((item) => item.id === id)?.unread) change.mutate({ id, read: true });
  };
  const move = (step: number) => {
    const at = rows.findIndex((item) => item.id === current?.id);
    const next = rows[at < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, at + step))];
    if (next) open(next.id);
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
        if (current) change.mutate({ id: current.id, saved: !current.saved_at });
      },
      l: () => {
        if (current) change.mutate({ id: current.id, later: !current.later_at });
      },
      a: () => {
        focusId('item-ask');
      },
    },
    theme.shortcuts === 'On',
  );
  // Keep the selected row in view when it is moved with the keyboard.
  useEffect(() => {
    document
      .querySelector('[role="row"][aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [current?.id]);

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
                setKeptOpen(new Set());
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
            {rows.map((item) => (
              <TableRow
                key={item.id}
                selected={item.id === current?.id}
                className={cx(COLS, 'min-h-44 items-center')}
              >
                <Cell>
                  <SourceTag src={item.source} />
                </Cell>
                <Cell className="flex min-w-0 items-center gap-10">
                  {item.media && (
                    <MediaThumb
                      kind={item.media}
                      onClick={() => {
                        setZoom(item.id);
                      }}
                    />
                  )}
                  <RowButton
                    onClick={() => {
                      open(item.id);
                    }}
                    className={cx('min-w-0 flex-1 truncate', item.unread && 'font-semibold')}
                  >
                    {item.title}{' '}
                    <span className="pl-6 font-mono text-meta font-normal text-mute">
                      {[item.origin, item.sub].filter(Boolean).join(' · ')}
                    </span>
                  </RowButton>
                </Cell>
                <Cell className="text-right font-mono text-meta text-mute">
                  {item.replies || ''}
                </Cell>
                <Cell className="text-right font-mono text-meta text-mute">
                  {age(item.published_at, now)}
                </Cell>
                <Cell>
                  <SaveDot
                    saved={item.saved_at !== null}
                    onToggle={() => {
                      change.mutate({ id: item.id, saved: !item.saved_at });
                    }}
                  />
                </Cell>
              </TableRow>
            ))}
            {items.isPending && (
              <div role="row">
                <Cell>
                  <LoadingRows what="the stream" />
                </Cell>
              </div>
            )}
            {items.isError && (
              <div role="row">
                <Cell>
                  <ErrorState what="the stream" onRetry={() => void items.refetch()} />
                </Cell>
              </div>
            )}
            {items.isSuccess && rows.length === 0 && (
              <div role="row">
                <Cell className="px-16 py-24 text-mute">
                  {filter === 'All' && !query.trim() ? EMPTY.stream : EMPTY.filter}
                </Cell>
              </div>
            )}
          </TableBody>
        </Table>
      </main>

      {current ? (
        <Thread key={current.id} id={current.id} now={now} />
      ) : (
        <aside aria-label="Thread" className="border-l border-line bg-panel" />
      )}

      {zoomed && (
        <MediaPreview
          item={zoomed}
          now={now}
          onOpenThread={() => {
            open(zoomed.id);
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

/** The open item: a question field, its text and replies, and where to go next. Keyed by item. */
function Thread({ id, now }: { id: number; now: number }) {
  const { state } = useReader();
  const item = useItem(id);
  const change = useChangeItem();
  const frame = 'flex min-h-0 min-w-0 flex-col gap-12 border-l border-line bg-panel p-14';

  if (!item.data) {
    return (
      <aside aria-label="Thread" className={frame}>
        {item.isError ? (
          <ErrorState what="this item" onRetry={() => void item.refetch()} />
        ) : (
          <LoadingRows what="this item" rows={4} />
        )}
      </aside>
    );
  }
  const it = item.data;
  const quotes = state.highlights.filter((h) => h.title === it.title).map((h) => h.quote);
  const isArticle = it.source === 'RSS';

  return (
    <aside aria-label="Thread" className={frame}>
      <div className="flex items-center gap-8 font-mono text-meta text-mute">
        <SourceTag src={it.source} inheritSize />
        {/* Truncates at narrow widths so the buttons keep their place. */}
        <span className="min-w-0 truncate">
          {it.origin} · {age(it.published_at, now)}
        </span>
        <Button
          className="ml-auto font-sans"
          aria-pressed={it.saved_at !== null}
          onClick={() => {
            change.mutate({ id, saved: !it.saved_at });
          }}
        >
          {it.saved_at ? 'Saved' : 'Save'}
        </Button>
        <Button
          className="font-sans"
          aria-pressed={it.later_at !== null}
          onClick={() => {
            change.mutate({ id, later: !it.later_at });
          }}
        >
          {it.later_at ? 'Queued' : 'Read later'}
        </Button>
      </div>
      <h2 className="text-title leading-title font-semibold text-pretty">{it.title}</h2>

      <AskCard what={isArticle ? 'article' : 'thread'} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* An article is read here, in the reading size the RSS screen uses. */}
        {it.blocks.length > 0 && (
          <Blocks
            blocks={it.blocks}
            item={{ src: it.source, title: it.title, from: it.origin }}
            quotes={quotes}
            className="pb-12"
          />
        )}
        {it.comments.map((c, n) => (
          <div
            key={n}
            style={{ '--depth': c.depth } as CSSProperties}
            className="thread-indent border-b border-l border-b-rule border-l-line py-dn-4 pl-10"
          >
            <span className="font-semibold">{c.who}</span>{' '}
            <span className="font-mono text-code text-mute">{c.meta}</span>
            <Blocks
              compact
              blocks={c.blocks}
              item={{ src: it.source, title: it.title, from: it.origin }}
              quotes={quotes}
            />
          </div>
        ))}
        {/* A feed article has no replies to wait for, so it does not say "none yet". */}
        {it.comments.length === 0 && !isArticle && <EmptyState compact>{EMPTY.replies}</EmptyState>}
      </div>

      <div className="flex items-center gap-8">
        <span className="flex-1 text-note text-mute">{NO_REPLY[it.source]}</span>
        {it.url ? (
          <a href={it.url} target="_blank" rel="noreferrer" className={buttonClass({ size: 'md' })}>
            Open original
          </a>
        ) : (
          <Button size="md" disabled title="This item has no address to open">
            Open original
          </Button>
        )}
      </div>
    </aside>
  );
}
