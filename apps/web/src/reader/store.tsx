import { createContext, use, useState, type ReactNode } from 'react';

export const SCOPES = ['Everything', 'Saved', 'This week', 'Open item'] as const;
export type Scope = (typeof SCOPES)[number];

/** What the screens share that the server does not hold: how the next question is asked. */
export interface ReaderState {
  /** What the next question is asked of. */
  scope: Scope;
  /** The item "Open item" means: the one a question was last asked from. */
  openItem: number | undefined;
  /** The conversation open on the Ask screen, by its first question. None is the latest. */
  conversation: number | undefined;
}

export const INITIAL: ReaderState = {
  scope: 'Everything',
  openItem: undefined,
  conversation: undefined,
};

type Update = (patch: Partial<ReaderState> | ((s: ReaderState) => Partial<ReaderState>)) => void;

const Ctx = createContext<{ state: ReaderState; update: Update } | null>(null);

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
