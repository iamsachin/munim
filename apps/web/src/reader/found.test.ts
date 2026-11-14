import { expect, test } from 'vitest';
import { findMatches, flagged, union, within } from './found';

const marked = (texts: string[], found: string[][]) =>
  findMatches(texts, found).map((ranges, i) => ranges.map(([a, b]) => texts[i]?.slice(a, b)));

test('words that appear together are marked as one place, and only there', () => {
  const texts = ['Data moves. The movements of data are tracked.', 'More data here.'];
  const found = [['movements'], ['of'], ['data', 'databases']];
  expect(marked(texts, found)).toEqual([['movements of data'], []]);
});

test('words that are nowhere together are each marked wherever they are', () => {
  const texts = ['Data is kept. There is little Movement.', 'No movement of the data.'];
  const found = [['movement'], ['of'], ['data']];
  expect(marked(texts, found)).toEqual([
    ['Data', 'Movement'],
    ['movement', 'of', 'data'],
  ]);
});

test('one word is marked everywhere, whole words only, in any case', () => {
  expect(marked(['Sync, syncing, SYNC and async.'], [['sync', 'syncing']])).toEqual([
    ['Sync', 'syncing', 'SYNC'],
  ]);
});

test('with nothing searched for, or no forms in the text, nothing is marked', () => {
  expect(marked(['Some text.'], [])).toEqual([[]]);
  expect(marked(['Some text.'], [[]])).toEqual([[]]);
  expect(marked([], [['text']])).toEqual([]);
});

test('punctuation between the words does not part them; another word does', () => {
  expect(marked(['End of movement. Of data, then.'], [['movement'], ['of'], ['data']])).toEqual([
    ['movement. Of data'],
  ]);
  expect(marked(['movement of the data'], [['movement'], ['of'], ['data']])).toEqual([
    ['movement', 'of', 'data'],
  ]);
});

test('a text is cut at ranges, and pieces already cut keep what they were flagged with', () => {
  const marked = flagged([{ text: 'The movement of data is here' }], [[8, 18]], 'marked');
  expect(marked).toEqual([
    { text: 'The move', marked: false },
    { text: 'ment of da', marked: true },
    { text: 'ta is here', marked: false },
  ]);
  // "movement of data" starts in the first piece and ends in the third.
  expect(flagged(marked, [[4, 20]], 'found')).toEqual([
    { text: 'The ', marked: false, found: false },
    { text: 'move', marked: false, found: true },
    { text: 'ment of da', marked: true, found: true },
    { text: 'ta', marked: false, found: true },
    { text: ' is here', marked: false, found: false },
  ]);
  expect(flagged([{ text: 'all of it' }], [], 'found')).toEqual([
    { text: 'all of it', found: false },
  ]);
  expect(flagged([{ text: 'all of it' }], [[0, 9]], 'found')).toEqual([
    { text: 'all of it', found: true },
  ]);
});

test('ranges that overlap or touch are one range', () => {
  expect(
    union([
      [10, 20],
      [0, 5],
      [15, 30],
      [5, 6],
    ]),
  ).toEqual([
    [0, 6],
    [10, 30],
  ]);
  // Two highlights that overlap are drawn as one mark.
  expect(
    flagged(
      [{ text: 'Saving was the thing. Once everything' }],
      [
        [0, 21],
        [0, 37],
      ],
      'marked',
    ),
  ).toEqual([{ text: 'Saving was the thing. Once everything', marked: true }]);
});

test("a unit's ranges are handed to each of its runs, counted from the run's start", () => {
  // A unit of two runs, "movement " and "of data"; one range crosses from the first to the second.
  expect(within([[4, 12]], 0, 9)).toEqual([[4, 9]]);
  expect(within([[4, 12]], 9, 7)).toEqual([[0, 3]]);
  expect(within([[4, 12]], 16, 5)).toEqual([]);
});
