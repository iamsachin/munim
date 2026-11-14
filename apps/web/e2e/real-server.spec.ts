import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';

/*
 * The one test that runs the web app against the real server: a fresh install, through set-up,
 * a second browser, locking, the wrong-passphrase limit, settings and the admin. The server is
 * started on an empty database by playwright.config.ts. One test, because every step builds on
 * the state the one before it left on the server.
 */

const PASSPHRASE = 'four unrelated words';
const NEW_PASSPHRASE = 'a brand new phrase';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

/** Stands in for the wait passing: clears the server's count of wrong passphrases. */
function forgetWrongPassphrases() {
  execSync(
    'MUNIM_DEBUG=1 MUNIM_DB_NAME=munim_e2e uv run python manage.py shell -c ' +
      '"from account.models import Throttle; Throttle.objects.all().delete()"',
    { cwd: '../server', stdio: 'ignore' },
  );
}

const FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Low Tech Notes</title><link>https://lowtech.example/</link>
  <item><title>A year of running my own feed reader</title>
    <link>https://lowtech.example/year</link><guid>year</guid>
    <pubDate>Sat, 14 Nov 2026 06:00:00 GMT</pubDate>
    <description><![CDATA[<p>I started the year with <b>130 feeds</b>.</p>
      <script>document.title = 'hacked'</script><p>By March it was a second inbox.</p>
      <img src="http://SITE/pic.png" alt="The reader on a small screen" onerror="document.title = 'hacked'">
      <img src="http://SITE/missing.png" alt="A chart that is gone">]]></description>
  </item>
  <item><title>Reading in the evening</title>
    <link>https://lowtech.example/evening</link><guid>evening</guid>
    <pubDate>Fri, 13 Nov 2026 20:00:00 GMT</pubDate>
    <description>A short case for reading once a day.</description>
  </item>
</channel></rss>`;

/** A web site on this machine with one feed and one ordinary page, for the server to fetch. */
async function feedSite() {
  const site = createServer((request, response) => {
    if (request.url === '/pic.png') {
      response.writeHead(200, { 'Content-Type': 'image/png' });
      response.end(readFileSync(new URL('./sample.png', import.meta.url)));
    } else if (request.url === '/missing.png') {
      response.writeHead(404);
      response.end();
    } else {
      const isFeed = request.url === '/feed.xml';
      response.writeHead(200, { 'Content-Type': isFeed ? 'application/rss+xml' : 'text/html' });
      response.end(
        isFeed
          ? FEED.replaceAll('SITE', request.headers.host ?? '')
          : '<html><body>Just a page</body></html>',
      );
    }
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const { port } = site.address() as AddressInfo;
  return { url: `http://127.0.0.1:${String(port)}`, close: () => site.close() };
}

const heading = (page: Page, name: string) => page.getByRole('heading', { name });

async function enter(page: Page, passphrase: string, button: string) {
  const field = page.getByLabel('Passphrase');
  await field.fill(passphrase);
  await page.getByRole('button', { name: button }).click();
}

test('a fresh install, from set-up to the admin, against the real server', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);

  await test.step('a fresh install asks for a passphrase and opens', async () => {
    await page.goto('/saved');
    await expect(heading(page, 'Set a passphrase')).toBeVisible();
    await page.getByLabel('Passphrase', { exact: true }).fill(PASSPHRASE);
    await page.getByLabel('Repeat passphrase').fill(PASSPHRASE);
    await page.getByRole('button', { name: 'Create and open Munim' }).click();
    await expect(heading(page, 'Saved')).toBeVisible();
    // The session is a cookie from the server: a reload stays signed in.
    await page.reload();
    await expect(heading(page, 'Saved')).toBeVisible();
  });

  const other = await (await browser.newContext({ userAgent: FIREFOX })).newPage();

  await test.step('a second browser must sign in, and appears in the device list', async () => {
    await other.goto('/');
    await expect(heading(other, 'Sign in')).toBeVisible();
    await enter(other, 'not the passphrase', 'Sign in');
    await expect(other.getByRole('alert')).toHaveText('That passphrase is not right.');
    await enter(other, PASSPHRASE, 'Sign in');
    await expect(heading(other, 'Today')).toBeVisible();

    await page.goto('/settings');
    await expect(page.getByText('This device · Active now')).toBeVisible();
    await expect(page.getByText('Firefox on Linux')).toBeVisible();
  });

  await test.step('revoking the second browser signs it out', async () => {
    await page.getByRole('button', { name: 'Revoke Firefox on Linux' }).click();
    await expect(page.getByText('Firefox on Linux')).toHaveCount(0);
    await other.reload();
    await expect(heading(other, 'Sign in')).toBeVisible();
  });

  await test.step('the lock is held by the server, not the page', async () => {
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(heading(page, 'Locked')).toBeVisible();
    await page.reload();
    await expect(heading(page, 'Locked')).toBeVisible();
  });

  await test.step('three wrong passphrases make even the right one wait', async () => {
    const field = page.getByLabel('Passphrase');
    for (let i = 0; i < 3; i++) {
      await enter(page, `wrong guess ${String(i)}`, 'Unlock');
      await expect(field).toHaveValue('');
      await expect(page.getByRole('alert')).toHaveText('That passphrase is not right.');
    }
    await enter(page, PASSPHRASE, 'Unlock');
    await expect(page.getByRole('alert')).toHaveText(
      /^Too many attempts\. Try again in \d+ seconds\.$/,
    );
    await expect(page.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    // The other browser is made to wait as well: the limit is the server's, not this page's.
    await enter(other, PASSPHRASE, 'Sign in');
    await expect(other.getByRole('alert')).toHaveText(/^Too many attempts/);

    forgetWrongPassphrases();
    await page.reload();
    await enter(page, PASSPHRASE, 'Unlock');
    await expect(heading(page, 'Security and settings')).toBeVisible();
  });

  await test.step('the idle lock setting is kept by the server', async () => {
    const times = page.getByRole('group', { name: 'Lock after' });
    await times.getByRole('button', { name: '1 hour' }).click();
    await expect(page.getByText('After 1 hour without activity')).toBeVisible();
    await page.reload();
    await expect(page.getByText('After 1 hour without activity')).toBeVisible();
    await expect(times.getByRole('button', { name: '1 hour' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  await test.step('changing the passphrase: the old one stops working', async () => {
    await page.getByRole('button', { name: 'Change' }).click();
    await page.getByLabel('Current passphrase').fill('not my passphrase');
    await page.getByLabel('New passphrase', { exact: true }).fill(NEW_PASSPHRASE);
    await page.getByLabel('Repeat new passphrase').fill(NEW_PASSPHRASE);
    await page.getByRole('button', { name: 'Save passphrase' }).click();
    await expect(page.getByRole('alert')).toHaveText('The current passphrase is not right.');
    // A wrong current passphrase must not sign this browser out.
    await expect(heading(page, 'Security and settings')).toBeVisible();

    await page.getByLabel('Current passphrase').fill(PASSPHRASE);
    await page.getByRole('button', { name: 'Save passphrase' }).click();
    await expect(page.getByRole('status')).toHaveText(/Passphrase changed/);
    await expect(page.getByText('This device · Active now')).toBeVisible();

    forgetWrongPassphrases();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(heading(page, 'Sign in')).toBeVisible();
    await enter(page, PASSPHRASE, 'Sign in');
    await expect(page.getByRole('alert')).toHaveText('That passphrase is not right.');
    await enter(page, NEW_PASSPHRASE, 'Sign in');
    await expect(heading(page, 'Security and settings')).toBeVisible();
  });

  await test.step('a feed is fetched by the server, stored, and read as plain text', async () => {
    const site = await feedSite();
    try {
      await page.goto('/rss');
      await expect(page.getByText('No feeds yet. Add one below.')).toBeVisible();
      const field = page.getByLabel('Feed URL');

      await field.fill(`${site.url}/a-page`);
      await page.getByRole('button', { name: 'Add' }).click();
      await expect(page.getByRole('alert')).toHaveText('That address is not an RSS or Atom feed.');

      await field.fill(`${site.url}/feed.xml`);
      await page.getByRole('button', { name: 'Add' }).click();
      await expect(page.getByRole('button', { name: /^Low Tech Notes/ })).toBeVisible();
      await expect(heading(page, 'A year of running my own feed reader')).toBeVisible();
      await expect(page.getByRole('link', { name: /^RSS/ })).toHaveText(/2$/);
      // The feed's HTML arrives as blocks of text: its script and its handlers never run.
      await expect(page.getByText('I started the year with 130 feeds.')).toBeVisible();
      await expect(page.getByText('By March it was a second inbox.')).toBeVisible();
      // Its image comes through Munim's server, never straight from the site that published it.
      const picture = page.getByRole('img', { name: 'The reader on a small screen' });
      await expect(picture).toHaveAttribute('src', /^\/api\/items\/\d+\/images\/0$/);
      await expect
        .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBe(320);
      await expect(
        page.getByText('An image could not be loaded: A chart that is gone'),
      ).toBeVisible();
      await expect(page).toHaveTitle('RSS · Munim');
      await expect(page.getByRole('link', { name: 'Open original' })).toHaveAttribute(
        'href',
        'https://lowtech.example/year',
      );

      await page.getByRole('button', { name: /Reading in the evening/ }).click();
      await expect(page.getByText('A short case for reading once a day.')).toBeVisible();

      // Stored on the server: still there after a reload, with the site that served it gone.
      site.close();
      await page.reload();
      await expect(heading(page, 'A year of running my own feed reader')).toBeVisible();
    } finally {
      site.close();
    }
  });

  await test.step('feed articles are in the stream, unread until opened', async () => {
    await page.goto('/stream');
    const rows = page.getByRole('table', { name: 'Stream' }).getByRole('row');
    await expect(rows).toHaveCount(3); // header + the two articles
    await expect(page.getByRole('link', { name: /^Stream/ })).toHaveText(/2$/);
    const year = page.getByRole('button', { name: /^A year of running my own feed reader/ });
    const evening = page.getByRole('button', { name: /^Reading in the evening/ });
    // "Reading in the evening" was opened on the RSS screen; the other never was.
    await expect(year).toHaveClass(/font-semibold/);
    await expect(evening).not.toHaveClass(/font-semibold/);

    await page.getByRole('button', { name: 'Unread', exact: true }).click();
    await expect(rows).toHaveCount(2);
    // Opened, it is read, but stays on screen until the filter is left.
    await year.click();
    await expect(year).not.toHaveClass(/font-semibold/);
    await expect(rows).toHaveCount(2);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByRole('button', { name: 'Unread', exact: true }).click();
    await expect(page.getByText('Nothing matches this filter.')).toBeVisible();
    // Read state is the server's: still read after a reload.
    await page.reload();
    await expect(year).not.toHaveClass(/font-semibold/);
  });

  await test.step('saving and queueing are kept by the server', async () => {
    const thread = page.getByRole('complementary', { name: 'Thread' });
    // The article itself is read here, as plain text.
    await expect(thread.getByText('I started the year with 130 feeds.')).toBeVisible();
    await expect(thread.getByText('By March it was a second inbox.')).toBeVisible();
    await thread.getByRole('button', { name: 'Save' }).click();
    await expect(thread.getByRole('button', { name: 'Saved' })).toBeVisible();
    await thread.getByRole('button', { name: 'Read later' }).click();
    await expect(thread.getByRole('button', { name: 'Queued' })).toBeVisible();
    await expect(thread.getByText('Feeds have no replies.')).toBeVisible();
    await expect(thread.getByRole('link', { name: 'Open original' })).toHaveAttribute(
      'href',
      'https://lowtech.example/year',
    );

    await page.goto('/saved');
    const saved = page.getByRole('table', { name: 'Saved' }).getByRole('row');
    await expect(saved).toHaveCount(2);
    await expect(saved.nth(1)).toContainText('A year of running my own feed reader');
    await expect(saved.nth(1)).toContainText('Low Tech Notes');
    await expect(saved.nth(1)).toContainText('Full text');

    await page.goto('/later');
    await expect(page.getByText('1 item · 1 min')).toBeVisible();
    await page.getByRole('button', { name: /^Done: A year of running/ }).click();
    await expect(page.getByText('The queue is empty.')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Read later/ })).toHaveText(/0$/);
    await expect(page.getByRole('link', { name: /^Saved/ })).toHaveText(/1$/);

    await page.goto('/today');
    await expect(page.getByText('No replies to you.')).toBeVisible();
  });

  await test.step('the admin opens for a signed-in owner, and sends anyone else to sign in', async () => {
    await page.goto('/admin/');
    await expect(heading(page, 'Site administration')).toBeVisible();

    forgetWrongPassphrases();
    await other.goto('/admin/');
    await expect(heading(other, 'Sign in')).toBeVisible();
    await enter(other, NEW_PASSPHRASE, 'Sign in');
    // Having signed in, it goes on to the admin page that was asked for.
    await expect(heading(other, 'Site administration')).toBeVisible();
  });
});
