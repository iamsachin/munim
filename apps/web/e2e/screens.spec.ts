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
  ['ai', '/ai'],
  ['settings', '/settings'],
  ['setup', '/setup'],
  ['sign-in', '/sign-in'],
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

test('saved: an item saved in the stream is listed, an unsaved one is not', async ({ page }) => {
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
  await expect(saved.getByRole('row')).toHaveCount(14); // header + 13: one added, one removed
  await expect(saved.getByRole('row').nth(1)).toContainText('Building a home server rack');
  await expect(saved.getByText('Show HN: A local-first archive')).toHaveCount(0);
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
  expect(await axeFailures(page)).toEqual([]);
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
  await expect(askModel).toHaveValue('gpt-5.5');
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
  await expect(askModel).toHaveValue('claude-sonnet-5-5');

  await page.getByRole('button', { name: 'Remove key for OpenAI' }).click();
  await expect(page.getByLabel('Model for Digest')).toHaveValue('');
  await expect(page.getByText('No model chosen, so this is off.')).toHaveCount(2);
  await expect(askModel).toHaveValue('claude-sonnet-5-5');
  expect(await axeFailures(page)).toEqual([]);
});

test('ai: a rejected key is reported and Cancel leaves things alone', async ({ page }) => {
  await open(page, '/ai');
  await page.getByRole('button', { name: 'Add key for Anthropic' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Anthropic' })).toContainText('No key');

  await page.getByRole('button', { name: 'Replace key for OpenAI' }).click();
  await page.getByLabel('OpenAI API key').fill('short');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'OpenAI' })).toContainText('Key rejected');
  await expect(page.getByLabel('Model for Ask')).toBeDisabled();
  await expect(page).toHaveScreenshot('ai-no-working-key-dark.png');
  expect(await axeFailures(page)).toEqual([]);
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

const GOOD = 'four unrelated words';

test('first run: the passphrase must be long enough and repeated exactly', async ({ page }) => {
  await open(page, '/setup');
  const first = page.getByLabel('Passphrase', { exact: true });
  await expect(first).toBeFocused();
  await first.fill('short');
  await page.getByLabel('Repeat passphrase').fill('short');
  await page.getByRole('button', { name: 'Create and open Munim' }).click();
  await expect(page.getByRole('alert')).toHaveText('Use at least 12 characters.');
  await expect(page).toHaveURL(/\/setup$/);

  await first.fill(GOOD);
  await page.getByLabel('Repeat passphrase').fill('four unrelated wordz');
  await page.getByRole('button', { name: 'Create and open Munim' }).click();
  await expect(page.getByRole('alert')).toHaveText('The two entries do not match.');
  await expect(page).toHaveScreenshot('setup-problem-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  await page.getByLabel('Repeat passphrase').fill(GOOD);
  await page.getByRole('button', { name: 'Create and open Munim' }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test('sign-in: a wrong passphrase is refused, three in a row must wait, the right one opens Today', async ({
  page,
}) => {
  await open(page, '/sign-in');
  const field = page.getByLabel('Passphrase');
  await field.fill('wrong');
  await field.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('That passphrase is not right.');
  await expect(field).toHaveValue('');
  await expect(page).toHaveScreenshot('sign-in-wrong-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  await field.fill(GOOD);
  await field.press('Enter');
  await expect(page).toHaveURL(/\/today$/);

  await page.goto('/sign-in');
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('Passphrase').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(page.getByRole('alert')).toHaveText('Too many attempts. Try again in 30 seconds.');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  await expect(page.getByLabel('Passphrase')).toBeDisabled();
  await expect(page).toHaveScreenshot('sign-in-waiting-dark.png');
});

test('sign-in: the wait ends after thirty seconds', async ({ page }) => {
  await page.clock.install();
  await open(page, '/sign-in');
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('Passphrase').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  await page.clock.fastForward(30_000);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  await expect(page.getByRole('alert')).toBeHidden();
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
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
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
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Current passphrase').fill('nope');
  await page.getByLabel('New passphrase', { exact: true }).fill(GOOD);
  await page.getByLabel('Repeat new passphrase').fill(GOOD);
  await page.getByRole('button', { name: 'Save passphrase' }).click();
  await expect(page.getByRole('alert')).toHaveText('The current passphrase is not right.');

  await page.getByLabel('Current passphrase').fill('the old passphrase');
  await page.getByLabel('Repeat new passphrase').fill('something else here');
  await page.getByRole('button', { name: 'Save passphrase' }).click();
  await expect(page.getByRole('alert')).toHaveText('The two entries do not match.');

  await page.getByLabel('Repeat new passphrase').fill(GOOD);
  await page.getByRole('button', { name: 'Save passphrase' }).click();
  await expect(page.getByRole('status')).toHaveText(/this build runs on sample data/);
  await expect(page.getByLabel('Current passphrase')).toHaveCount(0);
});

test('settings: revoking a device removes it; signing out leaves the app', async ({ page }) => {
  await open(page, '/settings');
  await page.getByRole('button', { name: 'Revoke Safari on iPhone' }).click();
  await expect(page.getByText('Safari on iPhone')).toHaveCount(0);
  await expect(page.getByText('Firefox on Linux')).toBeVisible();
  await page.getByRole('link', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('settings: deleting everything needs the passphrase, and the mock says it did nothing', async ({
  page,
}) => {
  await open(page, '/settings');
  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: 'Delete all data' }).click();
  const confirm = page.getByLabel('Passphrase to confirm deleting');
  await expect(confirm).toBeFocused();
  await expect(page).toHaveScreenshot('settings-forms-open-dark.png');
  expect(await axeFailures(page)).toEqual([]);

  await confirm.fill('nope');
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByText('That passphrase is not right.')).toBeVisible();
  await confirm.fill(GOOD);
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText(/Nothing happened: this build runs on sample data/)).toBeVisible();

  await page.getByRole('button', { name: 'Delete all data' }).click();
  await page.getByRole('button', { name: 'Cancel' }).last().click();
  await expect(page.getByLabel('Passphrase to confirm deleting')).toHaveCount(0);
});

const threadHeading = (page: Page) =>
  page.getByRole('complementary', { name: 'Thread' }).getByRole('heading');

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

test('keyboard: j and k move through the stream, and s, l, a, r act on the selected item', async ({
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
  await expect(page.getByRole('link', { name: /^Saved/ })).toHaveText(/14$/);
  await page.keyboard.press('l');
  await expect(page.getByRole('link', { name: /^Read later/ })).toHaveText(/7$/);
  await page.keyboard.press('r');
  await expect(page.getByLabel('Reply on X')).toBeFocused();
  await page.getByLabel('Reply on X').blur();
  await page.keyboard.press('a');
  await expect(page.getByLabel('Ask about this thread')).toBeFocused();
});

test('keyboard: the last row scrolls into view, and "g s" does not also save', async ({ page }) => {
  await open(page, '/stream');
  for (let i = 0; i < 17; i++) await page.keyboard.press('j');
  await expect(threadHeading(page)).toHaveText(/^Summarizing 400-comment threads/);
  await expect(rows(page).last()).toBeInViewport();

  await page.keyboard.press('g');
  await page.keyboard.press('s');
  await expect(page).toHaveURL(/\/stream$/);
  await expect(page.getByRole('link', { name: /^Saved/ })).toHaveText(/13$/);
});

test('keyboard: / focuses the ask bar; rss moves with j and k', async ({ page }) => {
  await open(page, '/rss');
  await page.getByRole('button', { name: /^Wire Notes/ }).click();
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
