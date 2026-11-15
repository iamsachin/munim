import { createContext, use, useState, type ReactNode } from 'react';
import { WATCHES } from './fixtures';
import type { Watch } from './types';

export const SCOPES = ['Everything', 'Saved', 'This week', 'Open item'] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * What still runs on sample data in the browser: watches. Items, feeds, highlights, questions
 * and answers, connections, AI settings and sign-in are the server's.
 */
export interface ReaderState {
  watchOff: ReadonlySet<string>;
  watchNew: readonly string[];
  /** What the next question is asked of. */
  scope: Scope;
  /** The item "Open item" means: the one a question was last asked from. */
  openItem: number | undefined;
}

export const INITIAL: ReaderState = {
  watchOff: new Set(),
  watchNew: [],
  scope: 'Everything',
  openItem: undefined,
};

type Update = (patch: Partial<ReaderState> | ((s: ReaderState) => Partial<ReaderState>)) => void;

const Ctx = createContext<{ state: ReaderState; update: Update } | null>(null);

// shortcut: in-memory state over fixtures for what the server does not hold yet
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
