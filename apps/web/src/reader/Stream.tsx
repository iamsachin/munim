import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import type { Item } from '../api/client';
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
import { EMPTY, UNAVAILABLE } from './copy';
import { NO_REPLY } from './marks';
import { marksFor, type Cited } from './units';
import { MediaPreview } from './MediaPreview';
import { age, useChangeItem, useItem, useItems } from './queries';

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
  // An address like /stream?item=7 is a link to one item, which then opens.
  // It may also name words in the item, or in one of its replies: a citation's.
  const [address] = useSearchParams();
  const linked = Number(address.get('item')) || undefined;
  const quote = address.get('quote');
  const reply = address.get('reply');
  const cited = quote ? { quote, reply: reply === null ? null : Number(reply) } : undefined;
  const [chosen, setChosen] = useState(linked);
  // The item shown large. `play` starts its video at once: choosing a card is choosing to watch.
  const [zoom, setZoom] = useState<{ id: number; play: boolean } | null>(null);
  // YouTube is looked at as much as read, so its page opens as cards of stills. The choice
  // between that and the list is kept in this browser.
  const [view, setView] = useState<View>(storedView);
  const cards = source === 'YT' && view === 'Cards';
  // An empty list says why: a filter hides everything, the source cannot be read, or nothing is in.
  const nothing =
    filter !== 'All' || query.trim()
      ? EMPTY.filter
      : source && source in UNAVAILABLE
        ? `Not available yet. ${UNAVAILABLE[source as keyof typeof UNAVAILABLE]}`
        : EMPTY.stream;
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
  // An item linked to is open even if it is not listed: it may be too old to be.
  const unlisted = chosen !== undefined && chosen === linked;
  const current = rows.find((item) => item.id === chosen) ?? (unlisted ? undefined : rows[0]);
  const openId = current?.id ?? (unlisted ? chosen : undefined);
  const zoomed = rows.find((item) => item.id === zoom?.id);

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
    document.querySelector('main [aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
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
          {source === 'YT' && (
            <div role="group" aria-label="View" className="ml-auto flex gap-6">
              {VIEWS.map((v) => (
                <Chip
                  key={v}
                  on={view === v}
                  onClick={() => {
                    setView(v);
                    try {
                      localStorage.setItem(VIEW_KEY, v);
                    } catch {
                      // Storage can be switched off; the choice then lasts until the page is left.
                    }
                  }}
                >
                  {v}
                </Chip>
              ))}
            </div>
          )}
          <Input
            aria-label="Search the stream"
            placeholder="Search the stream"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            className={cx('max-w-220 flex-[1_1_100px]', source !== 'YT' && 'ml-auto')}
          />
        </ScreenHeader>
        {cards ? (
          <div
            role="list"
            aria-label="Stream"
            className="grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-16 overflow-y-auto p-16"
          >
            {rows.map((item) => (
              <VideoCard
                key={item.id}
                item={item}
                now={now}
                selected={item.id === current?.id}
                onOpen={() => {
                  // Opened like a row (it is the one in the thread pane, and is read), and
                  // shown large to be watched.
                  open(item.id);
                  setZoom({ id: item.id, play: true });
                }}
                onSave={() => {
                  change.mutate({ id: item.id, saved: !item.saved_at });
                }}
              />
            ))}
            <div className="col-span-full empty:hidden">
              {items.isPending && <LoadingRows what="the stream" />}
              {items.isError && (
                <ErrorState what="the stream" onRetry={() => void items.refetch()} />
              )}
              {items.isSuccess && rows.length === 0 && <p className="py-8 text-mute">{nothing}</p>}
            </div>
          </div>
        ) : (
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
                    <SourceTag src={item.source} icon={item.icon} />
                  </Cell>
                  <Cell className="flex min-w-0 items-center gap-10">
                    {item.media && (
                      <MediaThumb
                        kind={item.media}
                        src={item.thumb}
                        onClick={() => {
                          setZoom({ id: item.id, play: false });
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
                  <Cell className="px-16 py-24 text-mute">{nothing}</Cell>
                </div>
              )}
            </TableBody>
          </Table>
        )}
      </main>

      {openId !== undefined ? (
        <Thread
          key={openId}
          id={openId}
          now={now}
          q={query.trim()}
          cited={openId === linked ? cited : undefined}
        />
      ) : (
        <aside aria-label="Thread" className="border-l border-line bg-panel" />
      )}

      {zoomed && (
        <MediaPreview
          item={zoomed}
          play={zoom?.play ?? false}
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

const VIEWS = ['Cards', 'List'] as const;
type View = (typeof VIEWS)[number];
const VIEW_KEY = 'munim.youtube-view';
/** The view chosen last time in this browser. Anything else found there means the default. */
function storedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'List' ? 'List' : 'Cards';
  } catch {
    return 'Cards';
  }
}

/**
 * A video as a card: its still with its length, its title, and who posted it when. Choosing it
 * opens it large, playing.
 */
function VideoCard({
  item,
  now,
  selected,
  onOpen,
  onSave,
}: {
  item: Item;
  now: number;
  selected: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  const [noStill, setNoStill] = useState(false);
  // "video 18:24" in a row; on a still, just the length.
  const length = item.sub.replace(/^video\s*/, '');
  return (
    <div role="listitem" className="flex min-w-0 flex-col gap-4">
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={onOpen}
        className="group flex cursor-pointer flex-col gap-6 text-left"
      >
        <span
          className={cx(
            'stripes relative block aspect-video overflow-hidden rounded-6 border',
            selected ? 'border-accent' : 'border-line group-hover:border-accent',
          )}
        >
          {item.thumb && !noStill && (
            <img
              src={item.thumb}
              alt=""
              loading="lazy"
              onError={() => {
                setNoStill(true);
              }}
              className="size-full object-cover"
            />
          )}
          {length && (
            <span className="absolute right-4 bottom-4 rounded-4 bg-scrim px-4 font-mono text-code text-ink">
              {length}
            </span>
          )}
        </span>
        <span className={cx('line-clamp-2 text-pretty', item.unread && 'font-semibold')}>
          {item.title}
        </span>
      </button>
      <div className="flex items-center gap-6 font-mono text-meta text-mute">
        <span className="min-w-0 flex-1 truncate">
          {item.origin} · {age(item.published_at, now)}
        </span>
        <SaveDot saved={item.saved_at !== null} onToggle={onSave} />
      </div>
    </div>
  );
}

/**
 * The words a search matched in the open item: how many, where each is down the text (0 at the
 * top, 1 at the bottom), which one the owner is at, and a way to go to another. They are found
 * in the page itself, by the mark each one is drawn with.
 */
function useFoundMarks(
  scroller: RefObject<HTMLDivElement | null>,
  text: RefObject<HTMLDivElement | null>,
  key: string,
) {
  const [tops, setTops] = useState<readonly number[]>([]);
  const [at, setAt] = useState(0);
  const marks = () => [...(text.current?.querySelectorAll<HTMLElement>('mark[data-found]') ?? [])];
  const place = (mark: HTMLElement, within: HTMLElement) =>
    mark.getBoundingClientRect().top - within.getBoundingClientRect().top + within.scrollTop;

  const go = (to: number) => {
    const all = marks();
    const within = scroller.current;
    if (!within || all.length === 0) return;
    const index = (to + all.length) % all.length;
    all.forEach((mark, n) => mark.toggleAttribute('data-current', n === index));
    const mark = all[index];
    // A third of the way down, so what leads up to the match can be read too.
    if (mark) within.scrollTo({ top: place(mark, within) - within.clientHeight / 3 });
    setAt(index);
  };
  const measure = () => {
    const within = scroller.current;
    if (within) setTops(marks().map((mark) => place(mark, within) / within.scrollHeight));
  };
  const onChange = useEffectEvent(() => {
    measure();
    go(0);
  });
  const onResize = useEffectEvent(measure);

  useEffect(() => {
    // After the marks are drawn: the first match is brought into view.
    const frame = requestAnimationFrame(onChange);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [key, scroller, text]);
  useEffect(() => {
    // An image arriving, or the window changing size, moves every match.
    const watcher = new ResizeObserver(onResize);
    if (scroller.current) watcher.observe(scroller.current);
    if (text.current) watcher.observe(text.current);
    return () => {
      watcher.disconnect();
    };
  }, [key, scroller, text]);

  return { count: tops.length, tops, at, go };
}

/** The open item: a question field, its text and replies, and where to go next. Keyed by item. */
function Thread({
  id,
  now,
  q,
  cited,
}: {
  id: number;
  now: number;
  q: string;
  /** Words the item was opened at: they are marked and brought into view, as a match is. */
  cited?: Cited;
}) {
  const item = useItem(id, q);
  const scroller = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  // Counted again whenever the text or what was searched for changes.
  const matches = useFoundMarks(
    scroller,
    text,
    `${String(id)} ${JSON.stringify(item.data?.found)} ${cited?.quote ?? ''}`,
  );
  // What to mark in the text and in each reply: highlights, and what the search matched.
  const marks = useMemo(() => {
    const opened = item.data;
    if (!opened) return [];
    const parts = [opened.blocks, ...opened.comments.map((comment) => comment.blocks)];
    return marksFor(parts, opened.highlights, opened.found, cited);
    // The words cited are compared, not the object, which is made anew each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.data, cited?.quote, cited?.reply]);
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
  const isArticle = it.source === 'RSS';

  return (
    <aside aria-label="Thread" className={frame}>
      <div className="flex items-center gap-8 font-mono text-meta text-mute">
        <SourceTag src={it.source} icon={it.icon} inheritSize />
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

      <AskCard what={isArticle ? 'article' : 'thread'} item={it.id} />

      {matches.count > 0 && (
        <div className="flex items-center gap-6 font-mono text-meta text-mute">
          <span role="status">
            Match {matches.at + 1} of {matches.count}
          </span>
          <Button
            className="ml-auto font-sans"
            aria-label="Previous match"
            onClick={() => {
              matches.go(matches.at - 1);
            }}
          >
            ↑
          </Button>
          <Button
            className="font-sans"
            aria-label="Next match"
            onClick={() => {
              matches.go(matches.at + 1);
            }}
          >
            ↓
          </Button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
          <div ref={text} className="flex flex-col">
            {/* An article is read here, in the reading size the RSS screen uses. */}
            {it.blocks.length > 0 && (
              <Blocks
                blocks={it.blocks}
                where={{ item: it.id, reply: null }}
                marks={marks[0]}
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
                  where={{ item: it.id, reply: n }}
                  marks={marks[n + 1]}
                />
              </div>
            ))}
            {/* A feed article has no replies to wait for, so it does not say "none yet". */}
            {it.comments.length === 0 && !isArticle && (
              <EmptyState compact>
                {it.source === 'YT' ? EMPTY.youtubeComments : EMPTY.replies}
              </EmptyState>
            )}
          </div>
        </div>
        {/* Where the matches are, down the edge of the text. For the pointer: the keyboard has
            the two buttons above. It sits in the pane's own margin, so the text does not move. */}
        {matches.count > 0 && (
          <div aria-hidden="true" className="absolute inset-y-0 -right-12 w-8">
            {matches.tops.map((top, n) => (
              <button
                key={n}
                type="button"
                tabIndex={-1}
                style={{ '--at': top } as CSSProperties}
                className="found-tick absolute h-3 w-8 cursor-pointer rounded-pill bg-a2"
                onClick={() => {
                  matches.go(n);
                }}
              />
            ))}
          </div>
        )}
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
