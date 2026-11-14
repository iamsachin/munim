import { expect, test } from 'vitest';
import { age } from './feeds';

test('age is shown in the largest whole unit, in the short form', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  expect(age('2026-11-14T11:59:40Z', now)).toBe('0m');
  expect(age('2026-11-14T11:48:00Z', now)).toBe('12m');
  expect(age('2026-11-14T06:00:00Z', now)).toBe('6h');
  expect(age('2026-11-13T12:00:00Z', now)).toBe('1d');
  expect(age('2026-10-01T12:00:00Z', now)).toBe('44d');
  // A feed whose clock is ahead must not show a negative age.
  expect(age('2026-11-14T12:05:00Z', now)).toBe('0m');
});
