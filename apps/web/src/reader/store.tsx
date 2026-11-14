import { createContext, use, useState, type ReactNode } from 'react';
import { AI_INITIAL, type AiState } from '../account/ai';
import { WATCHES } from './fixtures';
import type { Watch } from './types';

export const SCOPES = ['Everything', 'Saved', 'This week', 'Open item'] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * What still runs on sample data in the browser: watches, Ask, connections and AI settings.
 * Items, feeds, highlights and sign-in are the server's.
 */
export interface ReaderState {
  watchOff: ReadonlySet<string>;
  watchNew: readonly string[];
  scope: Scope;
  asks: readonly { q: string; scope: Scope }[];
  disconnected: ReadonlySet<string>;
  ai: AiState;
}

export const INITIAL: ReaderState = {
  watchOff: new Set(),
  watchNew: [],
  scope: 'Everything',
  asks: [],
  disconnected: new Set(),
  ai: AI_INITIAL,
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
