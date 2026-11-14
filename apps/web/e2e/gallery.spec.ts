import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fakeServer } from './fake-server';

const THEMES = ['Dark', 'Light'];
const DENSITIES = ['Compact', 'Comfortable', 'Roomy'];
const ACCENTS = ['Amber', 'Blue', 'Green', 'Coral', 'Gray'];

async function open(page: Page, theme: string, accent: string, density: string) {
  await fakeServer(page);
  await page.goto('/gallery');
  await page.locator('#root > *').first().waitFor();
  for (const [group, name] of [
    ['Theme', theme],
    ['Accent', accent],
    ['Density', density],
  ] as const) {
    await page.getByRole('group', { name: group }).getByRole('button', { name }).click();
  }
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
}

// Every density in both themes, and every accent in both themes.
const cases = THEMES.flatMap((theme) => [
  ...DENSITIES.map((density) => [theme, 'Amber', density] as const),
  ...ACCENTS.slice(1).map((accent) => [theme, accent, 'Comfortable'] as const),
]);

for (const [theme, accent, density] of cases) {
  test(`gallery: ${theme}, ${accent}, ${density}`, async ({ page }) => {
    await open(page, theme, accent, density);
    await expect(page).toHaveScreenshot(`gallery-${theme}-${accent}-${density}.png`, {
      fullPage: true,
    });
    const { violations } = await new AxeBuilder({ page }).analyze();
    // One line per failing element keeps the report readable.
    const failures = violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} | ${n.failureSummary ?? ''}`),
    );
    expect(failures).toEqual([]);
  });
}

test('keyboard focus shows the themed ring', async ({ page }) => {
  await fakeServer(page);
  await page.goto('/gallery');
  await page.locator('#root > *').first().waitFor();
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(outline).toMatchObject({ style: 'solid', width: '2px' });
});

test('stream row: the whole row selects, nested controls keep their own action', async ({
  page,
}) => {
  await fakeServer(page);
  await page.goto('/gallery');
  await page.locator('#root > *').first().waitFor();
  const row = page.getByRole('row').filter({ hasText: 'New studio shelving finally up' });
  // Far from the title text: only the stretched hit area can catch this.
  await row.click({ position: { x: 4, y: 4 } });
  await expect(row).toHaveAttribute('aria-current', 'true');

  const first = page.getByRole('row').filter({ hasText: 'What finally got you' });
  const save = first.getByRole('button', { name: 'Save' });
  await expect(save).toHaveAttribute('aria-pressed', 'true');
  await save.click();
  await expect(save).toHaveAttribute('aria-pressed', 'false');
  await expect(first).not.toHaveAttribute('aria-current', 'true');
});
