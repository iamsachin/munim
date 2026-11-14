import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

// shortcut: the page asks again every minute to pick up what the worker has fetched; switch to
// server-sent events if a minute proves too slow or the asking too wasteful.
const ASK_AGAIN_MS = 60_000;

/** The owner's feeds. Shared by the sidebar's count and the RSS screen. */
export const useFeeds = () =>
  useQuery({ queryKey: ['feeds'], queryFn: api.feeds, refetchInterval: ASK_AGAIN_MS });

/** A feed's articles, newest first. Not asked for until a feed is chosen. */
export const useArticles = (feedId: number | undefined) =>
  useQuery({
    queryKey: ['articles', feedId],
    queryFn: () => api.articles(feedId ?? 0),
    enabled: feedId !== undefined,
    refetchInterval: ASK_AGAIN_MS,
  });

/** How long ago, in the stream's short form: "12m", "6h", "3d". */
export function age(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${String(minutes)}m`;
  if (minutes < 60 * 24) return `${String(Math.floor(minutes / 60))}h`;
  return `${String(Math.floor(minutes / (60 * 24)))}d`;
}
