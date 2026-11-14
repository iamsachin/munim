import { expect, test } from 'vitest';
import { LATER, SAVED } from './fixtures';
import {
  INITIAL,
  laterRows,
  laterTotal,
  matchCount,
  savedCount,
  toggled,
  watchRows,
  type ReaderState,
} from './store';

const state = (patch: Partial<ReaderState>): ReaderState => ({ ...INITIAL, ...patch });

test('toggled adds a missing value and removes a present one, without mutating', () => {
  const set = new Set([1]);
  expect([...toggled(set, 2)]).toEqual([1, 2]);
  expect([...toggled(set, 1)]).toEqual([]);
  expect([...set]).toEqual([1]);
});

test('saved count starts at the stored total and follows stream saves', () => {
  expect(savedCount(INITIAL)).toBe(SAVED.length);
  expect(savedCount(state({ saved: toggled(INITIAL.saved, 1) }))).toBe(SAVED.length + 1);
  expect(savedCount(state({ saved: toggled(INITIAL.saved, 0) }))).toBe(SAVED.length - 1);
});

test('read later: queued items come first, finished ones drop out', () => {
  const rows = laterRows(state({ laterAdded: [3], laterDone: new Set(['b0']) }));
  expect(rows).toHaveLength(LATER.length);
  expect(rows[0]).toMatchObject({ key: 'i3', item: 3, added: 'Now', mins: 0 });
  expect(rows.some((r) => r.key === 'b0')).toBe(false);
});

test('read later total switches to hours at 60 minutes', () => {
  expect(laterTotal(laterRows(INITIAL))).toBe('6 items · 1 h 30 min');
  const short = laterRows(state({ laterDone: new Set(['b1', 'b2']) }));
  expect(laterTotal(short)).toBe('4 items · 34 min');
  expect(laterTotal([])).toBe('0 items · 0 min');
});

test('watches: new ones start with no matches, switched-off ones do not count', () => {
  expect(matchCount(INITIAL)).toBe(19);
  const s = state({ watchNew: ['sqlite'], watchOff: new Set(['rate limits']) });
  expect(watchRows(s).at(-1)).toMatchObject({ name: 'sqlite', count: 0, on: true });
  expect(matchCount(s)).toBe(12);
});
