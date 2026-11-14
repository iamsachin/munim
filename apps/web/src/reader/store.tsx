import { createContext, use, useState, type ReactNode } from 'react';
import { AI_INITIAL, type AiState } from '../account/ai';
import { LOCK_INITIAL, type LockSettings } from '../account/auth';
import type { Source } from '../ui/atoms';
import { FEEDS, HIGHLIGHTS, ITEMS, LATER, SAVED, WATCHES } from './fixtures';
import type { HighlightEntry, Item, SavedItem, Watch } from './types';

export const SCOPES = ['Everything', 'Saved', 'This week', 'Open item'] as const;
export type Scope = (typeof SCOPES)[number];

/** Everything the owner can change in the mock reader. Items are identified by their index in ITEMS. */
export interface ReaderState {
  selected: number;
  saved: ReadonlySet<number>;
  replies: Readonly<Record<number, readonly string[]>>;
  laterAdded: readonly number[];
  laterDone: ReadonlySet<string>;
  watchOff: ReadonlySet<string>;
  watchNew: readonly string[];
  extraFeeds: readonly string[];
  scope: Scope;
  asks: readonly { q: string; scope: Scope }[];
  disconnected: ReadonlySet<string>;
  highlights: readonly HighlightEntry[];
  ai: AiState;
  lock: LockSettings;
  locked: boolean;
  revoked: ReadonlySet<string>;
}

const STORED_TITLES = new Set(SAVED.map((s) => s.title));

export const INITIAL: ReaderState = {
  selected: 0,
  // Every stream item that is also in the stored saved list starts out saved.
  saved: new Set(ITEMS.flatMap((item, i) => (STORED_TITLES.has(item.title) ? [i] : []))),
  replies: {},
  laterAdded: [],
  laterDone: new Set(),
  watchOff: new Set(),
  watchNew: [],
  extraFeeds: [],
  scope: 'Everything',
  asks: [],
  disconnected: new Set(),
  highlights: HIGHLIGHTS,
  ai: AI_INITIAL,
  lock: LOCK_INITIAL,
  locked: false,
  revoked: new Set(),
};

type Update = (patch: Partial<ReaderState> | ((s: ReaderState) => Partial<ReaderState>)) => void;

const Ctx = createContext<{ state: ReaderState; update: Update } | null>(null);

// shortcut: synchronous in-memory state over fixtures, replace with server queries in milestone 3
export function ReaderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(INITIAL);
  const update: Update = (patch) => {
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  };
  return <Ctx value={{ state, update }}>{children}</Ctx>;
}

export function useReader() {
  const ctx = use(Ctx);
  if (!ctx) throw new Error('useReader needs a ReaderProvider above it');
  return ctx;
}

/** A copy of `set` with `value` added if absent, removed if present. */
export function toggled<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

export function itemAt(index: number): Item {
  const item = ITEMS[index];
  if (!item) throw new Error(`No item at index ${String(index)}`);
  return item;
}

export const sourceCount = (src: Source) => ITEMS.filter((i) => i.src === src).length;

export const articleCount = () => FEEDS.reduce((n, f) => n + f.articles.length, 0);

/**
 * The Saved list: items saved from the stream this session first, then the stored list minus any
 * stream item that has since been unsaved.
 */
export function savedRows(s: ReaderState): SavedItem[] {
  const fresh = [...s.saved]
    .map(itemAt)
    .filter((item) => !STORED_TITLES.has(item.title))
    .map((item): SavedItem => ({
      kind:
        item.media === 'Video'
          ? 'Video'
          : item.src === 'RSS'
            ? 'Article'
            : item.src === 'X'
              ? 'Post'
              : 'Thread',
      src: item.src,
      title: item.title,
      from: item.from,
      parsed: 'Processing',
      when: 'Now',
    }));
  const stored = SAVED.filter((row) => {
    const i = ITEMS.findIndex((item) => item.title === row.title);
    return i < 0 || s.saved.has(i);
  });
  return [...fresh, ...stored];
}

export interface LaterRow {
  key: string;
  /** Set when the row was queued from the stream, so it can be unqueued. */
  item?: number;
  src: Source;
  title: string;
  from: string;
  mins: number;
  added: string;
}

/** The read-later queue: items queued this session first, then the stored queue minus finished ones. */
export function laterRows(s: ReaderState): LaterRow[] {
  const queued = s.laterAdded.map((i) => {
    const { src, title, from } = itemAt(i);
    return { key: `i${String(i)}`, item: i, src, title, from, mins: 0, added: 'Now' };
  });
  const stored = LATER.map((l, i) => ({ key: `b${String(i)}`, ...l }));
  return [...queued, ...stored.filter((l) => !s.laterDone.has(l.key))];
}

/** The queue row for a stream item, whether it was queued this session or was already stored. */
export function laterRowFor(s: ReaderState, index: number): LaterRow | undefined {
  const { src, title } = itemAt(index);
  return laterRows(s).find((r) => r.item === index || (r.src === src && r.title === title));
}

/** The state change that takes `row` out of the queue. */
export function withoutLater(s: ReaderState, row: LaterRow): Partial<ReaderState> {
  return row.item === undefined
    ? { laterDone: new Set(s.laterDone).add(row.key) }
    : { laterAdded: s.laterAdded.filter((x) => x !== row.item) };
}

/** The state change that queues an item, or takes it out if it is already queued. */
export function laterToggled(s: ReaderState, index: number): Partial<ReaderState> {
  const row = laterRowFor(s, index);
  return row ? withoutLater(s, row) : { laterAdded: [index, ...s.laterAdded] };
}

/** "6 items · 1 h 30 min". Reading time is unknown for freshly queued items and counts as zero. */
export function laterTotal(rows: readonly LaterRow[]) {
  const mins = rows.reduce((n, r) => n + r.mins, 0);
  const time =
    mins >= 60
      ? `${String(Math.floor(mins / 60))} h ${String(mins % 60)} min`
      : `${String(mins)} min`;
  return `${String(rows.length)} items · ${time}`;
}

export interface WatchRow extends Watch {
  on: boolean;
}

export function watchRows(s: ReaderState): WatchRow[] {
  const added = s.watchNew.map((name) => ({
    name,
    kind: 'Keyword',
    where: 'All sources',
    count: 0,
    last: 'No matches',
  }));
  return [...WATCHES, ...added].map((w) => ({ ...w, on: !s.watchOff.has(w.name) }));
}

export const matchCount = (s: ReaderState) =>
  watchRows(s).reduce((n, w) => n + (w.on ? w.count : 0), 0);

/** Queues a question for the Ask screen. Returns false, changing nothing, if it is blank. */
export function ask(update: Update, question: string, scope?: Scope) {
  const q = question.trim();
  if (!q) return false;
  update((s) => ({
    scope: scope ?? s.scope,
    asks: [...s.asks, { q, scope: scope ?? s.scope }],
  }));
  return true;
}
