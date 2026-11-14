import { useState } from 'react';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { Input } from '../ui/Input';
import { EmptyState } from '../ui/States';
import { useTheme } from '../settings';
import { focusId, useKeys } from '../shell/keys';
import { AskCard } from './AskCard';
import { EMPTY } from './copy';
import { FEEDS } from './fixtures';
import { highlightable, Marked } from './Marked';
import { useReader } from './store';
import type { Feed } from './types';

const NOT_YET = 'Available when feeds are connected';

export function Rss() {
  const { state, update } = useReader();
  const [feedIndex, setFeedIndex] = useState(0);
  const [articleIndex, setArticleIndex] = useState(0);
  const [url, setUrl] = useState('');

  const feeds: Feed[] = [...FEEDS, ...state.extraFeeds.map((name) => ({ name, articles: [] }))];
  const feed = feeds[feedIndex] ?? feeds[0];
  const article = feed?.articles[articleIndex];

  const { theme } = useTheme();
  const move = (step: number) => {
    const last = (feed?.articles.length ?? 1) - 1;
    setArticleIndex((i) => Math.min(last, Math.max(0, i + step)));
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
        {feeds.map((f, i) => (
          <button
            key={f.name}
            type="button"
            aria-current={i === feedIndex || undefined}
            onClick={() => {
              setFeedIndex(i);
              setArticleIndex(0);
            }}
            className={cx(
              'flex cursor-pointer justify-between gap-6 rounded-5 px-8 py-dn-3 text-left hover:bg-card',
              i === feedIndex ? 'bg-card text-ink' : 'text-mute',
            )}
          >
            <span className="truncate">{f.name}</span>
            <span className="font-mono text-meta text-mute">{f.articles.length || ''}</span>
          </button>
        ))}
        <form
          className="mt-auto flex gap-6 px-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = url.trim();
            if (!name) return;
            setUrl('');
            setFeedIndex(feeds.length);
            setArticleIndex(0);
            update((s) => ({ extraFeeds: [...s.extraFeeds, name] }));
          }}
        >
          <Input
            size="md"
            className="flex-1"
            aria-label="Feed URL"
            placeholder="Feed URL"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
          />
          <Button type="submit" size="stretch">
            Add
          </Button>
        </form>
      </div>

      <div className="min-h-0 overflow-y-auto border-r border-line">
        {feed?.articles.map((a, i) => (
          <button
            key={a.title}
            type="button"
            aria-current={i === articleIndex || undefined}
            onClick={() => {
              setArticleIndex(i);
            }}
            className={cx(
              'block w-full cursor-pointer border-b border-rule px-16 py-dn-6 text-left hover:bg-card',
              i === articleIndex && 'row-bar bg-card',
            )}
          >
            <span className="block font-mono text-code text-mute">{a.meta}</span>
            <span className={cx('block', i === 0 && 'font-semibold')}>{a.title}</span>
          </button>
        ))}
      </div>

      <article className="flex min-h-0 flex-col gap-12 overflow-y-auto bg-panel px-24 py-20">
        <div className="flex items-center gap-8 font-mono text-meta text-mute">
          <span className="font-medium text-a2">RSS</span>
          {/* Truncates at narrow widths so the buttons keep their place. */}
          <span className="min-w-0 truncate">
            {article ? `${feed.name} · ${article.meta}` : 'New feed'}
          </span>
          {/* Not wired in the mock, so disabled with the reason rather than left looking live. */}
          <Button className="ml-auto font-sans" disabled title={NOT_YET}>
            Save
          </Button>
          <Button className="font-sans" disabled title={NOT_YET}>
            Open original
          </Button>
        </div>
        <h2 className="text-headline leading-headline font-semibold text-pretty">
          {article?.title ?? feed?.name}
        </h2>
        <AskCard what="article" />
        {article ? (
          <p
            className="max-w-[62ch] text-read leading-read text-pretty"
            {...highlightable({ src: 'RSS', title: article.title, from: feed.name })}
          >
            <Marked
              text={article.body}
              quotes={state.highlights.filter((h) => h.title === article.title).map((h) => h.quote)}
            />
          </p>
        ) : (
          <EmptyState compact>{EMPTY.articles}</EmptyState>
        )}
      </article>
    </main>
  );
}
