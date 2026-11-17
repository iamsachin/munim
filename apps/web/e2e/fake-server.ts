import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { Digests } from '../src/api/client';
import { FAKE_ITEMS } from './fake-items';

/*
 * A stand-in for the server's account API, so screen tests stay fast, parallel and repeatable.
 * It follows the real contract (statuses, bodies, three wrong passphrases then a wait); that the
 * real server behaves this way is proven by its own tests and by real-server.spec.ts.
 */

export const GOOD = 'four unrelated words';

export type State = 'setup' | 'signed_out' | 'locked' | 'open';

const HOUR = 3_600_000;

const SAMPLE_PNG = readFileSync(new URL('./sample.png', import.meta.url));

// Stand-ins for sites' own icons: plain coloured shapes, so a picture of a screen shows where
// an icon goes and that it is not Munim's own mark. The real server serves each site's file.
const shape = (fill: string, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="${fill}"/>${inner}</svg>`;
const HN_ICON = shape(
  '#f60',
  '<path d="M4.5 3.5 8 9v4M11.5 3.5 8 9" stroke="#fff" stroke-width="1.8" fill="none"/>',
);
const YT_ICON = shape('#f00', '<path d="M6 4.5v7l6-3.5z" fill="#fff"/>');
const FEED_FILLS = ['#2a7', '#36c', '#a4c', '#c63'];
const feedIcon = (feed: number) =>
  shape(
    FEED_FILLS[feed % FEED_FILLS.length] ?? '#888',
    '<circle cx="8" cy="8" r="3" fill="#fff"/>',
  );
const NO_ICON_FEED = 5;
/** Where an item's icon is asked for, as the server says it: its feed's, or its source's own. */
const iconOf = (source: string, feed?: number | null) =>
  source === 'RSS'
    ? feed
      ? `/api/feeds/${String(feed)}/icon`
      : null
    : source === 'HN' || source === 'YT'
      ? `/api/sources/${source}/icon`
      : null;

const text = (value: string, extra: object = {}) => ({
  text: value,
  marks: [],
  href: null,
  ...extra,
});
const paragraph = (value: string) => ({ type: 'paragraph', spans: [text(value)] });

// A bare address in the sample article, and what the pages it links to are called.
const NOTES = 'https://fieldnotes.example/calendar/working-notes';
const EARLIER = 'https://fieldnotes.example/earlier';
const LINK_TITLES: Record<string, string> = {
  [EARLIER]: 'An earlier note on calendars',
  [NOTES]: 'Working notes: what a week view is for',
};
/** The sample article's links as the server lists them: in the order met, each with its icon. */
const richLinks = (id: number) =>
  Object.entries(LINK_TITLES).map(([href, title], n) => ({
    href,
    title,
    icon: `/api/items/${String(id)}/links/${String(n)}/icon`,
  }));

/** The one article that shows every kind of block, so the screenshots cover them all. */
const RICH_TITLE = 'Designing a calendar that does less';
const richBlocks = (id: number) => [
  {
    type: 'paragraph',
    spans: [
      text('Most calendar views answer a question '),
      text('nobody asked', { marks: ['italic'] }),
      text(': what does the whole month look like. The question people ask is '),
      text('what is next', { marks: ['bold'] }),
      text(', and how long until it starts. '),
      text('An earlier note', { href: EARLIER }),
      text(' has the background. The working notes are at '),
      text(NOTES, { href: NOTES }),
      text(', kept up to date.'),
    ],
  },
  { type: 'heading', level: 2, spans: [text('What it shows')] },
  {
    type: 'list',
    ordered: false,
    items: [[text('Today, and nothing else')], [text('The next thing, with a countdown')]],
  },
  { type: 'image', src: `/api/items/${String(id)}/images/0`, alt: 'The one-day view' },
  { type: 'quote', spans: [text('A calendar is a list with opinions about time.')] },
  { type: 'quote', spans: [text('Take the opinions away and the list is enough.')] },
  { type: 'heading', level: 3, spans: [text('Configuration')] },
  {
    type: 'paragraph',
    spans: [text('Set '), text('view: next', { marks: ['code'] }), text(' and remove the rest:')],
  },
  { type: 'code', text: 'calendar:\n  view: next\n  show_month: false' },
  { type: 'image', src: `/api/items/${String(id)}/images/1`, alt: 'The month view it replaces' },
];

/** The moment every screen test runs at, so ages and dates in screenshots never change. */
export const NOW = Date.parse('2026-11-14T12:00:00Z');

export async function fakeServer(page: Page, start: State = 'open') {
  let state = start;
  let passphrase = GOOD;
  let wrong = 0;
  let minutes: number | null = 15;
  const ago = (ms: number) => new Date(NOW - ms).toISOString();
  // What each provider lists for a key it accepts. Made up, as the design's samples were.
  const offered: Record<string, string[]> = {
    openai: ['gpt-5.5', 'gpt-5.4-mini'],
    anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  };
  const aiKeys: Record<string, { tail: string; ok: boolean; models: string[] } | null> = {
    openai: { tail: '4f2a', ok: true, models: offered.openai ?? [] },
    anthropic: null,
  };
  const none = { provider: null, model: null } as { provider: string | null; model: string | null };
  let aiFeatures = [
    { feature: 'digest', provider: 'openai', model: 'gpt-5.4-mini' },
    { feature: 'ask', provider: 'openai', model: 'gpt-5.5' },
    { feature: 'watch', provider: 'openai', model: 'gpt-5.4-mini' },
  ] as ({ feature: string } & typeof none)[];
  const HN_THREAD = {
    item_id: 1,
    source: 'HN',
    title: 'Ask HN: How do you keep track of long discussions?',
    origin: '208 points',
    icon: iconOf('HN'),
    // The words of the item a citation rests on, if any, and the reply they are in.
    quote: '',
    reply: null as number | null,
    who: '',
  };
  const ARCHIVE_THREAD = {
    item_id: 3,
    source: 'HN',
    title: 'Show HN: A local-first archive for everything you read',
    origin: '612 points',
    icon: iconOf('HN'),
    quote: '',
    reply: null as number | null,
    who: '',
  };
  // What was asked: one worked example, as the design has, about sources this install reads.
  const SAMPLE_ASK = {
    id: 2,
    question: 'What did people say about keeping feeds in sync this week?',
    scope: 'everything',
    follows: null as number | null,
    about: null as typeof HN_THREAD | null,
    status: 'answered',
    answer:
      'Three items touch on it. On Hacker News the consensus is to cache aggressively and poll less often [1]. Wire Notes argues that a sync protocol should be boring, because the clever ones lose data [2]. Wire Talks shows conflict-free sync in a twelve-minute video [3].',
    problem: '',
    cites: [
      HN_THREAD,
      {
        item_id: 2,
        source: 'RSS',
        title: 'The case for boring sync protocols',
        origin: 'Wire Notes',
        icon: iconOf('RSS', NO_ICON_FEED),
        quote: '',
        reply: null,
        who: '',
      },
      {
        item_id: 3,
        source: 'YT',
        title: 'Conflict-free sync explained in 12 minutes',
        origin: 'Wire Talks',
        icon: iconOf('YT'),
        quote: '',
        reply: null,
        who: '',
      },
    ],
    asked_at: ago(2 * 3_600_000),
  };
  // And an earlier one about a single post, whose questions are one conversation.
  const SAMPLE_POST_ASK = {
    ...SAMPLE_ASK,
    id: 1,
    question: 'Summarize this thread',
    scope: 'item',
    about: ARCHIVE_THREAD,
    // Each claim rests on words of a reply in the thread, which its citation shows.
    answer:
      'Readers think it was right to build export before anything else [1].\n\nOne asks how large the index gets for ten thousand articles, and the author says about 400 MB with full text [2].',
    cites: [
      {
        ...ARCHIVE_THREAD,
        quote: 'Export as the first feature is the right call',
        reply: 0,
        who: 'pfk',
      },
      { ...ARCHIVE_THREAD, quote: 'About 400 MB with full text', reply: 2, who: 'author' },
    ],
    asked_at: ago(5 * 3_600_000),
  };
  let asks = [SAMPLE_POST_ASK, SAMPLE_ASK];
  // The latest digests, as the design has them, about what this install reads. Digest is on.
  const named = (...ids: number[]) =>
    ids.flatMap((id) => {
      const item = FAKE_ITEMS.find((one) => one.id === id);
      return item
        ? [
            {
              ...ARCHIVE_THREAD,
              item_id: id,
              source: item.source,
              title: item.title,
              origin: item.origin,
              icon: iconOf(item.source, item.feed),
            },
          ]
        : [];
    });
  const day = (daysAgo: number) => ago(daysAgo * 24 * 3_600_000).slice(0, 10);
  // The design's watches, each with how many items matched it this week, and their matches.
  const watching = (
    id: number,
    name: string,
    kind: string,
    week: number,
    hoursAgo: number | null,
    matched: number[],
  ) => ({
    id,
    name,
    kind,
    on: true,
    on_x: false,
    week,
    last: hoursAgo === null ? null : ago(hoursAgo * 3_600_000),
    problem: '',
    matched,
  });
  let watches = [
    watching(1, 'rate limits', 'keyword', 7, 15, [1]),
    watching(2, '@lena_builds', 'person', 3, 4, [2]),
    watching(3, 'local-first', 'topic', 5, 4, [3]),
    watching(4, 'kiln', 'keyword', 4, 8, [6]),
    watching(5, 'Actual Budget', 'keyword', 0, null, []),
  ];
  const watchesTold = () => ({
    // The server tells more than a watch needs here (which items matched); that is harmless.
    watches,
    matches: watches
      .filter((watch) => watch.on)
      .flatMap((watch) =>
        watch.matched.flatMap((id) => {
          const item = FAKE_ITEMS.find((one) => one.id === id);
          return item
            ? [
                {
                  watch: watch.name,
                  judged: watch.kind === 'topic',
                  item_id: item.id,
                  source: item.source,
                  title: item.title,
                  icon: iconOf(item.source, item.feed),
                  published_at: ago(item.hoursAgo * 3_600_000),
                },
              ]
            : [];
        }),
      )
      .sort((a, b) => b.published_at.localeCompare(a.published_at)),
  });
  // X has no token until one is pasted in.
  let xState = { connected: false, tail: '', synced_at: null as string | null, problem: '' };
  let digestsOn = true;
  let digests = {
    daily: {
      kind: 'daily',
      day: day(0),
      lead: 'Eighteen new items since yesterday morning. The busiest discussion is the Hacker News thread on a local-first reading archive, and two of your feeds published long pieces.',
      sections: [
        {
          head: 'Threads worth opening',
          text: 'The Show HN thread has 388 comments, mostly about storage format and import. The SQLite thread argues over using it as an application file format.',
          cites: named(3, 8),
        },
        {
          head: 'From your feeds',
          text: 'Low Tech Notes published a year in review of running a feed reader. Plain Crypto posted notes on end-to-end encryption for small apps.',
          cites: named(5, 11),
        },
        {
          head: 'Video',
          text: 'Two new videos, about half an hour in total: a home server rack build, and conflict-free sync explained.',
          cites: named(4, 10),
        },
      ],
      problem: '',
      written_at: ago(3 * 3_600_000),
    },
    weekly: {
      kind: 'weekly',
      day: day(0),
      lead: 'Sync and local-first storage came up in four separate sources this week. Most of what came in was from Hacker News and your feeds.',
      sections: [
        {
          head: 'Most discussed',
          text: 'The largest thread was the Show HN archive post, followed by the one on SQLite as an application file format.',
          cites: named(3, 8),
        },
      ],
      problem: '',
      written_at: ago(3 * 3_600_000),
    },
  } as Pick<Digests, 'daily' | 'weekly'>;
  // Spend, with the design's sample figures: prices for the two models in use, a limit, and
  // what each feature used this month and last.
  let aiLimit: number | null = 10;
  let aiPrices = [
    { provider: 'openai', model: 'gpt-5.4-mini', input: 0.15, output: 0.6 },
    { provider: 'openai', model: 'gpt-5.5', input: 2.5, output: 10 },
  ];
  const used = (
    feature: string,
    model: string,
    requests: number,
    tokens_in: number,
    tokens_out: number,
    cost: number | null,
  ) => ({ feature, model, requests, tokens_in, tokens_out, cost });
  let aiUsage = {
    this: {
      rows: [
        used('digest', 'gpt-5.4-mini', 14, 412_300, 18_900, 0.31),
        used('ask', 'gpt-5.5', 37, 1_204_000, 41_200, 3.42),
        used('watch', 'gpt-5.4-mini', 512, 603_000, 5_100, 0.47),
      ],
      cost: 4.2,
    },
    last: {
      rows: [
        used('digest', 'gpt-5.4-mini', 31, 905_000, 41_000, 0.68),
        used('ask', 'gpt-5.5', 64, 2_010_000, 72_400, 5.91),
        used('watch', 'gpt-5.4-mini', 1_340, 1_612_000, 13_400, 1.26),
      ],
      cost: 7.85,
    },
  };
  // The design's sample highlights. Their places are unknown, so each is found by its words,
  // as a highlight is when the text it was made in has changed.
  const sample = (
    quote: string,
    note: string,
    // Null for a passage of an answer, which has an `ask_id` in place of an `item_id`.
    source: string | null,
    title: string,
    origin: string,
    hoursAgo: number,
  ) => ({ quote, note, source, title, origin, created_at: ago(hoursAgo * 3_600_000) });
  let highlights = [
    sample(
      'Recovery is where most schemes quietly give the server a copy of the key.',
      'Check this against our own recovery flow.',
      'RSS',
      'Notes on end-to-end encryption for small apps',
      'Plain Crypto',
      2,
    ),
    sample(
      'Chunking by reply tree beats chunking by length.',
      '',
      'RD',
      'Summarizing 400-comment threads: what actually works',
      'r/LocalLLaMA',
      26,
    ),
    sample(
      'Incremental sync is fast until it is wrong, and when it is wrong it is wrong silently.',
      'Good argument for a weekly full check.',
      'RSS',
      'The case for boring sync protocols',
      'Wire Notes',
      120,
    ),
    sample(
      'Export should be the first feature, not the last.',
      '',
      'X',
      'Small thing: export should be the first feature',
      '@lena_builds',
      121,
    ),
    sample(
      'The airflow section at 9:40 is the part most people skip.',
      'Rewatch before ordering fans.',
      'YT',
      'Building a home server rack from scratch',
      'Bench Hours',
      144,
    ),
  ].map((highlight, n) => ({
    ...highlight,
    id: n + 1,
    item_id: FAKE_ITEMS.find((item) => item.title === highlight.title)?.id ?? null,
    ask_id: null as number | null,
    reply: null as number | null,
    unit: 0,
    start: 0,
    end: 0,
  }));
  // YouTube, connected as the design shows it. `youtubeFresh()` below puts it back to nothing.
  let youtube = {
    configured: true,
    connected: true,
    account: 'Your subscriptions',
    synced_at: ago(9 * 60_000) as string | null,
    problem: '',
    redirect_uri: 'http://localhost:4173/api/sources/youtube/callback',
    redirect_ok: true,
  };
  let hackerNews: { enabled: boolean; synced_at: string | null; problem: string } = {
    enabled: true,
    synced_at: ago(2 * 60_000),
    problem: '',
  };
  let devices = [
    { id: 1, name: 'Chrome on macOS', last_seen: ago(0), current: true },
    { id: 2, name: 'Safari on iPhone', last_seen: ago(2 * HOUR), current: false },
    { id: 3, name: 'Firefox on Linux', last_seen: ago(6 * 24 * HOUR), current: false },
  ];

  // The stream. Saved and queued times follow the published time until a test changes them.
  const items = FAKE_ITEMS.map((item) => ({
    ...item,
    savedAt: item.saved ? ago((item.hoursAgo - 0.5) * HOUR) : null,
    laterAt: item.later ? ago((item.hoursAgo - 0.5) * HOUR) : null,
  }));
  type Stored = (typeof items)[number];
  const row = (item: Stored) => ({
    id: item.id,
    source: item.source,
    title: item.title,
    origin: item.origin,
    sub: item.sub,
    replies: item.replies,
    published_at: ago(item.hoursAgo * HOUR),
    minutes: item.minutes,
    unread: item.unread,
    saved_at: item.savedAt,
    later_at: item.laterAt,
    media: item.media,
    // A YouTube video has its still; the other samples have none, as before.
    thumb: item.source === 'YT' ? `/api/items/${String(item.id)}/images/0` : null,
    icon: iconOf(item.source, item.feed),
  });
  /** A highlight as the server tells it: with the icon of what it was taken from. */
  const told = <T extends { source: string | null; origin: string }>(highlight: T) => ({
    ...highlight,
    icon:
      highlight.source &&
      iconOf(highlight.source, feeds.find((feed) => feed.title === highlight.origin)?.id),
  });
  const newest = (key: 'savedAt' | 'laterAt') => (a: Stored, b: Stored) =>
    (b[key] ?? '').localeCompare(a[key] ?? '');

  // Feeds, as the server lists them: by title.
  const feeds = [
    { id: 1, title: 'Field Notes' },
    { id: 2, title: 'Low Tech Notes' },
    { id: 3, title: 'Plain Crypto' },
    { id: 4, title: 'Release notes' },
    { id: 5, title: 'Wire Notes' },
  ].map((f) => ({
    ...f,
    url: `https://feeds.example/${String(f.id)}.xml`,
    problem: '',
    fetched_at: new Date(NOW - 31 * 60_000).toISOString(),
  }));
  /** Saved, queued or highlighted: such an item stays when its feed is removed. */
  const isKept = (item: (typeof items)[number]) =>
    !!item.savedAt || !!item.laterAt || highlights.some((h) => h.item_id === item.id);
  const listed = () =>
    [...feeds]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((f) => ({
        ...f,
        articles: items.filter((item) => item.feed === f.id).length,
        kept: items.filter((item) => item.feed === f.id && isKept(item)).length,
      }));

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice('/api/'.length);
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    const reply = (status: number, data?: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: data === undefined ? '' : JSON.stringify(data),
      });
    const refuse = (status: number, detail: string) => reply(status, { detail });

    /** Mirrors the server's one passphrase check. Returns true if it answered with a refusal. */
    const refused = async (value: unknown, status = 401) => {
      if (wrong >= 3) {
        await reply(429, { detail: 'Too many attempts.', wait_seconds: 30 });
        return true;
      }
      if (value !== passphrase) {
        wrong += 1;
        await refuse(status, 'That passphrase is not right.');
        return true;
      }
      wrong = 0;
      return false;
    };
    const tooShort = (value: unknown) => typeof value !== 'string' || value.length < 12;

    const call = `${request.method()} ${path}`;
    if (call === 'GET session') return reply(200, { state, no_sign_in: false });
    if (call === 'POST setup') {
      if (state !== 'setup') return refuse(409, 'Munim is already set up.');
      if (tooShort(body.passphrase)) return refuse(422, 'Use at least 12 characters.');
      passphrase = body.passphrase as string;
      state = 'open';
      return reply(200, { state });
    }
    if (call === 'POST sign-in') {
      if (await refused(body.passphrase)) return;
      state = 'open';
      return reply(200, { state });
    }

    // Everything below needs a session.
    if (state === 'setup' || state === 'signed_out') return refuse(401, 'Unauthorized');
    if (call === 'POST sign-out') {
      state = 'signed_out';
      return reply(204);
    }
    if (call === 'POST lock') {
      state = 'locked';
      return reply(204);
    }
    if (call === 'POST unlock') {
      if (await refused(body.passphrase, 403)) return;
      state = 'open';
      return reply(200, { state });
    }

    // Everything below needs the session to be open.
    if (state === 'locked') return refuse(423, 'Locked');
    if (call === 'POST active') return reply(204);
    if (call === 'GET devices') return reply(200, devices);
    if (call === 'GET lock-settings') return reply(200, { minutes });
    if (call === 'GET security') {
      const sealed = Object.values(aiKeys).filter(Boolean).length;
      return reply(200, { master_key: 'file', sealed, sign_ins: youtube.configured ? 1 : 0 });
    }
    if (call === 'PUT lock-settings') {
      minutes = body.minutes as number | null;
      return reply(200, { minutes });
    }
    if (call === 'GET highlights') {
      return reply(
        200,
        [...highlights]
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
          .map(told),
      );
    }
    const [, itemId] = /^POST items\/(\d+)\/highlights$/.exec(call) ?? [];
    if (itemId) {
      const item = items.find((candidate) => candidate.id === Number(itemId));
      if (!item) return refuse(404, 'Not Found');
      const made = {
        id: Math.max(0, ...highlights.map((highlight) => highlight.id)) + 1,
        item_id: item.id,
        ask_id: null,
        source: item.source,
        title: item.title,
        origin: item.origin,
        note: '',
        created_at: ago(0),
        reply: (body.reply ?? null) as number | null,
        unit: Number(body.unit),
        start: Number(body.start),
        end: Number(body.end),
        quote: String(body.quote),
      };
      highlights = [...highlights, made];
      return reply(201, told(made));
    }
    const [, askId] = /^POST asks\/(\d+)\/highlights$/.exec(call) ?? [];
    if (askId) {
      const asked = asks.find((candidate) => candidate.id === Number(askId));
      if (!asked) return refuse(404, 'Not Found');
      // A passage of an answer is told by its question, and has no source.
      const made = {
        id: Math.max(0, ...highlights.map((highlight) => highlight.id)) + 1,
        item_id: null,
        ask_id: asked.id,
        source: null,
        title: asked.question,
        origin: 'Ask',
        note: '',
        created_at: ago(0),
        reply: null,
        unit: Number(body.unit),
        start: Number(body.start),
        end: Number(body.end),
        quote: String(body.quote),
      };
      highlights = [...highlights, made];
      return reply(201, told(made));
    }
    const [, verb, highlightId] = /^(PATCH|DELETE) highlights\/(\d+)$/.exec(call) ?? [];
    if (verb === 'DELETE') {
      highlights = highlights.filter((highlight) => highlight.id !== Number(highlightId));
      return reply(204);
    }
    if (verb === 'PATCH') {
      highlights = highlights.map((highlight) =>
        highlight.id === Number(highlightId)
          ? { ...highlight, note: String(body.note).trim() }
          : highlight,
      );
      return reply(
        200,
        highlights.find((highlight) => highlight.id === Number(highlightId)),
      );
    }
    if (call === 'GET ai/keys') {
      return reply(
        200,
        Object.entries(aiKeys).map(([provider, key]) => ({
          provider,
          tail: key?.tail ?? null,
          ok: key?.ok ?? false,
          models: key?.models ?? [],
        })),
      );
    }
    const [, keyCall, provider = ''] =
      /^(PUT|DELETE) ai\/keys\/(openai|anthropic)$/.exec(call) ?? [];
    if (keyCall === 'DELETE') {
      aiKeys[provider] = null;
      return reply(204);
    }
    if (keyCall === 'PUT') {
      const key = String(body.key).trim();
      if (key.length < 8) return refuse(422, 'That is too short to be an API key.');
      // Stands in for asking the provider: real keys are long.
      const ok = key.length >= 20;
      const saved = { tail: key.slice(-4), ok, models: ok ? (offered[provider] ?? []) : [] };
      aiKeys[provider] = saved;
      return reply(200, { provider, ...saved });
    }
    const spent = aiUsage.this.cost;
    const limitNow = () => ({
      limit: aiLimit,
      spent,
      paused: aiLimit !== null && spent >= aiLimit,
    });
    if (call === 'GET sources/x') return reply(200, xState);
    if (call === 'PUT sources/x') {
      // Only the token's last four characters are ever told.
      xState = {
        connected: true,
        tail: String(body.token).slice(-4),
        synced_at: null,
        problem: '',
      };
      return reply(200, xState);
    }
    if (call === 'DELETE sources/x') {
      xState = { connected: false, tail: '', synced_at: null, problem: '' };
      return reply(200, xState);
    }
    if (call === 'GET watches') return reply(200, watchesTold());
    if (call === 'POST watches') {
      const name = String(body.name).trim();
      if (watches.some((watch) => watch.name.toLowerCase() === name.toLowerCase()))
        return refuse(422, 'There is already a watch for that.');
      const id = Math.max(0, ...watches.map((watch) => watch.id)) + 1;
      watches = [...watches, watching(id, name, String(body.kind), 0, null, [])];
      return reply(201, watchesTold());
    }
    const [, watchVerb, watchId] = /^(PATCH|DELETE) watches\/(\d+)$/.exec(call) ?? [];
    if (watchVerb === 'PATCH') {
      // What is left out stays as it is.
      watches = watches.map((watch) =>
        watch.id === Number(watchId)
          ? {
              ...watch,
              on: body.on == null ? watch.on : Boolean(body.on),
              on_x: body.on_x == null ? watch.on_x : Boolean(body.on_x),
            }
          : watch,
      );
      return reply(200, watchesTold());
    }
    if (watchVerb === 'DELETE') {
      watches = watches.filter((watch) => watch.id !== Number(watchId));
      return reply(200, watchesTold());
    }
    if (call === 'GET digests') return reply(200, { on: digestsOn, ...digests });
    if (call === 'PUT digests/on') {
      digestsOn = Boolean(body.on);
      return reply(200, { on: digestsOn, ...digests });
    }
    if (call === 'GET asks') {
      const told = asks.map((asked) => ({ ...asked }));
      // What is waiting moves on between two looks, as while the worker writes: first part
      // of the answer is there, then all of it with what it cites.
      const start = 'The stand-in server has no model.';
      asks = asks.map((asked) =>
        asked.status !== 'pending'
          ? asked
          : asked.answer === ''
            ? { ...asked, answer: start }
            : {
                ...asked,
                status: 'answered',
                answer: `${start} It was asked: ${asked.question} [1]`,
                cites: [SAMPLE_ASK.cites[0]].filter((cite) => cite !== undefined),
              },
      );
      return reply(200, told);
    }
    if (call === 'POST asks') {
      const model = aiFeatures.find((choice) => choice.feature === 'ask');
      const usable = !!model?.provider && !!aiKeys[model.provider]?.ok;
      // What stops a question being put to a model is its answer at once, as on the server.
      const problem = limitNow().paused
        ? "AI is paused: this month's limit is reached. Raise it under AI, or wait for next month."
        : !usable
          ? 'No model is chosen for Ask. Choose one under AI.'
          : body.scope === 'item' && body.item_id == null
            ? 'Open an item first, then ask about it.'
            : '';
      const item =
        body.scope === 'item' ? items.find((one) => one.id === Number(body.item_id)) : undefined;
      // A follow-up, or one more question about an item that has been asked about before.
      const earlier =
        asks.find((one) => one.id === Number(body.follows)) ??
        (item && asks.findLast((one) => one.about?.item_id === item.id));
      const asked = {
        ...SAMPLE_ASK,
        id: Math.max(0, ...asks.map((one) => one.id)) + 1,
        question: String(body.question),
        // A follow-up is asked of what the question it follows was.
        scope: earlier?.scope ?? String(body.scope),
        follows: earlier?.id ?? null,
        about: earlier
          ? earlier.about
          : item
            ? {
                item_id: item.id,
                source: item.source,
                title: item.title,
                origin: item.origin,
                icon: iconOf(item.source, item.feed),
                quote: '',
                reply: null,
                who: '',
              }
            : null,
        status: problem ? 'failed' : 'pending',
        answer: '',
        problem,
        cites: [] as typeof SAMPLE_ASK.cites,
        asked_at: ago(0),
      };
      asks = [...asks, asked];
      return reply(201, asked);
    }
    if (call === 'GET ai/limit') return reply(200, limitNow());
    if (call === 'PUT ai/limit') {
      aiLimit = body.limit === null ? null : Number(body.limit);
      return reply(200, limitNow());
    }
    if (call === 'GET ai/prices') return reply(200, aiPrices);
    if (call === 'PUT ai/prices') {
      const price = body as (typeof aiPrices)[number];
      const other = (p: typeof price) => p.provider !== price.provider || p.model !== price.model;
      aiPrices = [...aiPrices.filter(other), price];
      return reply(200, price);
    }
    if (call === 'GET ai/usage') {
      const last = new URL(request.url()).searchParams.get('period') === 'last';
      return reply(200, last ? aiUsage.last : aiUsage.this);
    }
    if (call === 'GET ai/features') return reply(200, aiFeatures);
    const [, feature] = /^PUT ai\/features\/(digest|ask|watch)$/.exec(call) ?? [];
    if (feature) {
      const provider = String(body.provider);
      const model = String(body.model);
      if (!aiKeys[provider]?.models.includes(model)) {
        return refuse(422, 'That provider does not list that model for your key.');
      }
      const made = { feature, provider, model };
      aiFeatures = aiFeatures.map((choice) => (choice.feature === feature ? made : choice));
      return reply(200, made);
    }
    if (call === 'GET sources/youtube') return reply(200, youtube);
    if (call === 'PUT sources/youtube/credentials') {
      if (String(body.client_id).length < 10 || String(body.client_secret).length < 10) {
        return refuse(422, 'That is too short to be a client ID and secret.');
      }
      youtube = { ...youtube, configured: true, connected: false, account: '', problem: '' };
      return reply(200, youtube);
    }
    if (call === 'DELETE sources/youtube') {
      youtube = { ...youtube, connected: false, account: '', synced_at: null, problem: '' };
      return reply(200, youtube);
    }
    if (call === 'GET sources/hacker-news') return reply(200, hackerNews);
    if (call === 'PUT sources/hacker-news') {
      hackerNews = { ...hackerNews, enabled: Boolean(body.enabled) };
      return reply(200, hackerNews);
    }
    if (call === 'GET feeds') return reply(200, listed());
    const [, gone] = /^DELETE feeds\/(\d+)$/.exec(call) ?? [];
    if (gone) {
      const id = Number(gone);
      feeds.splice(0, feeds.length, ...feeds.filter((f) => f.id !== id));
      const stay = items.filter((item) => item.feed !== id || isKept(item));
      for (const item of stay) if (item.feed === id) item.feed = null;
      items.splice(0, items.length, ...stay);
      return reply(204);
    }
    if (call === 'POST feeds') {
      const url = String(body.url);
      if (feeds.some((f) => f.url === url)) return refuse(409, 'That feed is already here.');
      if (!url.endsWith('.xml')) return refuse(422, 'That address is not an RSS or Atom feed.');
      const id = 100 + feeds.length;
      feeds.push({
        id,
        title: 'Example Feed',
        url,
        problem: '',
        fetched_at: new Date(NOW).toISOString(),
      });
      items.push({
        ...items[0],
        id: 1000 + items.length,
        source: 'RSS',
        title: 'The first example',
        origin: 'Example Feed',
        sub: '',
        replies: 0,
        hoursAgo: 1,
        minutes: 3,
        unread: true,
        saved: false,
        later: false,
        savedAt: null,
        laterAt: null,
        media: null,
        feed: id,
        paragraphs: ['An article from the new feed.'],
        comments: [],
      });
      return reply(
        201,
        listed().find((f) => f.id === id),
      );
    }
    if (call === 'GET items') {
      const query = new URL(request.url()).searchParams;
      const show = query.get('show') ?? 'all';
      const q = (query.get('q') ?? '').trim().toLowerCase();
      const wanted = items
        .filter(
          (item) =>
            (show !== 'unread' || item.unread) &&
            (show !== 'saved' || item.savedAt) &&
            (show !== 'later' || item.laterAt) &&
            (!query.get('source') || item.source === query.get('source')) &&
            (!query.get('feed') || item.feed === Number(query.get('feed'))) &&
            (!q || (item.title + item.origin).toLowerCase().includes(q)),
        )
        .sort((a, b) => a.hoursAgo - b.hoursAgo);
      if (show === 'saved') wanted.sort(newest('savedAt'));
      if (show === 'later') wanted.sort(newest('laterAt'));
      return reply(200, wanted.map(row));
    }
    if (call === 'GET counts') {
      const sources = Object.fromEntries(
        ['RD', 'X', 'HN', 'YT', 'RSS'].map((code) => [
          code,
          items.filter((item) => item.source === code).length,
        ]),
      );
      return reply(200, {
        stream: items.length,
        later: items.filter((item) => item.laterAt).length,
        saved: items.filter((item) => item.savedAt).length,
        highlights: highlights.length,
        watches: watches.reduce((n, watch) => n + (watch.on ? watch.week : 0), 0),
        sources,
      });
    }
    const [, iconLink] = /^GET items\/\d+\/links\/(\d+)\/icon$/.exec(call) ?? [];
    if (iconLink) {
      const body = feedIcon(Number(iconLink));
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body });
    }
    const [, iconSource] = /^GET sources\/(HN|YT)\/icon$/.exec(call) ?? [];
    const [, iconFeed] = /^GET feeds\/(\d+)\/icon$/.exec(call) ?? [];
    if (iconSource || iconFeed) {
      // One feed stands for a site with no icon: its rows show the RSS mark instead.
      if (iconFeed === String(NO_ICON_FEED)) return refuse(404, 'No icon');
      const body =
        iconSource === 'HN' ? HN_ICON : iconSource === 'YT' ? YT_ICON : feedIcon(Number(iconFeed));
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body });
    }
    if (/^GET items\/\d+\/images\/0$/.test(call)) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: SAMPLE_PNG });
    }
    if (/^GET items\/\d+\/images\/\d+$/.test(call)) return refuse(404, 'Not Found');
    const oneItem = /^(GET|PATCH) items\/(\d+)$/.exec(call);
    if (oneItem) {
      const item = items.find((candidate) => candidate.id === Number(oneItem[2]));
      if (!item) return refuse(404, 'Not Found');
      if (oneItem[1] === 'PATCH') {
        if (typeof body.read === 'boolean') item.unread = !body.read;
        // As on the server: asking for what is already so keeps the first time.
        if (typeof body.saved === 'boolean' && body.saved !== !!item.savedAt) {
          item.savedAt = body.saved ? ago(0) : null;
        }
        if (typeof body.later === 'boolean' && body.later !== !!item.laterAt) {
          item.laterAt = body.later ? ago(0) : null;
        }
        return reply(200, row(item));
      }
      return reply(200, {
        ...row(item),
        url: `https://example.com/items/${String(item.id)}`,
        blocks: [
          // A YouTube video can be played where it is; its still comes through this server.
          ...(item.source === 'YT'
            ? [
                {
                  type: 'video',
                  src: `/api/items/${String(item.id)}/images/0`,
                  alt: item.title,
                  video: 'munimsample',
                },
              ]
            : []),
          ...(item.title === RICH_TITLE ? richBlocks(item.id) : item.paragraphs.map(paragraph)),
        ],
        comments: item.comments.map(({ text: said, ...comment }) => ({
          ...comment,
          blocks: [paragraph(said)],
        })),
        highlights: highlights.filter((highlight) => highlight.item_id === item.id),
        links: item.title === RICH_TITLE ? richLinks(item.id) : [],
        links_pending: false,
        // The real server knows other forms of a word; here each word stands for itself.
        found: (
          (new URL(request.url()).searchParams.get('q') ?? '')
            .toLowerCase()
            .match(/[\p{L}\p{N}]+/gu) ?? []
        ).map((word) => [word]),
      });
    }
    if (call === 'POST delete-all') {
      if (await refused(body.passphrase, 403)) return;
      items.splice(0, items.length);
      feeds.splice(0, feeds.length);
      highlights = [];
      for (const provider of Object.keys(aiKeys)) aiKeys[provider] = null;
      aiFeatures = aiFeatures.map(({ feature }) => ({ feature, ...none }));
      aiPrices = [];
      aiUsage = { this: { rows: [], cost: 0 }, last: { rows: [], cost: 0 } };
      asks = [];
      digests = { daily: null, weekly: null };
      watches = [];
      hackerNews = { enabled: false, synced_at: null, problem: '' };
      youtube = {
        ...youtube,
        configured: false,
        connected: false,
        account: '',
        synced_at: null,
      };
      return reply(204);
    }
    if (call === 'POST passphrase') {
      if (await refused(body.current, 403)) return;
      if (tooShort(body.new)) return refuse(422, 'Use at least 12 characters.');
      passphrase = body.new as string;
      devices = devices.filter((d) => d.current);
      return reply(204);
    }
    const revoke = /^DELETE devices\/(\d+)$/.exec(call);
    if (revoke) {
      devices = devices.filter((d) => d.id !== Number(revoke[1]));
      return reply(204);
    }
    return refuse(404, 'Not found');
  });

  return {
    /** The wait after too many wrong passphrases is over. */
    waitIsOver() {
      wrong = 0;
    },
    /** YouTube as on a new install (nothing set up), or as left by a sign-in that failed. */
    youtubeFresh(problem = '') {
      youtube = {
        ...youtube,
        configured: problem !== '',
        connected: false,
        account: '',
        synced_at: null,
        problem,
      };
    },
    /** The server locks the session, as it does when the owner has been idle too long. */
    lockNow() {
      state = 'locked';
    },
  };
}
