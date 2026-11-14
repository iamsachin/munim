import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, reason, type Feed } from '../api/client';
import { useTheme } from '../settings';
import { focusId, useKeys } from '../shell/keys';
import { Button, buttonClass } from '../ui/Button';
import { cx } from '../ui/cx';
import { Input } from '../ui/Input';
import { EmptyState, ErrorState, LoadingRows } from '../ui/States';
import { AskCard } from './AskCard';
import { EMPTY } from './copy';
import { highlightable, Marked } from './Marked';
import { age, useChangeItem, useFeeds, useItem, useItems } from './queries';
import { useReader } from './store';

export function Rss() {
  const { state } = useReader();
  const { theme } = useTheme();
  const queries = useQueryClient();
  const feeds = useFeeds();
  const change = useChangeItem();
  const [chosenFeed, setChosenFeed] = useState<number | undefined>(undefined);
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const [url, setUrl] = useState('');
  // Ages are worked out against one moment, so they do not change while the screen is open.
  const [now] = useState(() => Date.now());

  // Until one is chosen, the first feed and its newest article are shown.
  const feed = feeds.data?.find((f) => f.id === chosenFeed) ?? feeds.data?.[0];
  const articles = useItems({ feed: feed?.id }, feed !== undefined);
  const current = articles.data?.find((a) => a.id === chosen) ?? articles.data?.[0];
  const article = useItem(current?.id);

  const add = useMutation({
    mutationFn: api.addFeed,
    onSuccess: (added: Feed) => {
      setUrl('');
      setChosenFeed(added.id);
      setChosen(undefined);
      // The new feed's articles are in the stream and the counts too.
      return Promise.all(
        ['feeds', 'items', 'counts'].map((key) => queries.invalidateQueries({ queryKey: [key] })),
      );
    },
  });

  /** Opens an article and marks it read. Only a deliberate choice does this. */
  const open = (id: number) => {
    setChosen(id);
    if (articles.data?.find((a) => a.id === id)?.unread) change.mutate({ id, read: true });
  };
  const move = (step: number) => {
    const list = articles.data ?? [];
    const at = list.findIndex((a) => a.id === current?.id);
    const next = list[at < 0 ? 0 : Math.min(list.length - 1, Math.max(0, at + step))];
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
      a: () => {
        focusId('item-ask');
      },
    },
    theme.shortcuts === 'On',
  );

  return (
    <main className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_minmax(0,1.2fr)]">
      <title>RSS · Munim</title>
      <div className="flex min-h-0 flex-col gap-2 border-r border-line px-8 py-12">
        <h1 className="mb-8 px-8 text-title font-semibold">RSS</h1>
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {feeds.isPending && <LoadingRows what="feeds" rows={3} />}
          {feeds.isError && <ErrorState what="your feeds" onRetry={() => void feeds.refetch()} />}
          {feeds.data?.length === 0 && <EmptyState compact>{EMPTY.feeds}</EmptyState>}
          {feeds.data?.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-current={f.id === feed?.id || undefined}
              onClick={() => {
                setChosenFeed(f.id);
                setChosen(undefined);
                // A complaint about the last address typed has nothing to do with this feed.
                add.reset();
              }}
              className={cx(
                'flex cursor-pointer justify-between gap-6 rounded-5 px-8 py-dn-3 text-left hover:bg-card',
                f.id === feed?.id ? 'bg-card text-ink' : 'text-mute',
              )}
            >
              <span className="truncate">{f.title}</span>
              <span className="font-mono text-meta text-mute">{f.articles || ''}</span>
            </button>
          ))}
        </div>
        <form
          className="mt-auto flex flex-col gap-6 px-2 pt-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim() && !add.isPending) add.mutate(url.trim());
          }}
        >
          <div role="alert" className="text-note text-a3 empty:hidden">
            {add.isError ? reason(add.error) : null}
          </div>
          <div className="flex gap-6">
            <Input
              size="md"
              className="flex-1"
              aria-label="Feed URL"
              placeholder="Feed URL"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                add.reset();
              }}
            />
            <Button type="submit" size="stretch" disabled={add.isPending}>
              Add
            </Button>
          </div>
        </form>
      </div>

      <div className="min-h-0 overflow-y-auto border-r border-line">
        {feed?.problem && (
          <p role="status" className="border-b border-rule px-16 py-10 text-note text-a3">
            Could not refresh this feed. {feed.problem}
          </p>
        )}
        {feed && articles.isPending && <LoadingRows what="articles" />}
        {articles.isError && (
          <ErrorState what="the articles" onRetry={() => void articles.refetch()} />
        )}
        {articles.data?.length === 0 && <EmptyState>{EMPTY.articles}</EmptyState>}
        {articles.data?.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-current={a.id === current?.id || undefined}
            onClick={() => {
              open(a.id);
            }}
            className={cx(
              'block w-full cursor-pointer border-b border-rule px-16 py-dn-6 text-left hover:bg-card',
              a.id === current?.id && 'row-bar bg-card',
            )}
          >
            <span className="block font-mono text-code text-mute">
              {age(a.published_at, now)} · {a.minutes} min
            </span>
            <span className={cx('block', a.unread && 'font-semibold')}>{a.title}</span>
          </button>
        ))}
      </div>

      <article className="flex min-h-0 flex-col gap-12 overflow-y-auto bg-panel px-24 py-20">
        {current && feed ? (
          <>
            <div className="flex items-center gap-8 font-mono text-meta text-mute">
              <span className="font-medium text-a2">RSS</span>
              {/* Truncates at narrow widths so the buttons keep their place. */}
              <span className="min-w-0 truncate">
                {feed.title} · {age(current.published_at, now)} · {current.minutes} min
              </span>
              <Button
                className="ml-auto font-sans"
                aria-pressed={current.saved_at !== null}
                onClick={() => {
                  change.mutate({ id: current.id, saved: !current.saved_at });
                }}
              >
                {current.saved_at ? 'Saved' : 'Save'}
              </Button>
              {article.data?.url ? (
                <a
                  href={article.data.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`${buttonClass()} font-sans`}
                >
                  Open original
                </a>
              ) : (
                <Button className="font-sans" disabled title="This feed gives no link for it">
                  Open original
                </Button>
              )}
            </div>
            <h2 className="text-headline leading-headline font-semibold text-pretty">
              {current.title}
            </h2>
            <AskCard what="article" />
            {article.isPending && <LoadingRows what="the article" rows={4} />}
            {article.isError && (
              <ErrorState what="the article" onRetry={() => void article.refetch()} />
            )}
            {article.data?.paragraphs.map((text, i) => (
              <p
                key={i}
                className="max-w-[62ch] text-read leading-read text-pretty"
                {...highlightable({ src: 'RSS', title: current.title, from: feed.title })}
              >
                <Marked
                  text={text}
                  quotes={state.highlights
                    .filter((h) => h.title === current.title)
                    .map((h) => h.quote)}
                />
              </p>
            ))}
          </>
        ) : (
          feeds.data?.length === 0 && (
            <EmptyState compact>Add a feed by its address to start reading.</EmptyState>
          )
        )}
      </article>
    </main>
  );
}
