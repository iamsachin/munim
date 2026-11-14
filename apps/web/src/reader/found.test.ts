import { expect, test } from 'vitest';
import { findMatches, withFound } from './found';

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

test('pieces already cut for highlights are cut again around a match', () => {
  const pieces = [
    { text: 'The move', marked: false },
    { text: 'ment of da', marked: true },
    { text: 'ta is here', marked: false },
  ];
  // "movement of data" starts in the first piece and ends in the third.
  expect(withFound(pieces, [[4, 20]])).toEqual([
    { text: 'The ', marked: false, found: false },
    { text: 'move', marked: false, found: true },
    { text: 'ment of da', marked: true, found: true },
    { text: 'ta', marked: false, found: true },
    { text: ' is here', marked: false, found: false },
  ]);
  expect(withFound(pieces, [])).toEqual(pieces.map((p) => ({ ...p, found: false })));
});
