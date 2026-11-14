import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const SCREENS = [
  ['today', '/today'],
  ['stream', '/stream'],
  ['stream-reddit', '/stream/rd'],
  ['later', '/later'],
  ['saved', '/saved'],
  ['highlights', '/highlights'],
  ['rss', '/rss'],
  ['digest', '/digest'],
  ['watches', '/watches'],
  ['ask', '/ask'],
  ['connections', '/connections'],
  ['settings', '/settings'],
] as const;

// Both themes, every density, and the narrowest supported width. `axe` marks the two runs that
// also get an accessibility scan; density and width do not change what axe sees.
const VARIANTS = [
  { name: 'dark', theme: 'Dark', density: 'Comfortable', width: 1280, axe: true },
  { name: 'light', theme: 'Light', density: 'Comfortable', width: 1280, axe: true },
  { name: 'dark-compact', theme: 'Dark', density: 'Compact', width: 1280, axe: false },
  { name: 'dark-roomy', theme: 'Dark', density: 'Roomy', width: 1280, axe: false },
  { name: 'dark-920', theme: 'Dark', density: 'Comfortable', width: 920, axe: false },
] as const;

async function open(page: Page, path: string, theme = 'Dark', density = 'Comfortable') {
  await page.addInitScript(
    (saved) => {
      localStorage.setItem('munim.theme', saved);
    },
    JSON.stringify({ theme, accent: 'Amber', density }),
  );
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
}

async function axeFailures(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} | ${n.failureSummary ?? ''}`),
  );
}

for (const [name, path] of SCREENS) {
  for (const v of VARIANTS) {
    test(`${name}: ${v.name}`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: 800 });
      await open(page, path, v.theme, v.density);
      await expect(page).toHaveScreenshot(`${name}-${v.name}.png`);
      if (v.axe) expect(await axeFailures(page)).toEqual([]);
    });
  }
}

const rows = (page: Page) => page.getByRole('table', { name: 'Stream' }).getByRole('row');

test('sidebar navigates and marks the current view', async ({ page }) => {
  await open(page, '/');
  await expect(page).toHaveURL(/\/today$/);
  const saved = page.getByRole('link', { name: /^Saved/ });
  await saved.click();
  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Saved');
  await expect(saved).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveTitle('Saved · Munim');
});

test('an unknown address, or an unknown stream source, goes to Today', async ({ page }) => {
  await open(page, '/no-such-page');
  await expect(page).toHaveURL(/\/today$/);
  await page.goto('/stream/mastodon');
  await expect(page).toHaveURL(/\/today$/);
});

test('a source stream opens a thread from that source, not the last one selected', async ({
  page,
}) => {
  await open(page, '/stream');
  const thread = page.getByRole('complementary', { name: 'Thread' });
  await expect(thread.getByRole('heading')).toHaveText(/^What finally got you/); // Reddit
  await page.getByRole('link', { name: /^Hacker News/ }).click();
  await expect(thread.getByRole('heading')).toHaveText(/^Show HN/);
  await expect(rows(page).filter({ hasText: 'Show HN' })).toHaveAttribute('aria-current', 'true');
  // Going back to the whole stream restores the owner's own selection.
  await page.getByRole('link', { name: /^Stream/ }).click();
  await expect(thread.getByRole('heading')).toHaveText(/^What finally got you/);
});

test('an item already in the read-later queue shows as queued and is not added twice', async ({
  page,
}) => {
  await open(page, '/stream');
  await page.getByRole('button', { name: /^Notes on end-to-end encryption/ }).click();
  const queued = page.getByRole('button', { name: 'Queued' });
  await expect(queued).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: /^Read later/ })).toHaveText(/6$/);
  await queued.click();
  await expect(page.getByRole('link', { name: /^Read later/ })).toHaveText(/5$/);
});

test('stream: source, filter and search narrow the list', async ({ page }) => {
  await open(page, '/stream');
  await expect(rows(page)).toHaveCount(19); // header + 18 items
  await page.getByRole('button', { name: 'Video', exact: true }).click();
  await expect(rows(page)).toHaveCount(5);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Search the stream').fill('sqlite');
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel('Search the stream').fill('zzz');
  await expect(page.getByText('Nothing matches this filter.')).toBeVisible();

  await page.getByRole('link', { name: /^Hacker News/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hacker News');
  await expect(rows(page)).toHaveCount(2); // the search is kept: header + the SQLite thread
});

test('stream: selecting, saving, queueing and replying update the thread and the counts', async ({
  page,
}) => {
  await open(page, '/stream');
  const thread = page.getByRole('complementary', { name: 'Thread' });
  await page.getByRole('button', { name: /^Shipped offline sync/ }).click();
  await expect(thread.getByRole('heading')).toHaveText(/^Shipped offline sync/);

  await expect(page.getByRole('link', { name: /^Saved/ })).toHaveText(/13$/);
  await thread.getByRole('button', { name: 'Save' }).click();
  await expect(thread.getByRole('button', { name: 'Saved' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('link', { name: /^Saved/ })).toHaveText(/14$/);

  await thread.getByRole('button', { name: 'Read later' }).click();
  await expect(page.getByRole('link', { name: /^Read later/ })).toHaveText(/7$/);

  await thread.getByLabel('Reply on X').fill('Per-field merges sound right.');
  await thread.getByRole('button', { name: 'Reply' }).click();
  await expect(thread.getByText('Per-field merges sound right.')).toBeVisible();
  await expect(thread.getByLabel('Reply on X')).toHaveValue('');
  await expect(rows(page).filter({ hasText: 'Shipped offline sync' })).toContainText('38');
});

test('media preview opens from a thumbnail, closes on Escape, and can open the thread', async ({
  page,
}) => {
  await open(page, '/stream');
  const row = rows(page).filter({ hasText: 'Building a home server rack' });
  await row.getByRole('button', { name: 'Preview video' }).click();
  const dialog = page.getByRole('dialog', { name: 'Media preview' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveScreenshot('media-preview-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(row).not.toHaveAttribute('aria-current', 'true');

  await row.getByRole('button', { name: 'Preview video' }).click();
  await dialog.getByRole('button', { name: 'Open thread' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toHaveAttribute('aria-current', 'true');
});

test('media preview: light theme', async ({ page }) => {
  await open(page, '/stream', 'Light');
  await page.getByRole('button', { name: 'Preview video' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveScreenshot('media-preview-light.png');
});

test('ask bar: a question opens Ask with an honest placeholder answer; blank does nothing', async ({
  page,
}) => {
  await open(page, '/today');
  const bar = page.getByRole('search').getByLabel('Ask');
  await bar.press('Enter');
  await expect(page).toHaveURL(/\/today$/);
  await bar.fill('What changed in sync this week?');
  await bar.press('Enter');
  await expect(page).toHaveURL(/\/ask$/);
  await expect(page.getByText('What changed in sync this week?')).toBeVisible();
  await expect(page.getByText(/Answers are not connected yet/)).toBeVisible();
  await expect(bar).toHaveValue('');
});

test('thread question is scoped to the open thread', async ({ page }) => {
  await open(page, '/stream');
  await page.getByLabel('Ask about this thread').fill('Who disagrees?');
  await page.getByLabel('Ask about this thread').press('Enter');
  await expect(page).toHaveURL(/\/ask$/);
  await expect(page.getByRole('button', { name: 'Open thread' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('in open thread')).toBeVisible();
});

test('read later: Done removes the row and updates the totals', async ({ page }) => {
  await open(page, '/later');
  await expect(page.getByText('6 items · 1 h 30 min')).toBeVisible();
  await page.getByRole('button', { name: /^Done: Kiln firing schedules/ }).click();
  await expect(page.getByText('5 items · 48 min')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Read later/ })).toHaveText(/5$/);
});

test('watches: add one, refuse a duplicate, switch one off', async ({ page }) => {
  await open(page, '/watches');
  const table = page.getByRole('table', { name: 'Watches' });
  const field = page.getByLabel('Keyword, person or topic');
  await field.fill('sqlite');
  await field.press('Enter');
  await expect(table.getByRole('row')).toHaveCount(7);
  await field.fill('sqlite');
  await field.press('Enter');
  await expect(table.getByRole('row')).toHaveCount(7);

  await expect(page.getByRole('link', { name: /^Watches/ })).toHaveText(/19$/);
  await page.getByRole('switch', { name: 'Watch rate limits' }).click();
  await expect(page.getByRole('link', { name: /^Watches/ })).toHaveText(/12$/);
  // A switched-off watch is dimmed but must stay readable.
  expect(await axeFailures(page)).toEqual([]);
});

test('rss: choosing a feed and adding one', async ({ page }) => {
  await open(page, '/rss');
  await page.getByRole('button', { name: /^Wire Notes/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(
    'The case for boring sync protocols',
  );
  await page.getByRole('button', { name: /What a retry budget is/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('What a retry budget is');

  await page.getByLabel('Feed URL').fill('https://example.com/feed.xml');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('https://example.com/feed.xml');
  await expect(page.getByText('No articles fetched yet.')).toBeVisible();
});

test('connections: disconnect and reconnect', async ({ page }) => {
  await open(page, '/connections');
  const row = page.getByRole('row').filter({ hasText: 'Reddit' });
  await page.getByRole('button', { name: 'Disconnect Reddit' }).click();
  await expect(row).toContainText('Disconnected');
  await page.getByRole('button', { name: 'Connect Reddit' }).click();
  await expect(row).toContainText('Connected');
  await expect(
    page.getByRole('button', { name: 'Later: Calendar is not available yet' }),
  ).toBeDisabled();
});

test('settings: appearance applies at once and survives a reload', async ({ page }) => {
  // Not open(): its init script would reset the saved theme on reload.
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Light' }).click();
  await page.getByRole('button', { name: 'Blue' }).click();
  await page.getByRole('button', { name: 'Roomy' }).click();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Roomy' })).toHaveAttribute('aria-pressed', 'true');
});
