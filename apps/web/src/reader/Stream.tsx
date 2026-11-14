import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ScreenHeader } from '../shell/ScreenHeader';
import { AiBadge, MediaThumb, SaveDot, SourceTag, SOURCES, type Source } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { cx } from '../ui/cx';
import { Input } from '../ui/Input';
import { Cell, RowButton, Table, TableBody, TableHeader, TableRow, Th } from '../ui/Table';
import { ITEMS } from './fixtures';
import { MediaPreview } from './MediaPreview';
import { ask, itemAt, toggled, useReader } from './store';

const COLS = 'grid-cols-[34px_minmax(0,1fr)_40px_30px_16px]';
const FILTERS = ['All', 'Unread', 'Saved', 'Video'] as const;
type Filter = (typeof FILTERS)[number];

/** The `:source` URL segment as a source code, or undefined for the whole stream or an unknown value. */
function sourceFrom(param: string | undefined): Source | undefined {
  const code = param?.toUpperCase();
  return code !== undefined && Object.hasOwn(SOURCES, code) ? (code as Source) : undefined;
}

export function Stream() {
  const { state, update } = useReader();
  const source = sourceFrom(useParams().source);
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState<number | null>(null);

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
                  selected={i === state.selected}
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
                <Cell className="px-16 py-24 text-mute">Nothing matches this filter.</Cell>
              </div>
            )}
          </TableBody>
        </Table>
      </main>

      <Thread key={state.selected} />

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

/** The selected item: summary, a question field, replies and the reply box. Keyed by item, so drafts reset. */
function Thread() {
  const { state, update } = useReader();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [draft, setDraft] = useState('');

  const i = state.selected;
  const item = itemAt(i);
  const saved = state.saved.has(i);
  const queued = state.laterAdded.includes(i);
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
          aria-pressed={queued}
          onClick={() => {
            update((s) => ({
              laterAdded: queued ? s.laterAdded.filter((x) => x !== i) : [i, ...s.laterAdded],
            }));
          }}
        >
          {queued ? 'Queued' : 'Read later'}
        </Button>
      </div>
      <h2 className="text-title leading-title font-semibold text-pretty">{item.title}</h2>

      <Card tone="ai" compact className="gap-7">
        <div className="flex items-center gap-8 font-mono text-label tracking-label text-accent uppercase">
          <AiBadge />
          Summary
        </div>
        <div className="text-pretty">{item.summary}</div>
        <form
          className="flex gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            // An empty question still opens Ask, scoped to this thread.
            if (!ask(update, question, 'Open thread')) update({ scope: 'Open thread' });
            void navigate('/ask');
          }}
        >
          <Input
            size="md"
            tone="ai"
            className="flex-1"
            aria-label="Ask about this thread"
            placeholder="Ask about this thread"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
            }}
          />
          <Button type="submit" variant="accent">
            Ask
          </Button>
        </form>
      </Card>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {comments.map((c, n) => (
          <div
            key={n}
            style={{ marginLeft: c.depth * 16 }}
            className={cx(
              'border-b border-l border-b-rule py-dn-4 pl-10',
              c.who === 'you' ? 'border-l-accent' : 'border-l-line',
            )}
          >
            <span className="font-semibold">{c.who}</span>{' '}
            <span className="font-mono text-code text-mute">{c.meta}</span>
            <br />
            {c.text}
          </div>
        ))}
        {comments.length === 0 && <div className="py-12 text-mute">No replies yet.</div>}
      </div>

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
    </aside>
  );
}
