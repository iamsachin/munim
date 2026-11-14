import { expect, test } from 'vitest';
import { applyTheme, DEFAULT_THEME, parseTheme } from './theme';

function fakeRoot() {
  const vars: Record<string, string> = {};
  const dataset: Record<string, string> = {};
  const style = { setProperty: (name: string, value: string) => void (vars[name] = value) };
  return { root: { dataset, style } as unknown as HTMLElement, vars, dataset };
}

test('default theme matches the design handoff', () => {
  const { root, vars, dataset } = fakeRoot();
  applyTheme(DEFAULT_THEME, root);
  expect(dataset).toEqual({ theme: 'dark' });
  expect(vars).toEqual({ '--accent': 'oklch(0.82 0.13 75)', '--dn': '1.7' });
});

test('theme, accent and density are applied independently', () => {
  const { root, vars, dataset } = fakeRoot();
  applyTheme({ theme: 'Light', accent: 'Blue', density: 'Roomy' }, root);
  expect(dataset).toEqual({ theme: 'light' });
  expect(vars).toEqual({ '--accent': 'oklch(0.76 0.12 250)', '--dn': '2.4' });
});

test('saved settings are restored', () => {
  const saved = { theme: 'Light', accent: 'Coral', density: 'Compact' } as const;
  expect(parseTheme(JSON.stringify(saved))).toEqual(saved);
});

test('missing, malformed or unknown saved settings fall back to defaults', () => {
  expect(parseTheme(null)).toEqual(DEFAULT_THEME);
  expect(parseTheme('{not json')).toEqual(DEFAULT_THEME);
  expect(parseTheme('"Light"')).toEqual(DEFAULT_THEME);
  // Inherited object keys must not pass as valid choices.
  expect(parseTheme('{"theme":"toString","accent":"constructor","density":7}')).toEqual(
    DEFAULT_THEME,
  );
  expect(parseTheme('{"accent":"Blue"}')).toEqual({ ...DEFAULT_THEME, accent: 'Blue' });
});
