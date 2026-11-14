import { execSync } from 'node:child_process';
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
