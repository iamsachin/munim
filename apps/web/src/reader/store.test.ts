import { expect, test } from 'vitest';
import { INITIAL, matchCount, toggled, watchRows, type ReaderState } from './store';

const state = (patch: Partial<ReaderState>): ReaderState => ({ ...INITIAL, ...patch });

test('toggled adds a missing value and removes a present one, without mutating', () => {
  const set = new Set([1]);
  expect([...toggled(set, 2)]).toEqual([1, 2]);
  expect([...toggled(set, 1)]).toEqual([]);
  expect([...set]).toEqual([1]);
});

test('watches: new ones start with no matches, switched-off ones do not count', () => {
  expect(matchCount(INITIAL)).toBe(19);
  const s = state({ watchNew: ['sqlite'], watchOff: new Set(['rate limits']) });
  expect(watchRows(s).at(-1)).toMatchObject({ name: 'sqlite', count: 0, on: true });
  expect(matchCount(s)).toBe(12);
});
