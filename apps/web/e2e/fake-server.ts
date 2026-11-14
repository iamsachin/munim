import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
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

const text = (value: string, extra: object = {}) => ({
  text: value,
  marks: [],
  href: null,
  ...extra,
});
const paragraph = (value: string) => ({ type: 'paragraph', spans: [text(value)] });

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
      text('An earlier note', { href: 'https://fieldnotes.example/earlier' }),
      text(' has the background.'),
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
  const aiKeys: Record<string, { tail: string; ok: boolean } | null> = {
    openai: { tail: '4f2a', ok: true },
    anthropic: null,
  };
  // The design's sample highlights. Their places are unknown, so each is found by its words,
  // as a highlight is when the text it was made in has changed.
  const sample = (
    quote: string,
    note: string,
    source: string,
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
    item_id: FAKE_ITEMS.find((item) => item.title === highlight.title)?.id ?? 0,
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
  ].map((f) => ({ ...f, url: `https://feeds.example/${String(f.id)}.xml`, problem: '' }));
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
    if (call === 'GET session') return reply(200, { state });
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
        [...highlights].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id),
      );
    }
    const [, itemId] = /^POST items\/(\d+)\/highlights$/.exec(call) ?? [];
    if (itemId) {
      const item = items.find((candidate) => candidate.id === Number(itemId));
      if (!item) return refuse(404, 'Not Found');
      const made = {
        id: Math.max(0, ...highlights.map((highlight) => highlight.id)) + 1,
        item_id: item.id,
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
      return reply(201, made);
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
      const saved = { tail: key.slice(-4), ok: key.length >= 20 };
      aiKeys[provider] = saved;
      return reply(200, { provider, ...saved });
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
      feeds.push({ id, title: 'Example Feed', url, problem: '' });
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
        ['RD', 'X', 'IG', 'HN', 'YT', 'RSS'].map((code) => [
          code,
          items.filter((item) => item.source === code).length,
        ]),
      );
      return reply(200, {
        stream: items.length,
        later: items.filter((item) => item.laterAt).length,
        saved: items.filter((item) => item.savedAt).length,
        highlights: highlights.length,
        sources,
      });
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
        blocks: item.title === RICH_TITLE ? richBlocks(item.id) : item.paragraphs.map(paragraph),
        comments: item.comments.map(({ text: said, ...comment }) => ({
          ...comment,
          blocks: [paragraph(said)],
        })),
        highlights: highlights.filter((highlight) => highlight.item_id === item.id),
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
