import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fakeServer, GOOD, NOW, type State } from './fake-server';

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
  ['ai', '/ai'],
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

/**
 * Opens the app at `path` with a stand-in server in the given state. Returns the stand-in.
 * The page's clock reads one fixed moment, so dates and ages never change between runs; pass
 * `fixClock: false` for a test that drives the clock itself.
 */
async function open(
  page: Page,
  path: string,
  theme = 'Dark',
  density = 'Comfortable',
  state: State = 'open',
  fixClock = true,
) {
  const server = await fakeServer(page, state);
  if (fixClock) await page.clock.setFixedTime(NOW);
  await page.addInitScript(
    (saved) => {
      localStorage.setItem('munim.theme', saved);
    },
    JSON.stringify({ theme, accent: 'Amber', density }),
  );
  await page.goto(path);
  // The app draws nothing until the server has said where this browser stands.
  await page.locator('#root > *').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  return server;
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

// What is shown before the app is open depends on the server, not the address.
for (const [name, state] of [
  ['setup', 'setup'],
  ['sign-in', 'signed_out'],
] as const) {
  for (const v of VARIANTS) {
    test(`${name}: ${v.name}`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: 800 });
      await open(page, '/', v.theme, v.density, state);
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

test('an item already in the read-later queue shows as queued, and can be taken out', async ({
  page,
}) => {
  await open(page, '/stream');
  await page.getByRole('button', { name: /^Notes on end-to-end encryption/ }).click();
  const queued = page.getByRole('button', { name: 'Queued' });
  await expect(queued).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: /^Read later/ })).toHaveText(/5$/);
  await queued.click();
  await expect(page.getByRole('button', { name: 'Read later' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('link', { name: /^Read later/ })).toHaveText(/4$/);
});

test('stream: source, filter and search narrow the list', async ({ page }) => {
  await open(page, '/stream');
  await expect(rows(page)).toHaveCount(23); // header + 22 items
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

test('stream: selecting, saving and queueing update the thread and the counts', async ({
  page,
}) => {
  await open(page, '/stream');
  const thread = page.getByRole('complementary', { name: 'Thread' });
  await page.getByRole('button', { name: /^Shipped offline sync/ }).click();
  await expect(thread.getByRole('heading')).toHaveText(/^Shipped offline sync/);

  await expect(page.getByRole('link', { name: /^Saved/ })).toHaveText(/8$/);
  await thread.getByRole('button', { name: 'Save' }).click();
  await expect(thread.getByRole('button', { name: 'Saved' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('link', { name: /^Saved/ })).toHaveText(/9$/);

  await thread.getByRole('button', { name: 'Read later' }).click();
  await expect(thread.getByRole('button', { name: 'Queued' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Read later/ })).toHaveText(/6$/);
});

test('stream: opening an item marks it read; the default row is left alone', async ({ page }) => {
  await open(page, '/stream');
  const row = (title: RegExp) => page.getByRole('button', { name: title });
  // The first row is on screen by default but was not opened, so it is still unread.
  await expect(row(/^What finally got you/)).toHaveClass(/font-semibold/);
  await expect(row(/^Shipped offline sync/)).toHaveClass(/font-semibold/);
  await row(/^Shipped offline sync/).click();
  await expect(row(/^Shipped offline sync/)).not.toHaveClass(/font-semibold/);

  await page.getByRole('button', { name: 'Unread', exact: true }).click();
  await expect(rows(page)).toHaveCount(6); // header + the five still unread
  // Opening the Unread list does not read its way down it.
  await expect(row(/^What finally got you/)).toHaveClass(/font-semibold/);

  // An item opened here is read, but stays in the list and in the pane while the filter is on.
  await row(/^Show HN: A local-first/).click();
  await expect(row(/^Show HN: A local-first/)).not.toHaveClass(/font-semibold/);
  await expect(rows(page)).toHaveCount(6);
  await expect(page.getByRole('complementary', { name: 'Thread' }).getByRole('heading')).toHaveText(
    /^Show HN/,
  );

  // Leaving the filter and coming back shows what is unread now.
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Unread', exact: true }).click();
  await expect(rows(page)).toHaveCount(5);
  await expect(row(/^Show HN: A local-first/)).toHaveCount(0);
});

test('stream: an empty stream, a failed one, and a failed item each say so', async ({ page }) => {
  await fakeServer(page);
  // The rows show ages, so the picture must not depend on when the test runs.
  await page.clock.setFixedTime(NOW);
  await page.route('**/api/items?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/stream');
  await expect(
    page.getByText('Nothing here yet. Connect a source and its items appear here.'),
  ).toBeVisible();
  await expect(page).toHaveScreenshot('stream-empty-dark.png');
  // A source Munim cannot read says why, instead of asking for a connection that cannot be made.
  await page.getByRole('link', { name: /^Reddit/ }).click();
  await expect(
    page.getByText('Not available yet. Reddit must approve an app before it may read anything.'),
  ).toBeVisible();
  await page.getByRole('link', { name: /^Stream/ }).click();

  await page.unroute('**/api/items?*');
  await page.route('**/api/items?*', (route) => route.fulfill({ status: 500, body: '' }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Could not load the stream.');
  await page.unroute('**/api/items?*');
  await page.route('**/api/items/*', (route) => route.fulfill({ status: 500, body: '' }));
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(rows(page)).toHaveCount(23);
  await expect(page.getByRole('alert')).toContainText('Could not load this item.');
  await expect(page).toHaveScreenshot('stream-item-failed-dark.png');
  await page.unroute('**/api/items/*');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('complementary', { name: 'Thread' }).getByRole('heading')).toHaveText(
    /^What finally got you/,
  );
});

test('stream: a feed article is read in the thread pane, and can be highlighted there', async ({
  page,
}) => {
  await open(page, '/stream');
  const thread = page.getByRole('complementary', { name: 'Thread' });
  await page.getByRole('button', { name: /^A year of running my own feed reader/ }).click();
  await expect(thread.getByText('I started the year with 130 feeds')).toBeVisible();
  await expect(page).toHaveScreenshot('stream-article-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  await selectText(page, 'I stopped polling every fifteen minutes');
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await expect(thread.locator('mark', { hasText: 'I stopped polling' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Highlights/ })).toHaveText(/6$/);

  // A thread, which has no text of its own, shows its replies as before.
  await page.getByRole('button', { name: /^What finally got you/ }).click();
  await expect(thread.getByText('Saving was the thing.')).toBeVisible();
});

test('replies: no source can be replied to yet, and each says why', async ({ page }) => {
  await open(page, '/stream');
  const thread = page.getByRole('complementary', { name: 'Thread' });
  await expect(thread.getByText('Replying on Reddit is not available yet.')).toBeVisible();
  await expect(thread.getByRole('link', { name: 'Open original' })).toHaveAttribute(
    'href',
    /^https:\/\/example\.com\/items\/\d+$/,
  );

  await page.getByRole('button', { name: /^Show HN/ }).click();
  await expect(thread.getByText('Hacker News has no official way to reply')).toBeVisible();
  await expect(thread.getByRole('button', { name: 'Reply' })).toHaveCount(0);
  await expect(page).toHaveScreenshot('stream-no-reply-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  await page.getByRole('button', { name: /^A year of running my own feed reader/ }).click();
  await expect(thread.getByText('Feeds have no replies.')).toBeVisible();
  // An article has no replies to wait for, so it does not say "none yet".
  await expect(thread.getByText('No replies yet.')).toHaveCount(0);
  await page.getByRole('button', { name: /^Backups: what is your restore/ }).click();
  await expect(thread.getByText('No replies yet.')).toBeVisible();
});

test('saved: an item saved in the stream is listed first, an unsaved one is not listed', async ({
  page,
}) => {
  await open(page, '/stream');
  await rows(page)
    .filter({ hasText: 'Building a home server rack' })
    .getByRole('button', { name: 'Save' })
    .click();
  await rows(page)
    .filter({ hasText: 'Show HN: A local-first archive' })
    .getByRole('button', { name: 'Save' })
    .click();
  await page.getByRole('link', { name: /^Saved/ }).click();
  const saved = page.getByRole('table', { name: 'Saved' });
  await expect(saved.getByRole('row')).toHaveCount(9); // header + 8: one added, one removed
  await expect(saved.getByRole('row').nth(1)).toContainText('Building a home server rack');
  await expect(saved.getByRole('row').nth(1)).toContainText('Video');
  await expect(saved.getByText('Show HN: A local-first archive')).toHaveCount(0);

  await page.getByRole('button', { name: 'Articles' }).click();
  await expect(saved.getByRole('row')).toHaveCount(3); // header + the two saved feed articles
  await expect(saved.getByRole('row').nth(1)).toContainText('Full text');
});

test('stream: an article opened from a search shows where the search matched', async ({ page }) => {
  await open(page, '/stream');
  await page.getByPlaceholder('Search the stream').fill('calendar');
  await expect(rows(page)).toHaveCount(2);
  const pane = page.getByRole('complementary', { name: 'Thread' });
  await expect(pane.getByRole('heading', { level: 2 })).toHaveText(
    'Designing a calendar that does less',
  );

  // Every "calendar" in the text is marked, the first is in view, and each has a tick.
  const marks = pane.locator('mark[data-found]');
  await expect(marks).toHaveCount(2);
  await expect(marks.first()).toBeInViewport();
  await expect(pane.getByRole('status')).toHaveText('Match 1 of 2');
  await expect(pane.locator('.found-tick')).toHaveCount(2);
  await expect(page).toHaveScreenshot('stream-found-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  // The buttons step through them, round and round; a tick goes straight to its match.
  await pane.getByRole('button', { name: 'Next match' }).click();
  await expect(pane.getByRole('status')).toHaveText('Match 2 of 2');
  await expect(marks.nth(1)).toBeInViewport();
  await pane.getByRole('button', { name: 'Next match' }).click();
  await expect(pane.getByRole('status')).toHaveText('Match 1 of 2');
  await pane.locator('.found-tick').nth(1).click();
  await expect(pane.getByRole('status')).toHaveText('Match 2 of 2');
  await pane.getByRole('button', { name: 'Previous match' }).click();
  await expect(pane.getByRole('status')).toHaveText('Match 1 of 2');

  // Words searched for together are marked only where they are together.
  await page.getByPlaceholder('Search the stream').fill('a calendar');
  await expect(marks).toHaveCount(1);
  await expect(marks).toHaveText('A calendar');
  await expect(pane.getByRole('status')).toHaveText('Match 1 of 1');

  // With the search cleared, nothing is marked and the stepper is gone.
  await page.getByPlaceholder('Search the stream').fill('');
  await expect(marks).toHaveCount(0);
  await expect(pane.getByRole('status')).toHaveCount(0);
});

test('stream: match marks hold their contrast in the light theme', async ({ page }) => {
  await open(page, '/stream', 'Light');
  await page.getByPlaceholder('Search the stream').fill('calendar');
  const pane = page.getByRole('complementary', { name: 'Thread' });
  await expect(pane.locator('mark[data-found]')).toHaveCount(2);
  await expect(page).toHaveScreenshot('stream-found-light.png');
  expect(await axeFailures(page)).toEqual([]);
});

test('media preview opens from a thumbnail, closes on Escape, and can open the thread', async ({
  page,
}) => {
  await open(page, '/stream');
  const row = rows(page).filter({ hasText: 'Building a home server rack' });
  await row.getByRole('button', { name: 'Preview video' }).click();
  const dialog = page.getByRole('dialog', { name: 'Media preview' });
  await expect(dialog).toBeVisible();
  // The video's still, with a way to play it.
  const play = dialog.getByRole('button', {
    name: 'Play: Building a home server rack from scratch',
  });
  await expect
    .poll(() => play.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(320);
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
  const still = page
    .getByRole('dialog')
    .getByRole('button', { name: /^Play: / })
    .locator('img');
  await expect.poll(() => still.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320);
  await expect(page).toHaveScreenshot('media-preview-light.png');
  expect(await axeFailures(page)).toEqual([]);
});

test("video: nothing reaches YouTube until Play is pressed, then it plays in YouTube's player", async ({
  page,
}) => {
  // Stands in for YouTube, and notes everything that is asked of it.
  const asked: string[] = [];
  await page.route(/youtube/, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>player</title>' });
  });
  const player = 'https://www.youtube-nocookie.com/embed/munimsample?autoplay=1&rel=0';

  // In the thread pane: the still is there, and YouTube has heard nothing.
  await open(page, '/stream');
  await page.getByRole('button', { name: /^Building a home server rack from scratch/ }).click();
  const pane = page.getByRole('complementary', { name: 'Thread' });
  const play = pane.getByRole('button', { name: 'Play: Building a home server rack from scratch' });
  await expect(play).toBeVisible();
  await expect(page).toHaveScreenshot('stream-video-dark.png');
  expect(await axeFailures(page)).toEqual([]);
  expect(asked).toEqual([]);

  await play.click();
  const frame = pane.locator('iframe');
  await expect(frame).toHaveAttribute('src', player);
  await expect(frame).toHaveAttribute('title', 'Building a home server rack from scratch');
  await expect(play).toHaveCount(0);
  await expect.poll(() => asked).toEqual([player]);

  // The same in the preview that opens from a row.
  asked.length = 0;
  const row = rows(page).filter({ hasText: 'Conflict-free sync explained in 12 minutes' });
  await row.getByRole('button', { name: 'Preview video' }).click();
  const dialog = page.getByRole('dialog', { name: 'Media preview' });
  await expect(dialog.getByRole('button', { name: /^Play: Conflict-free sync/ })).toBeVisible();
  expect(asked).toEqual([]);
  await dialog.getByRole('button', { name: /^Play: Conflict-free sync/ }).click();
  await expect(dialog.locator('iframe')).toHaveAttribute('src', player);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

for (const theme of ['Dark', 'Light'] as const) {
  test(`youtube: the page opens as cards of stills (${theme})`, async ({ page }) => {
    await open(page, '/stream/yt', theme);
    const cards = page.getByRole('list', { name: 'Stream' }).getByRole('listitem');
    await expect(cards).toHaveCount(3);
    const first = cards.first();
    // A card has the video's still, its length on it, its title, and who posted it when.
    await expect
      .poll(() => first.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(320);
    await expect(first).toContainText('18:24');
    await expect(first).toContainText('Building a home server rack from scratch');
    await expect(first).toContainText('Bench Hours · 5h');
    await expect(page.getByRole('table', { name: 'Stream' })).toHaveCount(0);
    await expect(page).toHaveScreenshot(`youtube-cards-${theme.toLowerCase()}.png`);
    expect(await axeFailures(page)).toEqual([]);
  });
}

test('youtube: a card opens its video large and playing; the list is one press away', async ({
  page,
}) => {
  // Stands in for YouTube, and notes everything that is asked of it.
  const asked: string[] = [];
  await page.route(/youtube/, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>player</title>' });
  });
  await open(page, '/stream/yt');
  const cards = page.getByRole('list', { name: 'Stream' }).getByRole('listitem');
  const pane = page.getByRole('complementary', { name: 'Thread' });
  const dialog = page.getByRole('dialog', { name: 'Media preview' });
  // Looking at the cards asks nothing of YouTube.
  await expect(cards).toHaveCount(3);
  expect(asked).toEqual([]);

  // Choosing a card is choosing to watch: it opens large, already playing.
  await cards
    .nth(1)
    .getByRole('button', { name: /Conflict-free sync explained in 12 minutes/ })
    .click();
  await expect(dialog.locator('iframe')).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/munimsample?autoplay=1&rel=0',
  );
  await expect(dialog).toContainText('Conflict-free sync explained in 12 minutes');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // It is also the one in the thread pane now, with its description.
  await expect(pane.getByRole('heading', { level: 2 })).toHaveText(
    'Conflict-free sync explained in 12 minutes',
  );
  // j and k move through the cards as they do through rows, without opening anything.
  await page.keyboard.press('j');
  await expect(pane.getByRole('heading', { level: 2 })).toHaveText(
    'Kiln firing schedules, a full walkthrough',
  );
  await expect(dialog).toBeHidden();
  // Saving works from a card.
  await cards.first().getByRole('button', { name: 'Save' }).click();
  await expect(cards.first().getByRole('button', { name: 'Save' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // The list, as on every other source's page; and it is still the list after a reload.
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'List' }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect(page.getByRole('list', { name: 'Stream' })).toHaveCount(0);
  await page.reload();
  await expect(rows(page)).toHaveCount(4);
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Cards' }).click();
  await expect(cards).toHaveCount(3);

  // Other sources have no such switch: their pages are lists.
  await page.goto('/stream/rd');
  await expect(page.getByRole('group', { name: 'View' })).toHaveCount(0);
  await expect(rows(page)).toHaveCount(5);
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

test('thread question is scoped to the open item', async ({ page }) => {
  await open(page, '/stream');
  await page.getByLabel('Ask about this thread').fill('Who disagrees?');
  await page.getByLabel('Ask about this thread').press('Enter');
  await expect(page).toHaveURL(/\/ask$/);
  await expect(page.getByRole('button', { name: 'Open item' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('in open item')).toBeVisible();
});

test('nothing is summarised automatically: a summary is one press away, as an Ask', async ({
  page,
}) => {
  await open(page, '/stream');
  const thread = page.getByRole('complementary', { name: 'Thread' });
  await expect(thread.getByText('Most replies name saving and search')).toHaveCount(0);
  await thread.getByRole('button', { name: 'Summarize this thread' }).click();
  await expect(page).toHaveURL(/\/ask$/);
  await expect(page.getByText('Summarize this thread')).toBeVisible();
  await expect(page.getByText('From open item')).toBeVisible();

  await page.getByRole('link', { name: /^RSS/ }).click();
  await page.getByRole('button', { name: 'Summarize this article' }).click();
  await expect(page.getByText('Summarize this article')).toBeVisible();
});

test('ai: a new key makes that provider selectable; removing a key switches its features off', async ({
  page,
}) => {
  await open(page, '/ai');
  const askModel = page.getByLabel('Model for Ask');
  await expect(askModel).toHaveValue('openai/gpt-5.5');

  // A choice the server refuses is not made, and the row says why.
  await page.route('**/api/ai/features/watch', (route) =>
    route.fulfill({
      status: 422,
      json: { detail: 'OpenAI does not list that model for your key.' },
    }),
  );
  const watchModel = page.getByLabel('Model for Watch matching');
  await watchModel.selectOption('gpt-5.5');
  await expect(page.getByRole('alert')).toHaveText('OpenAI does not list that model for your key.');
  await expect(watchModel).toHaveValue('openai/gpt-5.4-mini');
  await page.unroute('**/api/ai/features/watch');

  await expect(askModel.locator('option', { hasText: 'claude-sonnet-5-5' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add key for Anthropic' }).click();
  const field = page.getByLabel('Anthropic API key');
  await expect(field).toBeFocused();
  await field.fill('sk-ant-0123456789abcdefWXYZ');
  await field.press('Enter');
  const anthropic = page.getByRole('row').filter({ hasText: 'Anthropic' });
  await expect(anthropic).toContainText('Ends in WXYZ');
  await expect(anthropic).toContainText('Connected');
  await expect(page.getByText('sk-ant-0123456789abcdefWXYZ')).toHaveCount(0);
  await askModel.selectOption('claude-sonnet-5-5');
  await expect(askModel).toHaveValue('anthropic/claude-sonnet-5-5');

  await page.getByRole('button', { name: 'Remove key for OpenAI' }).click();
  await expect(page.getByLabel('Model for Digest')).toHaveValue('');
  await expect(page.getByText('No model chosen, so this is off.')).toHaveCount(2);
  await expect(askModel).toHaveValue('anthropic/claude-sonnet-5-5');
  // The choice is the server's: it is still there when the page is loaded again.
  await page.reload();
  await expect(page.getByLabel('Model for Ask')).toHaveValue('anthropic/claude-sonnet-5-5');
  expect(await axeFailures(page)).toEqual([]);
});

test('ai: a rejected key is reported and Cancel leaves things alone', async ({ page }) => {
  await open(page, '/ai');
  await page.getByRole('button', { name: 'Add key for Anthropic' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Anthropic' })).toContainText('No key');

  await page.getByRole('button', { name: 'Replace key for OpenAI' }).click();
  // Too short to be a key at all: it is not saved, and the row says why.
  await page.getByLabel('OpenAI API key').fill('short');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toHaveText('That is too short to be an API key.');
  // Long enough to ask the provider, which rejects it: it is saved, marked as rejected.
  await page.getByLabel('OpenAI API key').fill('sk-too-short');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'OpenAI' })).toContainText('Key rejected');
  await expect(page.getByLabel('Model for Ask')).toBeDisabled();
  await expect(page).toHaveScreenshot('ai-no-working-key-dark.png');
  expect(await axeFailures(page)).toEqual([]);
});

test('ai: if the provider cannot be asked, the key is not saved and the row says so', async ({
  page,
}) => {
  await open(page, '/ai');
  await page.route('**/api/ai/keys/anthropic', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        detail: 'Anthropic could not be reached, so the key was not checked.',
      }),
    }),
  );
  await page.getByRole('button', { name: 'Add key for Anthropic' }).click();
  await page.getByLabel('Anthropic API key').fill('sk-ant-0123456789abcdefWXYZ');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Anthropic could not be reached, so the key was not checked.',
  );
  await expect(page.getByLabel('Anthropic API key')).toBeVisible();
  expect(await axeFailures(page)).toEqual([]);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Anthropic' })).toContainText('No key');

  // If the keys cannot be read at all, the table says so.
  await page.route('**/api/ai/keys', (route) => route.fulfill({ status: 500, body: '' }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Could not load the providers.');
});

test('ai: a change made after the session has locked brings up the lock screen', async ({
  page,
}) => {
  const server = await open(page, '/ai');
  await page.getByRole('button', { name: 'Add key for Anthropic' }).click();
  await page.getByLabel('Anthropic API key').fill('sk-ant-0123456789abcdefWXYZ');
  server.lockNow();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Locked' })).toBeVisible();

  // Unlocked, the screen does not blame the key: nothing was wrong with it.
  await page.getByLabel('Passphrase').fill(GOOD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Locked' })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Anthropic' })).toContainText('Connected');
});

test('ai: reaching the monthly limit pauses AI and says so; no limit never pauses', async ({
  page,
}) => {
  await open(page, '/ai');
  await expect(page.getByText('$4.20 of $10.00 this month')).toBeVisible();
  const limit = page.getByLabel('Monthly limit in dollars');
  await limit.fill('4');
  await expect(page.getByRole('status')).toContainText('AI is paused');
  await expect(page).toHaveScreenshot('ai-paused-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  const bar = page.getByRole('search').getByLabel('Ask');
  await bar.fill('Anything new?');
  await bar.press('Enter');
  await expect(page.getByText(/AI is paused: this month's limit is reached/)).toBeVisible();

  await page.getByRole('link', { name: 'AI', exact: true }).click();
  await page.getByRole('switch', { name: 'Monthly limit' }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByLabel('Monthly limit in dollars')).toBeDisabled();
  await expect(page.getByText('$4.20 this month')).toBeVisible();
});

test('ai: usage can be viewed for last month', async ({ page }) => {
  await open(page, '/ai');
  const usage = page.getByRole('table', { name: 'Usage' });
  await expect(usage.getByRole('row').last()).toContainText('$4.20');
  await page.getByRole('button', { name: 'Last month' }).click();
  await expect(usage.getByRole('row').last()).toContainText('$7.85');
});

test('read later: Done removes the row and updates the totals', async ({ page }) => {
  await open(page, '/later');
  await expect(page.getByText('5 items · 1 h 22 min')).toBeVisible();
  await page.getByRole('button', { name: /^Done: Kiln firing schedules/ }).click();
  await expect(page.getByText('4 items · 40 min')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Read later/ })).toHaveText(/4$/);
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

test('rss: choosing a feed and an article', async ({ page }) => {
  await open(page, '/rss');
  // Feeds are listed by title, and the first one is open.
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(
    'Designing a calendar that does less',
  );
  await expect(page.getByRole('link', { name: /^RSS/ })).toHaveText(/7$/);

  // The article is drawn from blocks. A link in it leaves Munim in a new tab, telling the site
  // nothing about where the reader came from.
  const link = page.getByRole('link', { name: 'An earlier note' });
  await expect(link).toHaveAttribute('href', 'https://fieldnotes.example/earlier');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noreferrer');
  // An image that cannot be had says so where it would have been.
  const missing = page.getByText('An image could not be loaded: The month view it replaces');
  await missing.scrollIntoViewIfNeeded();
  await expect(page).toHaveScreenshot('rss-article-end-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  await page.getByRole('button', { name: /^Wire Notes/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(
    'The case for boring sync protocols',
  );
  await page.getByRole('button', { name: /What a retry budget is/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('What a retry budget is');
  await expect(page.getByText('Wire Notes · 2d · 4 min')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open original' })).toHaveAttribute(
    'href',
    /^https:\/\/example\.com\/items\/\d+$/,
  );
});

test('rss: adding a feed opens it; an address that is not a feed says so', async ({ page }) => {
  await open(page, '/rss');
  const field = page.getByLabel('Feed URL');
  await field.fill('https://example.com/a-page');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('alert')).toHaveText('That address is not an RSS or Atom feed.');
  await expect(page).toHaveScreenshot('rss-add-problem-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  await field.fill('https://example.com/feed.xml');
  await expect(page.getByRole('alert')).toBeHidden();
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('The first example');
  await expect(page.getByRole('button', { name: /^Example Feed/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(field).toHaveValue('');
  await expect(page.getByRole('link', { name: /^RSS/ })).toHaveText(/8$/);

  await field.fill('https://example.com/feed.xml');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('alert')).toHaveText('That feed is already here.');
  // The complaint goes away when another feed is chosen.
  await page.getByRole('button', { name: /^Wire Notes/ }).click();
  await expect(page.getByRole('alert')).toBeHidden();
});

for (const theme of ['Dark', 'Light'] as const) {
  test(`rss: removing a feed asks first and says what happens to its articles (${theme})`, async ({
    page,
  }) => {
    await open(page, '/rss', theme);
    await page.getByRole('button', { name: /^Wire Notes/ }).click();
    await expect(page.getByText('2 articles')).toBeVisible();
    await page.getByRole('button', { name: 'Remove feed: Wire Notes' }).click();

    // One of its two articles is highlighted, so it stays.
    const dialog = page.getByRole('dialog', { name: 'Remove feed' });
    await expect(dialog.getByRole('heading')).toHaveText('Remove Wire Notes?');
    await expect(dialog).toContainText(
      'Munim stops following this feed. 1 article is deleted. The 1 you saved, queued or highlighted is kept.',
    );
    // The safe answer has the focus, so Enter does not delete anything.
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(page).toHaveScreenshot(`rss-remove-feed-${theme.toLowerCase()}.png`);
    expect(await axeFailures(page)).toEqual([]);
  });
}

test('rss: a removed feed is gone, with its articles, except what was kept', async ({ page }) => {
  await open(page, '/rss');
  await page.getByRole('button', { name: /^Wire Notes/ }).click();
  await page.getByRole('button', { name: 'Remove feed: Wire Notes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove feed' });

  // Cancel, and Escape, change nothing.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove feed: Wire Notes' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Wire Notes/ })).toBeVisible();

  await page.getByRole('button', { name: 'Remove feed: Wire Notes' }).click();
  await dialog.getByRole('button', { name: 'Remove feed' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Wire Notes/ })).toHaveCount(0);
  // The first feed is shown again, and the count of feed articles follows: the one that was
  // kept no longer belongs to a feed, so it is in the Stream but not on this screen.
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(
    'Designing a calendar that does less',
  );
  await expect(page.getByRole('link', { name: /^RSS/ })).toHaveText(/5$/);

  // The highlighted article is still in the stream, under the feed's name; the other is not.
  await page.getByRole('link', { name: /^Stream/ }).click();
  await expect(
    page.getByRole('button', { name: /^The case for boring sync protocols/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: 'The case for boring sync protocols' }),
  ).toContainText('Wire Notes');
  await expect(page.getByRole('button', { name: /^What a retry budget is/ })).toHaveCount(0);
});

test('rss: the removal dialog counts an article saved a moment ago', async ({ page }) => {
  await open(page, '/rss');
  await page.getByRole('button', { name: /^Wire Notes/ }).click();
  await page.getByRole('button', { name: /What a retry budget is/ }).click();
  await page.getByRole('article').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('article').getByRole('button', { name: 'Saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove feed: Wire Notes' }).click();
  // Its other article was already highlighted, so now both stay.
  await expect(page.getByRole('dialog', { name: 'Remove feed' })).toContainText(
    'Its 2 articles you saved, queued or highlighted are kept. Nothing is deleted.',
  );
});

test('rss: if a feed cannot be removed, the dialog says so and stays', async ({ page }) => {
  await open(page, '/rss');
  await page.route('**/api/feeds/*', (route) => route.abort());
  await page.getByRole('button', { name: /^Remove feed:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove feed' });
  await dialog.getByRole('button', { name: 'Remove feed' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Could not reach the server.');
  await expect(dialog).toBeVisible();
});

test('rss: with no feeds, and when the server fails, the screen says so', async ({ page }) => {
  await fakeServer(page);
  await page.route('**/api/feeds', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/rss');
  await expect(page.getByText('No feeds yet. Add one below.')).toBeVisible();
  await expect(page.getByText('Add a feed by its address to start reading.')).toBeVisible();
  await expect(page).toHaveScreenshot('rss-empty-dark.png');

  await page.unroute('**/api/feeds');
  await page.route('**/api/feeds', (route) => route.fulfill({ status: 500, body: '' }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Could not load your feeds.');
  await expect(page).toHaveScreenshot('rss-failed-dark.png');
  await page.unroute('**/api/feeds');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: /^Wire Notes/ })).toBeVisible();
});

test('connections: sources Munim cannot read say why, and feeds show their real state', async ({
  page,
}) => {
  await open(page, '/connections');
  for (const [name, reason] of [
    ['Reddit', 'Reddit must approve an app before it may read anything.'],
    ['X', 'X charges for every post an app reads.'],
    ['Instagram', 'Instagram has no official way to read a personal feed.'],
  ] as const) {
    const row = page.getByRole('row').filter({ hasText: reason });
    await expect(row).toContainText('Not available yet');
    await expect(
      page.getByRole('button', { name: `Later: ${name} is not available yet` }),
    ).toBeDisabled();
  }
  const rss = page.getByRole('row').filter({ hasText: 'RSS' });
  await expect(rss).toContainText('5 feeds');
  await expect(rss).toContainText('31 min ago');
  await expect(rss).toContainText('Connected');
  await expect(
    page.getByRole('button', { name: 'Later: Calendar is not available yet' }),
  ).toBeDisabled();
  // A feed added this minute was fetched "Just now", not "0 min ago".
  await page.getByRole('link', { name: 'Manage feeds' }).click();
  await expect(page).toHaveURL(/\/rss$/);
  await page.getByLabel('Feed URL').fill('https://feeds.example/new.xml');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Example Feed/ })).toBeVisible();
  await page.getByRole('link', { name: 'Connections' }).click();
  await expect(rss).toContainText('6 feeds');
  await expect(rss).toContainText('Just now');
});

test('connections: YouTube is disconnected, and can be connected again with one click', async ({
  page,
}) => {
  await open(page, '/connections');
  const row = page.getByRole('row').filter({ hasText: 'YouTube' });
  await expect(row).toContainText('Your subscriptions');
  await expect(row).toContainText('9 min ago');
  await expect(row).toContainText('Connected');
  await expect(page.getByRole('region', { name: 'YouTube setup' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Disconnect YouTube' }).click();
  await expect(row).toContainText('Ready to connect');
  await expect(row).toContainText('Disconnected');
  // The client ID and secret stay, so connecting again is a link to Google's sign-in.
  await expect(page.getByRole('link', { name: 'Connect YouTube' })).toHaveAttribute(
    'href',
    '/api/sources/youtube/start',
  );
  await expect(page.getByRole('region', { name: 'YouTube setup' })).toContainText(
    'The client ID and secret are saved.',
  );
});

for (const theme of ['Dark', 'Light'] as const) {
  test(`connections: YouTube is set up with a Google client ID and secret (${theme})`, async ({
    page,
  }) => {
    const server = await open(page, '/connections', theme);
    server.youtubeFresh();
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: 'YouTube' });
    await expect(row).toContainText('Not set up');
    await page.getByRole('button', { name: 'Set up YouTube' }).click();

    const setup = page.getByRole('region', { name: 'YouTube setup' });
    // The address the owner must give Google is shown to be copied.
    await expect(setup).toContainText('http://localhost:4173/api/sources/youtube/callback');
    await expect(setup).toContainText('Google ends the sign-in after 7 days');
    await expect(page).toHaveScreenshot(`connections-youtube-setup-${theme.toLowerCase()}.png`);
    expect(await axeFailures(page)).toEqual([]);

    await setup.getByLabel('Client ID').fill('short');
    await setup.getByLabel('Client secret').fill('short');
    await setup.getByRole('button', { name: 'Save' }).click();
    await expect(setup.getByRole('alert')).toHaveText(
      'That is too short to be a client ID and secret.',
    );

    await setup.getByLabel('Client ID').fill('1234567890-abc.apps.googleusercontent.com');
    await setup.getByLabel('Client secret').fill('a-made-up-client-secret');
    await setup.getByRole('button', { name: 'Save' }).click();
    await expect(row).toContainText('Ready to connect');
    await expect(page.getByRole('link', { name: 'Connect YouTube' })).toBeVisible();
    // Neither value is shown again.
    await expect(page.getByText('a-made-up-client-secret')).toHaveCount(0);
    await expect(setup.getByLabel('Client secret')).toHaveCount(0);
  });
}

test('connections: a sign-in to Google that failed says why', async ({ page }) => {
  const server = await open(page, '/connections');
  server.youtubeFresh('Google sign-in was cancelled.');
  await page.reload();
  await expect(page.getByRole('region', { name: 'YouTube setup' }).getByRole('status')).toHaveText(
    'Google sign-in was cancelled.',
  );
  await expect(page.getByRole('link', { name: 'Connect YouTube' })).toBeVisible();
});

test('connections: Hacker News is switched off and on at the server', async ({ page }) => {
  await open(page, '/connections');
  const row = page.getByRole('row').filter({ hasText: 'Hacker News' });
  await expect(row).toContainText('Front page');
  await expect(row).toContainText('2 min ago');
  await expect(row).toContainText('Connected');
  await page.getByRole('button', { name: 'Disconnect Hacker News' }).click();
  await expect(row).toContainText('Disconnected');
  // It is the server's state, so it is still off after a reload.
  await page.reload();
  await expect(row).toContainText('Disconnected');
  await page.getByRole('button', { name: 'Connect Hacker News' }).click();
  await expect(row).toContainText('Connected');

  // If the server cannot be asked, the row says so and its button does nothing.
  await page.route('**/api/sources/hacker-news', (route) =>
    route.fulfill({ status: 500, body: '' }),
  );
  await page.reload();
  await expect(row).toContainText('Could not load');
  await expect(page.getByRole('button', { name: 'Connect Hacker News' })).toBeDisabled();
});

test('settings: the Encryption card says what this install does, and no more', async ({ page }) => {
  await open(page, '/settings');
  const card = page.locator('section').filter({ hasText: 'Encryption' }).first();
  await expect(card).toContainText('Secrets are sealed');
  await expect(card).toContainText('kept as plain text in the database');
  await expect(card).toContainText('A file in the data folder, master.key');
  await expect(card).toContainText('1 API key, 1 source sign-in');
  await expect(card).toContainText('Kept only as a hash, never as written');
  // The tests reach the app over http on this machine, and the card says exactly that.
  await expect(card).toContainText('Not encrypted, and it never leaves this machine');
  // None of the handoff's claims, which are false for this app.
  for (const claim of ['End-to-end', 'Keys stay on your devices', 'cannot read']) {
    await expect(page.getByText(claim)).toHaveCount(0);
  }

  // If the facts cannot be read, it says so instead of guessing.
  await page.route('**/api/security', (route) => route.fulfill({ status: 500, body: '' }));
  await page.reload();
  await expect(card).toContainText('Could not load');
  await expect(card).toContainText('Kept only as a hash');
});

test('settings: export is a download; deleting everything asks for the passphrase', async ({
  page,
}) => {
  await open(page, '/settings');
  const exportLink = page.getByRole('link', { name: 'Export everything' });
  await expect(exportLink).toHaveAttribute('href', '/api/export');
  await expect(exportLink).toHaveAttribute('download', '');

  await page.getByRole('button', { name: 'Delete all data' }).click();
  const field = page.getByLabel('Passphrase to confirm deleting');
  await expect(field).toBeFocused();
  await expect(
    page.getByText('This cannot be undone. Enter your passphrase to confirm.'),
  ).toBeVisible();
  await expect(page).toHaveScreenshot('settings-delete-all-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  // Cancel changes nothing; neither does a wrong passphrase.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(field).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete all data' }).click();
  await field.fill('not it');
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByRole('alert')).toHaveText('That passphrase is not right.');
  await expect(page.getByRole('link', { name: /^Stream/ })).toHaveText(/22$/);

  await field.fill(GOOD);
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByRole('status')).toHaveText('Everything was deleted.');
  await expect(field).toHaveCount(0);
  // Every count follows, and the owner is still signed in.
  await expect(page.getByRole('link', { name: /^Stream/ })).toHaveText(/0$/);
  await expect(page.getByRole('link', { name: /^Highlights/ })).toHaveText(/0$/);
  await page.getByRole('link', { name: /^Stream/ }).click();
  await expect(
    page.getByText('Nothing here yet. Connect a source and its items appear here.'),
  ).toBeVisible();
});

test('settings: after three wrong passphrases, deleting has to wait', async ({ page }) => {
  await open(page, '/settings');
  await page.getByRole('button', { name: 'Delete all data' }).click();
  const field = page.getByLabel('Passphrase to confirm deleting');
  for (let i = 0; i < 3; i++) {
    await field.fill('wrong');
    await page.getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByRole('alert')).toHaveText('That passphrase is not right.');
    await field.fill('');
  }
  await field.fill(GOOD);
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByRole('alert')).toHaveText(/Too many attempts\. Try again in 30 seconds\./);
  await expect(page.getByRole('link', { name: /^Stream/ })).toHaveText(/22$/);
});

test('settings: appearance applies at once and survives a reload', async ({ page }) => {
  // Not open(): its init script would reset the saved theme on reload.
  await fakeServer(page);
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

test('first run: the passphrase must be long enough and repeated exactly', async ({ page }) => {
  await open(page, '/', 'Dark', 'Comfortable', 'setup');
  const first = page.getByLabel('Passphrase', { exact: true });
  await expect(first).toBeFocused();
  await first.fill('short');
  await page.getByLabel('Repeat passphrase').fill('short');
  await page.getByRole('button', { name: 'Create and open Munim' }).click();
  await expect(page.getByRole('alert')).toHaveText('Use at least 12 characters.');
  await expect(page.getByRole('heading', { name: 'Set a passphrase' })).toBeVisible();

  await first.fill(GOOD);
  await page.getByLabel('Repeat passphrase').fill('four unrelated wordz');
  await page.getByRole('button', { name: 'Create and open Munim' }).click();
  await expect(page.getByRole('alert')).toHaveText('The two entries do not match.');
  await expect(page).toHaveScreenshot('setup-problem-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  await page.getByLabel('Repeat passphrase').fill(GOOD);
  await page.getByRole('button', { name: 'Create and open Munim' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('sign-in: a wrong passphrase is refused, the right one opens the page that was asked for', async ({
  page,
}) => {
  await open(page, '/saved', 'Dark', 'Comfortable', 'signed_out');
  const field = page.getByLabel('Passphrase');
  await field.fill('wrong');
  await field.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('That passphrase is not right.');
  await expect(field).toHaveValue('');
  await expect(page).toHaveScreenshot('sign-in-wrong-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  await field.fill(GOOD);
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();
  await expect(page).toHaveURL(/\/saved$/);
});

test('sign-in: after three wrong passphrases the server makes even the right one wait', async ({
  page,
}) => {
  await page.clock.install();
  const server = await open(page, '/', 'Dark', 'Comfortable', 'signed_out', false);
  const field = page.getByLabel('Passphrase');
  const button = page.getByRole('button', { name: 'Sign in' });
  for (let i = 0; i < 3; i++) {
    await field.fill('wrong');
    await button.click();
    // The field empties when the answer arrives; a click before that would be ignored.
    await expect(field).toHaveValue('');
    await expect(page.getByRole('alert')).toHaveText('That passphrase is not right.');
  }
  // Stop the clock, so the countdown stays at 30 for the screenshot. A second ahead, because the
  // page's clock may already be past this process's "now", and it cannot be set backwards.
  await page.clock.pauseAt(Date.now() + 1000);
  await field.fill(GOOD);
  await button.click();
  await expect(page.getByRole('alert')).toHaveText('Too many attempts. Try again in 30 seconds.');
  await expect(button).toBeDisabled();
  await expect(field).toBeDisabled();
  await expect(page).toHaveScreenshot('sign-in-waiting-dark.png');

  await page.clock.fastForward(12_000);
  await expect(page.getByRole('alert')).toHaveText('Too many attempts. Try again in 18 seconds.');

  server.waitIsOver();
  await page.clock.fastForward(18_000);
  await expect(button).toBeEnabled();
  await expect(page.getByRole('alert')).toBeHidden();
  await field.fill(GOOD);
  await button.click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('if the server cannot be reached the app says so, and Try again asks it again', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/today');
  await expect(page.getByRole('alert')).toContainText('Could not load Munim.');
  await expect(page).toHaveScreenshot('unreachable-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  await page.unroute('**/api/**');
  await fakeServer(page);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('a session that the server has locked or ended is followed by the app', async ({ page }) => {
  await open(page, '/settings');
  await expect(page.getByText('Safari on iPhone')).toBeVisible();
  // The server locks the session behind the app's back, as its own idle clock would.
  await page.evaluate(() => fetch('/api/lock', { method: 'POST' }));
  await page
    .getByRole('group', { name: 'Lock after' })
    .getByRole('button', { name: '1 hour' })
    .click();
  await expect(page.getByRole('heading', { name: 'Locked' })).toBeVisible();
});

for (const theme of ['Dark', 'Light']) {
  test(`lock: covers the app, and unlocking returns to the same place (${theme})`, async ({
    page,
  }) => {
    await open(page, '/settings', theme);
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Locked' })).toBeVisible();
    // The app underneath is inert: not clickable, not focusable, not read aloud.
    const app = page.locator('div[inert]');
    await expect(app).toHaveCount(1);
    await expect(app.getByRole('link', { name: /^Today/ })).toHaveCount(1);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[inert]'))).toBe(false);
    }
    await expect(page).toHaveScreenshot(`locked-${theme.toLowerCase()}.png`);
    expect(await axeFailures(page)).toEqual([]);

    await page.getByLabel('Passphrase').fill('nope');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toHaveText('That passphrase is not right.');

    await page.getByLabel('Passphrase').fill(GOOD);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('heading', { name: 'Locked' })).toHaveCount(0);
    await expect(app).toHaveCount(0);
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Security and settings' })).toBeVisible();
  });
}

test('lock: signing out from the lock screen leaves the app', async ({ page }) => {
  await open(page, '/settings');
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  // The settings screen underneath has a Sign out of its own; this is the lock screen's.
  await page
    .locator('section', { has: page.getByRole('heading', { name: 'Locked' }) })
    .getByRole('button', { name: 'Sign out' })
    .click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('settings: idle lock can be retimed or switched off', async ({ page }) => {
  await open(page, '/settings');
  await expect(page.getByText('After 15 minutes without activity')).toBeVisible();
  await page
    .getByRole('group', { name: 'Lock after' })
    .getByRole('button', { name: '1 hour' })
    .click();
  await expect(page.getByText('After 1 hour without activity')).toBeVisible();
  await page.getByRole('switch', { name: 'Lock when idle' }).click();
  await expect(page.getByText('Munim stays open until you sign out')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Lock after' })).toHaveCount(0);
});

test('settings: changing the passphrase checks the current one and the new one', async ({
  page,
}) => {
  await open(page, '/settings');
  const NEW = 'a brand new phrase';
  await expect(page.getByText('Safari on iPhone')).toBeVisible();
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Current passphrase').fill('nope');
  await page.getByLabel('New passphrase', { exact: true }).fill(NEW);
  await page.getByLabel('Repeat new passphrase').fill(NEW);
  await page.getByRole('button', { name: 'Save passphrase' }).click();
  await expect(page.getByRole('alert')).toHaveText('The current passphrase is not right.');
  await expect(page).toHaveScreenshot('settings-forms-open-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  await page.getByLabel('Current passphrase').fill(GOOD);
  await page.getByLabel('Repeat new passphrase').fill('something else here');
  await page.getByRole('button', { name: 'Save passphrase' }).click();
  await expect(page.getByRole('alert')).toHaveText('The two entries do not match.');

  await page.getByLabel('New passphrase', { exact: true }).fill('short');
  await page.getByLabel('Repeat new passphrase').fill('short');
  await page.getByRole('button', { name: 'Save passphrase' }).click();
  await expect(page.getByRole('alert')).toHaveText('Use at least 12 characters.');

  await page.getByLabel('New passphrase', { exact: true }).fill(NEW);
  await page.getByLabel('Repeat new passphrase').fill(NEW);
  await page.getByRole('button', { name: 'Save passphrase' }).click();
  await expect(page.getByRole('status')).toHaveText(/Passphrase changed/);
  await expect(page.getByLabel('Current passphrase')).toHaveCount(0);
});

test('settings: revoking a device removes it; signing out leaves the app', async ({ page }) => {
  await open(page, '/settings');
  await expect(page.getByText('This device · Active now')).toBeVisible();
  await expect(page.getByText('2 hours ago')).toBeVisible();
  await page.getByRole('button', { name: 'Revoke Safari on iPhone' }).click();
  await expect(page.getByText('Safari on iPhone')).toHaveCount(0);
  await expect(page.getByText('Firefox on Linux')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('keyboard: g then a letter goes to a view, and typing in a field is left alone', async ({
  page,
}) => {
  await open(page, '/today');
  await page.keyboard.press('g');
  await page.keyboard.press('s');
  await expect(page).toHaveURL(/\/stream$/);
  await page.keyboard.press('g');
  await page.keyboard.press(',');
  await expect(page).toHaveURL(/\/settings$/);

  await page.keyboard.press('g');
  await page.keyboard.press('s');
  const search = page.getByLabel('Search the stream');
  await search.focus();
  await page.keyboard.type('gv');
  await expect(search).toHaveValue('gv');
  await expect(page).toHaveURL(/\/stream$/);
});

const threadHeading = (page: Page) =>
  page.getByRole('complementary', { name: 'Thread' }).getByRole('heading');

test('keyboard: j and k move through the stream, and s, l, a act on the selected item', async ({
  page,
}) => {
  await open(page, '/stream');
  await page.keyboard.press('j');
  await expect(threadHeading(page)).toHaveText(/^Shipped offline sync/);
  await page.keyboard.press('j');
  await expect(threadHeading(page)).toHaveText(/^Show HN/);
  await page.keyboard.press('k');
  await expect(threadHeading(page)).toHaveText(/^Shipped offline sync/);
  await page.keyboard.press('k');
  await page.keyboard.press('k'); // stops at the first row
  await expect(threadHeading(page)).toHaveText(/^What finally got you/);

  await page.keyboard.press('j');
  await page.keyboard.press('s');
  await expect(page.getByRole('link', { name: /^Saved/ })).toHaveText(/9$/);
  await page.keyboard.press('l');
  await expect(page.getByRole('link', { name: /^Read later/ })).toHaveText(/6$/);
  await page.keyboard.press('a');
  await expect(page.getByLabel('Ask about this thread')).toBeFocused();
});

test('keyboard: the last row scrolls into view, and "g s" does not also save', async ({ page }) => {
  await open(page, '/stream');
  for (let i = 0; i < 21; i++) await page.keyboard.press('j');
  await expect(threadHeading(page)).toHaveText(/^What a retry budget is/);
  await expect(rows(page).last()).toBeInViewport();

  await page.keyboard.press('g');
  await page.keyboard.press('s');
  await expect(page).toHaveURL(/\/stream$/);
  await expect(page.getByRole('link', { name: /^Saved/ })).toHaveText(/8$/);
});

test('keyboard: / focuses the ask bar; rss moves with j and k', async ({ page }) => {
  await open(page, '/rss');
  await page.getByRole('button', { name: /^Wire Notes/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(
    'The case for boring sync protocols',
  );
  await page.keyboard.press('j');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('What a retry budget is');
  await page.keyboard.press('j'); // stops at the last article
  await page.keyboard.press('k');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(
    'The case for boring sync protocols',
  );
  await page.keyboard.press('/');
  await expect(page.getByRole('search').getByLabel('Ask')).toBeFocused();
  await expect(page.getByRole('search').getByLabel('Ask')).toHaveValue('');
});

test('keyboard: single-key shortcuts can be switched off; the commands shortcut still works', async ({
  page,
}) => {
  await open(page, '/settings');
  await page.getByRole('switch', { name: 'Single-key shortcuts' }).click();
  await page.keyboard.press('g');
  await page.keyboard.press('s');
  await expect(page).toHaveURL(/\/settings$/);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog', { name: 'Commands' })).toBeVisible();
});

test('keyboard: no shortcut acts behind a dialog or the lock screen', async ({ page }) => {
  await open(page, '/stream');
  await page.getByRole('button', { name: 'Preview video' }).first().click();
  await page.keyboard.press('j');
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(threadHeading(page)).toHaveText(/^What finally got you/);

  await page.keyboard.press('g');
  await page.keyboard.press(',');
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await page.getByLabel('Passphrase').blur();
  await page.keyboard.press('g');
  await page.keyboard.press('s');
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Locked' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('shortcut list opens with ? and from settings, and closes with Escape', async ({ page }) => {
  await open(page, '/today');
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  await expect(page).toHaveScreenshot('shortcuts-dark.png');
  expect(await axeFailures(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(help).toBeVisible();
  await help.getByRole('button', { name: 'Close' }).click();
  await expect(help).toBeHidden();
});

for (const theme of ['Dark', 'Light']) {
  test(`command palette: looks right and is accessible (${theme})`, async ({ page }) => {
    await open(page, '/today', theme);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('dialog', { name: 'Commands' })).toBeVisible();
    await expect(page.getByRole('combobox')).toBeFocused();
    await expect(page).toHaveScreenshot(`palette-${theme.toLowerCase()}.png`);
    expect(await axeFailures(page)).toEqual([]);
  });
}

test('command palette: filter, move with arrows, run with Enter, or ask what was typed', async ({
  page,
}) => {
  await open(page, '/today');
  await page.getByRole('button', { name: /^Commands/ }).click();
  const field = page.getByRole('combobox');
  const options = page.getByRole('option');

  await field.fill('saved');
  await expect(options).toHaveText(['Go to Savedg v', 'Ask: saved']);
  await field.press('Enter');
  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+k');
  await field.fill('go to');
  await field.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await field.press('ArrowUp');
  await field.press('ArrowUp'); // wraps to the last option
  await expect(options.last()).toHaveAttribute('aria-selected', 'true');
  await expect(options.last()).toHaveText('Ask: go to');

  await field.fill('What changed in sync this week?');
  await expect(options).toHaveCount(1);
  await field.press('Enter');
  await expect(page).toHaveURL(/\/ask$/);
  await expect(page.getByText('What changed in sync this week?')).toBeVisible();
});

test('command palette: actions change the theme, open the shortcut list, and lock', async ({
  page,
}) => {
  await open(page, '/today');
  const field = page.getByRole('combobox');
  await page.keyboard.press('ControlOrMeta+k');
  await field.fill('light theme');
  await field.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('option', { name: /^Keyboard shortcuts/ }).click();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('ControlOrMeta+k');
  await field.fill('lock');
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'Locked' })).toBeVisible();
});

/** Selects the first occurrence of `text` on the page, as dragging over it would. */
async function selectText(page: Page, text: string) {
  // The text may still be on its way from the server.
  await expect(page.getByText(text).first()).toBeVisible();
  await page.evaluate((wanted) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const at = node.textContent?.indexOf(wanted) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + wanted.length);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    throw new Error(`"${wanted}" is not on the page`);
  }, text);
}

test('highlights: selected comment text can be highlighted, is marked in place, and is listed', async ({
  page,
}) => {
  await open(page, '/stream');
  await selectText(page, 'Saving was the thing.');
  const button = page.getByRole('button', { name: 'Highlight', exact: true });
  await expect(button).toBeVisible();
  await expect(page).toHaveScreenshot('highlight-selection-dark.png');
  await button.click();
  await expect(button).toHaveCount(0);
  await expect(page.locator('mark', { hasText: 'Saving was the thing.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Highlights/ })).toHaveText(/6$/);
  expect(await axeFailures(page)).toEqual([]);

  // Text that is already highlighted, or part of it, offers nothing and cannot be stored again.
  for (const again of ['Saving was the thing.', 'was the']) {
    await selectText(page, again);
    await expect(button).toHaveCount(0);
    await page.keyboard.press('h');
    await expect(page.getByRole('link', { name: /^Highlights/ })).toHaveText(/6$/);
  }
  // Text that runs from a highlight into plain text is a new, longer highlight.
  await page.evaluate(() => {
    const mark = document.querySelector('aside mark');
    const after = mark?.nextSibling;
    if (!mark?.firstChild || !after) throw new Error('expected a mark followed by text');
    const range = document.createRange();
    range.setStart(mark.firstChild, 0);
    range.setEnd(after, ' Once everything'.length);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('aside mark')).toHaveText('Saving was the thing. Once everything');
  await expect(page.getByRole('link', { name: /^Highlights/ })).toHaveText(/7$/);

  await page.getByRole('link', { name: /^Highlights/ }).click();
  const first = page.locator('section').filter({ hasText: 'Saving was the thing.' }).last();
  await expect(first).toContainText('What finally got you to move your feeds');
  await expect(first).toContainText('Today');
});

test('highlights: the h key works; text outside an article or comment cannot be highlighted', async ({
  page,
}) => {
  await open(page, '/rss');
  await page.getByRole('button', { name: /^Low Tech Notes/ }).click();
  await expect(page.getByText('I stopped polling every fifteen minutes')).toBeVisible();
  await selectText(page, 'I stopped polling every fifteen minutes');
  await page.keyboard.press('h');
  await expect(page.locator('mark', { hasText: 'I stopped polling' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Highlights/ })).toHaveText(/6$/);

  await selectText(page, 'A year of running my own feed reader');
  await expect(page.getByRole('button', { name: 'Highlight', exact: true })).toHaveCount(0);
});

test('highlights: a highlight can cross italic text, and is still there after a reload', async ({
  page,
}) => {
  await open(page, '/rss');
  await expect(page.getByText('nobody asked')).toBeVisible();
  // "question nobody asked: what" starts in plain text, crosses the italic words and ends in
  // plain text again.
  await page.evaluate(() => {
    const italic = [...document.querySelectorAll('article span')].find(
      (span) => span.textContent === 'nobody asked',
    );
    const before = italic?.previousSibling;
    const after = italic?.nextSibling;
    if (!before?.textContent || !after) throw new Error('expected text around the italic words');
    const range = document.createRange();
    range.setStart(before, before.textContent.indexOf('question'));
    range.setEnd(after, ': what'.length);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  });
  await page.keyboard.press('h');
  const marks = page.locator('article mark');
  await expect(marks).toHaveText(['question ', 'nobody asked', ': what']);
  await expect(page.getByRole('link', { name: /^Highlights/ })).toHaveText(/6$/);
  await page.reload();
  await expect(marks).toHaveText(['question ', 'nobody asked', ': what']);
  expect(await axeFailures(page)).toEqual([]);
});

test('highlights: a stored quote is marked where it appears in the article', async ({ page }) => {
  await open(page, '/rss');
  await page.getByRole('button', { name: /^Plain Crypto/ }).click();
  await expect(
    page.locator('article mark', { hasText: 'recovery is where most schemes quietly give' }),
  ).toBeVisible();
});

test('highlights: notes can be added and edited, and a highlight removed, down to none', async ({
  page,
}) => {
  await open(page, '/highlights');
  await page.getByRole('button', { name: /^Add note: Chunking by reply tree/ }).click();
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Note' }).fill('Try this on the digest.');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Note: Try this on the digest.')).toBeVisible();

  await page.getByRole('button', { name: /^Edit note: Chunking by reply tree/ }).click();
  await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue('Try this on the digest.');
  await expect(page).toHaveScreenshot('highlights-editing-dark.png');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Note: Try this on the digest.')).toBeVisible();

  for (let left = 5; left > 0; left--) {
    await expect(page.getByRole('link', { name: /^Highlights/ })).toHaveText(
      new RegExp(`${String(left)}$`),
    );
    await page
      .getByRole('button', { name: /^Remove:/ })
      .first()
      .click();
  }
  await expect(page.getByText('No highlights yet.')).toBeVisible();
  await page.getByRole('link', { name: /^Today/ }).click();
  await expect(page.getByText('No highlights yet.')).toBeVisible();
});
