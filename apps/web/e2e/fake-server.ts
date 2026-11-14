import type { Page } from '@playwright/test';

/*
 * A stand-in for the server's account API, so screen tests stay fast, parallel and repeatable.
 * It follows the real contract (statuses, bodies, three wrong passphrases then a wait); that the
 * real server behaves this way is proven by its own tests and by real-server.spec.ts.
 */

export const GOOD = 'four unrelated words';

export type State = 'setup' | 'signed_out' | 'locked' | 'open';

const HOUR = 3_600_000;

export async function fakeServer(page: Page, start: State = 'open') {
  let state = start;
  let passphrase = GOOD;
  let wrong = 0;
  let minutes: number | null = 15;
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  let devices = [
    { id: 1, name: 'Chrome on macOS', last_seen: ago(0), current: true },
    { id: 2, name: 'Safari on iPhone', last_seen: ago(2 * HOUR), current: false },
    { id: 3, name: 'Firefox on Linux', last_seen: ago(6 * 24 * HOUR), current: false },
  ];

  // Feeds, as the server lists them: by title. Ages are relative to now, so the text is stable.
  const article = (id: number, title: string, hours: number, minutes: number, text: string) => ({
    id,
    title,
    url: `https://feeds.example/${String(id)}`,
    published_at: ago(hours * HOUR),
    minutes,
    paragraphs: [text],
  });
  const articles: Record<number, ReturnType<typeof article>[]> = {
    1: [
      article(
        11,
        'Designing a calendar that does less',
        19,
        8,
        'Most calendar views answer a question nobody asked: what does the whole month look like. The question people ask is what is next, and how long until it starts.',
      ),
    ],
    2: [
      article(
        21,
        'A year of running my own feed reader',
        6,
        12,
        'I started the year with 130 feeds and a habit of opening the reader whenever I was bored. By March the unread count had become a second inbox. What fixed it was not a feature. I stopped polling every fifteen minutes, moved to twice a day, and deleted any feed I had skipped ten times in a row.',
      ),
      article(
        22,
        'Reading in the evening, a short essay',
        24,
        5,
        'There is a particular quiet to reading things after they have stopped being new. Most of what felt urgent at noon has resolved itself by nine.',
      ),
    ],
    3: [
      article(
        31,
        'Notes on end-to-end encryption for small apps',
        10,
        9,
        'Before choosing a cipher, write down what the server is allowed to know. For most small apps the honest answer includes sizes, timestamps and who talks to whom. Decide whether that is acceptable, then design recovery, because recovery is where most schemes quietly give the server a copy of the key.',
      ),
    ],
    4: [
      article(
        41,
        'Reader 4.2: faster full-text search',
        24,
        2,
        'This release rebuilds the search index. Existing libraries are migrated in the background on first launch.',
      ),
    ],
    5: [
      article(
        51,
        'The case for boring sync protocols',
        12,
        7,
        'Incremental sync is fast until it is wrong, and when it is wrong it is wrong silently. A periodic full comparison with checksums is slow, predictable, and tells you when something drifted.',
      ),
      article(
        52,
        'What a retry budget is',
        48,
        4,
        'A retry budget caps the share of requests that may be retries. Ten percent is a common starting point.',
      ),
    ],
  };
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
      .map((f) => ({ ...f, articles: articles[f.id]?.length ?? 0 }));

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
      articles[id] = [article(id * 10, 'The first example', 1, 3, 'An article from the new feed.')];
      return reply(
        201,
        listed().find((f) => f.id === id),
      );
    }
    const feedArticles = /^GET feeds\/(\d+)\/articles$/.exec(call);
    if (feedArticles) return reply(200, articles[Number(feedArticles[1])] ?? []);
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
