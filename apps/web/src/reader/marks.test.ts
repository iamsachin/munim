import { expect, test } from 'vitest';
import { HIGHLIGHTS } from './fixtures';
import { splitMarks, withHighlight } from './marks';

const pieces = (text: string, quotes: string[]) =>
  splitMarks(text, quotes).map((p) => (p.marked ? `[${p.text}]` : p.text));

test('quotes are marked wherever they occur, ignoring case, with the text kept as written', () => {
  expect(pieces('Design recovery first, because recovery is hard.', ['Recovery'])).toEqual([
    'Design ',
    '[recovery]',
    ' first, because ',
    '[recovery]',
    ' is hard.',
  ]);
});

test('text with no quotes, or no matching quote, comes back whole', () => {
  expect(pieces('Nothing to see.', [])).toEqual(['Nothing to see.']);
  expect(pieces('Nothing to see.', ['elsewhere', '  '])).toEqual(['Nothing to see.']);
  expect(pieces('', ['x'])).toEqual([]);
});

test('a quote at either end leaves no empty piece', () => {
  expect(pieces('all of it', ['all of it'])).toEqual(['[all of it]']);
  expect(pieces('start and end', ['start', 'end'])).toEqual(['[start]', ' and ', '[end]']);
});

test('characters that mean something in a pattern are matched literally', () => {
  expect(pieces('Is it 9:40 (or later)? Yes.', ['9:40 (or later)?'])).toEqual([
    'Is it ',
    '[9:40 (or later)?]',
    ' Yes.',
  ]);
});

test('a longer quote wins over a shorter one inside it', () => {
  expect(pieces('full sync with checksums', ['sync', 'full sync with checksums'])).toEqual([
    '[full sync with checksums]',
  ]);
});

test('a new highlight goes first, trimmed, without a note; a repeat is ignored', () => {
  const entry = {
    quote: '  Saving was the thing. ',
    src: 'RD',
    title: 'A thread',
    from: 'r/x',
  } as const;
  const once = withHighlight(HIGHLIGHTS, entry);
  expect(once).toHaveLength(HIGHLIGHTS.length + 1);
  expect(once[0]).toEqual({
    quote: 'Saving was the thing.',
    note: '',
    when: 'Now',
    src: 'RD',
    title: 'A thread',
    from: 'r/x',
  });
  expect(withHighlight(once, entry)).toBe(once);
  expect(withHighlight(HIGHLIGHTS, { ...entry, quote: '   ' })).toBe(HIGHLIGHTS);
});
