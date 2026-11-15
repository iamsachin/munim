import { expect, test } from 'vitest';
import { age, conversations, day, heldOf, kindOf, readingTotal } from './queries';

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

test('a reading total switches to hours at 60 minutes and counts in plain words', () => {
  const of = (...minutes: number[]) => readingTotal(minutes.map((m) => ({ minutes: m })));
  expect(of(9, 42, 14, 6, 11)).toBe('5 items · 1 h 22 min');
  expect(of(9, 14, 11)).toBe('3 items · 34 min');
  expect(of(60)).toBe('1 item · 1 h 0 min');
  expect(of()).toBe('0 items · 0 min');
});

test('an item is a video, an article, a post or a thread', () => {
  expect(kindOf({ source: 'YT', media: 'Video' })).toBe('Video');
  expect(kindOf({ source: 'IG', media: 'Video' })).toBe('Video');
  expect(kindOf({ source: 'RSS', media: null })).toBe('Article');
  expect(kindOf({ source: 'X', media: null })).toBe('Post');
  expect(kindOf({ source: 'IG', media: 'Image' })).toBe('Post');
  expect(kindOf({ source: 'RD', media: null })).toBe('Thread');
  expect(kindOf({ source: 'HN', media: null })).toBe('Thread');
});

test('what is held of a saved item is said plainly', () => {
  expect(heldOf({ source: 'RSS', media: null, replies: 0 })).toBe('Full text');
  expect(heldOf({ source: 'RD', media: null, replies: 214 })).toBe('214 comments');
  expect(heldOf({ source: 'HN', media: null, replies: 1 })).toBe('1 comment');
  expect(heldOf({ source: 'X', media: null, replies: 0 })).toBe('Text');
});

test('a day is named as the owner would: today, yesterday, a weekday, then a date', () => {
  // Built from local parts, so the test means the same in every time zone.
  const at = (dayOfMonth: number, hour: number) =>
    new Date(2026, 10, dayOfMonth, hour).toISOString();
  const now = new Date(2026, 10, 14, 17, 30).getTime();
  expect(day(at(14, 0), now)).toBe('Today');
  expect(day(at(14, 23), now)).toBe('Today');
  expect(day(at(13, 23), now)).toBe('Yesterday');
  expect(day(at(9, 12), now)).toBe('Mon');
  expect(day(at(8, 12), now)).toBe('Sun');
  expect(day(at(7, 12), now)).toBe('7 Nov');
});

test('questions are grouped into conversations, the one last added to first', () => {
  const asked = (id: number, follows: number | null = null, item: number | null = null) =>
    ({ id, follows, about: item && { item_id: item } }) as Parameters<
      typeof conversations
    >[0][number];
  const ids = (asks: ReturnType<typeof asked>[]) =>
    conversations(asks).map((group) => group.map((one) => one.id));
  expect(ids([])).toEqual([]);
  expect(ids([asked(1), asked(2)])).toEqual([[2], [1]]);
  // A follow-up joins its question's conversation even when another was asked in between,
  // and so does a follow-up to that follow-up.
  expect(ids([asked(1), asked(2), asked(3, 1), asked(4, 3), asked(5, 2)])).toEqual([
    [2, 5],
    [1, 3, 4],
  ]);
  // What it follows is no longer listed: it stands by itself.
  expect(ids([asked(7, 3), asked(8, 7)])).toEqual([[7, 8]]);
  // The questions about one item are one conversation, whether or not one follows another;
  // a question about nothing in particular is not part of it.
  expect(ids([asked(1, null, 9), asked(2), asked(3, null, 9), asked(4, 3, 9)])).toEqual([
    [1, 3, 4],
    [2],
  ]);
});
