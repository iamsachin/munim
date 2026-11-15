import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Ask, type Item, type ItemPatch, type ItemQuery } from '../api/client';
import { useReader, type Scope } from './store';

// shortcut: the page asks again every minute to pick up what the worker has fetched; switch to
// server-sent events if a minute proves too slow or the asking too wasteful.
const ASK_AGAIN_MS = 60_000;

/** The owner's feeds. Shared by the sidebar's count and the RSS screen. */
export const useFeeds = () =>
  useQuery({ queryKey: ['feeds'], queryFn: api.feeds, refetchInterval: ASK_AGAIN_MS });

/**
 * A list of items. While a changed query loads, the previous rows stay on screen, so typing in
 * the search field does not blank the list.
 */
export const useItems = (query: ItemQuery = {}, enabled = true) =>
  useQuery({
    queryKey: ['items', query],
    queryFn: () => api.items(query),
    refetchInterval: ASK_AGAIN_MS,
    placeholderData: keepPreviousData,
    enabled,
  });

/** One item opened: its text, replies and address. Not asked for until there is an id. */
export const useItem = (id: number | undefined, q = '') =>
  useQuery({
    queryKey: ['item', id, q],
    queryFn: () => api.item(id ?? 0, q),
    enabled: id !== undefined,
    // While the search that opened it is still being typed, the same item stays on screen.
    placeholderData: (previous, was) => (was?.queryKey[1] === id ? previous : undefined),
  });

/** The numbers beside the sidebar's rows. */
export const useCounts = () =>
  useQuery({ queryKey: ['counts'], queryFn: api.counts, refetchInterval: ASK_AGAIN_MS });

/** Marks an item read, saved or queued. Every list and count that might show it is asked again. */
/** Every highlight, newest first. Shared by the Highlights screen and Today. */
export const useHighlights = () => useQuery({ queryKey: ['highlights'], queryFn: api.highlights });

/** What changes when a highlight is made, noted or removed: the list, its count, and the item. */
function useHighlightChange<In, Out>(mutationFn: (input: In) => Promise<Out>) {
  const queries = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        // The feeds too: each says how many of its articles would outlive it.
        ['highlights', 'item', 'counts', 'feeds'].map((key) =>
          queries.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}
export const useAddHighlight = () => useHighlightChange(api.addHighlight);
export const useNoteHighlight = () => useHighlightChange(api.noteHighlight);
export const useRemoveHighlight = () => useHighlightChange(api.removeHighlight);

/**
 * "Today", "Yesterday", "Mon", "3 Nov": the day something was done, as the Highlights screen
 * words it. Days are the owner's own, not UTC's.
 */
export function day(iso: string, now: number): string {
  const then = new Date(iso);
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((midnight(new Date(now)).getTime() - midnight(then).getTime()) / 864e5);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return then.toLocaleDateString('en', { weekday: 'short' });
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function useChangeItem() {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: ItemPatch & { id: number }) => api.changeItem(id, patch),
    onSuccess: () =>
      Promise.all(
        // The feeds too: each says how many of its articles would outlive it.
        ['items', 'item', 'counts', 'feeds'].map((key) =>
          queries.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

/** How long ago, in the stream's short form: "12m", "6h", "3d". */
export function age(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${String(minutes)}m`;
  if (minutes < 60 * 24) return `${String(Math.floor(minutes / 60))}h`;
  return `${String(Math.floor(minutes / (60 * 24)))}d`;
}

/** "6 items · 1 h 30 min": how much reading a list holds. */
export function readingTotal(items: readonly Pick<Item, 'minutes'>[]) {
  const minutes = items.reduce((n, item) => n + item.minutes, 0);
  const time =
    minutes >= 60
      ? `${String(Math.floor(minutes / 60))} h ${String(minutes % 60)} min`
      : `${String(minutes)} min`;
  return `${String(items.length)} ${items.length === 1 ? 'item' : 'items'} · ${time}`;
}

export const KINDS = ['Video', 'Thread', 'Post', 'Article'] as const;
export type Kind = (typeof KINDS)[number];

/** What sort of thing an item is, for the Saved screen. */
export function kindOf(item: Pick<Item, 'source' | 'media'>): Kind {
  if (item.media === 'Video') return 'Video';
  if (item.source === 'RSS') return 'Article';
  if (item.source === 'X' || item.source === 'IG') return 'Post';
  return 'Thread';
}

/** What Munim holds of a saved item. */
export function heldOf(item: Pick<Item, 'source' | 'media' | 'replies'>): string {
  if (item.source === 'RSS') return 'Full text';
  const comments = `${String(item.replies)} ${item.replies === 1 ? 'comment' : 'comments'}`;
  return item.replies ? comments : 'Text';
}

/** Whether Hacker News is switched on, and how its last fetch went. */
export const useHackerNews = () =>
  useQuery({ queryKey: ['hacker-news'], queryFn: api.hackerNews, refetchInterval: ASK_AGAIN_MS });

/** Switches Hacker News on or off. Its stories arrive once the worker has fetched them. */
export function useSetHackerNews() {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: api.setHackerNews,
    onSuccess: (now) => {
      queries.setQueryData(['hacker-news'], now);
    },
  });
}

/** Each scope as the server knows it. */
const SCOPE_CODES = {
  Everything: 'everything',
  Saved: 'saved',
  'This week': 'week',
  'Open item': 'item',
} as const satisfies Record<Scope, Ask['scope']>;

/**
 * The latest daily and weekly digest, and whether they are being written. Switched on with
 * none yet, it is looked for again every so often: the worker writes it, not this request.
 */
export const useDigests = () =>
  useQuery({
    queryKey: ['digests'],
    queryFn: api.digests,
    refetchInterval: (query) => (query.state.data?.on && !query.state.data.daily ? 10_000 : false),
  });

export function useSetDigests() {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: api.setDigests,
    onSuccess: (digests) => {
      queries.setQueryData(['digests'], digests);
    },
  });
}

/**
 * What was asked and answered. While an answer is being written it is asked for a few times a
 * second, so the words are seen as they arrive.
 */
export const useAsks = () =>
  useQuery({
    queryKey: ['asks'],
    queryFn: api.asks,
    refetchInterval: (query) =>
      query.state.data?.some((asked) => asked.status === 'pending') ? 400 : false,
  });

/**
 * Sends a question to the server, where the worker puts it to the model: the answer comes to
 * the Ask screen as it is written. Returns false, sending nothing, if the question is blank.
 * `item` is the open item, for a question about it. `follows` is the earlier question this
 * one follows up: it is then asked of what that one was, whatever the scope chosen now.
 */
export function useAsk() {
  const { state, update } = useReader();
  const queries = useQueryClient();
  const send = useMutation({
    // Named, so that the Ask screen can say which questions could not be sent.
    mutationKey: ['ask'],
    mutationFn: api.ask,
    onSuccess: () => queries.invalidateQueries({ queryKey: ['asks'] }),
  });
  return (question: string, scope: Scope = state.scope, item = state.openItem, follows?: Ask) => {
    const text = question.trim();
    if (!text) return false;
    if (follows) {
      send.mutate({ question: text, scope: follows.scope, follows: follows.id });
      return true;
    }
    // A new question is the latest conversation, which is the one Ask then shows.
    update({ scope, openItem: item, conversation: undefined });
    send.mutate({
      question: text,
      scope: SCOPE_CODES[scope],
      item_id: scope === 'Open item' ? (item ?? null) : null,
    });
    return true;
  };
}

/**
 * The questions as conversations, the one last added to first. The questions about one item
 * are one conversation; any other question starts one, which its follow-ups join. Within a
 * conversation the questions are in the order asked.
 */
export function conversations(asks: readonly Ask[]): Ask[][] {
  // Each conversation, found by its item and by any of its questions.
  const groups = new Map<string, Ask[]>();
  // Where each conversation's last question is in the list, which is oldest first.
  const latest = new Map<Ask[], number>();
  asks.forEach((asked, n) => {
    const item = asked.about ? `item ${String(asked.about.item_id)}` : undefined;
    const group =
      (item === undefined ? undefined : groups.get(item)) ??
      groups.get(`ask ${String(asked.follows)}`) ??
      [];
    group.push(asked);
    if (item) groups.set(item, group);
    groups.set(`ask ${String(asked.id)}`, group);
    latest.set(group, n);
  });
  return [...latest.keys()].sort((a, b) => (latest.get(b) ?? 0) - (latest.get(a) ?? 0));
}
