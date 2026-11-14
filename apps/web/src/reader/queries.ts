import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Item, type ItemPatch, type ItemQuery } from '../api/client';

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
export function useChangeItem() {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: ItemPatch & { id: number }) => api.changeItem(id, patch),
    onSuccess: () =>
      Promise.all(
        ['items', 'item', 'counts'].map((key) => queries.invalidateQueries({ queryKey: [key] })),
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
