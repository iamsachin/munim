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
