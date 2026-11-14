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
  const listed = () =>
    [...feeds]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((f) => ({ ...f, articles: items.filter((item) => item.feed === f.id).length }));

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
    if (call === 'PUT lock-settings') {
      minutes = body.minutes as number | null;
      return reply(200, { minutes });
    }
    if (call === 'GET feeds') return reply(200, listed());
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
        comments: item.comments,
      });
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
  };
}
