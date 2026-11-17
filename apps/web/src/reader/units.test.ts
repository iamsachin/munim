import { expect, test } from 'vitest';
import { marksFor, unitsOf, type Block, type Place } from './units';

const span = (text: string, marks: ('bold' | 'italic' | 'code')[] = []) => ({
  text,
  marks,
  href: null,
});
const paragraph = (...texts: string[]): Block => ({
  type: 'paragraph',
  spans: texts.map((text, i) => span(text, i % 2 ? ['bold'] : [])),
});
const place = (unit: number, start: number, quote: string, reply: number | null = null): Place => ({
  id: 1,
  reply,
  unit,
  start,
  end: start + quote.length,
  quote,
});

const ARTICLE: Block[] = [
  paragraph('Incremental sync is ', 'fast', ' until it is wrong.'),
  { type: 'code', text: 'sync --full' },
  { type: 'list', ordered: false, items: [[span('Check weekly')], [span('Keep a log')]] },
  { type: 'image', src: '/x', alt: '' },
  { type: 'quote', spans: [span('Wrong silently.')] },
];

test('each paragraph, list item and quotation is a unit; code and images are none', () => {
  expect(unitsOf(ARTICLE).map((spans) => spans.map((s) => s.text).join(''))).toEqual([
    'Incremental sync is fast until it is wrong.',
    'Check weekly',
    'Keep a log',
    'Wrong silently.',
  ]);
});

test('a highlight is marked where it was made, even across bold text', () => {
  // "is fast until" starts in plain text, crosses the bold word and ends in plain text.
  const [text] = marksFor([ARTICLE], [place(0, 17, 'is fast until'), place(2, 0, 'Keep')], []);
  expect(text?.map((unit) => unit.marked)).toEqual([[[17, 30]], [], [[0, 4]], []]);
});

test('if the text has changed, a highlight is found again by its words, in any case', () => {
  const stale = place(0, 3, 'WRONG SILENTLY');
  const [text] = marksFor([ARTICLE], [stale], []);
  expect(text?.map((unit) => unit.marked)).toEqual([[], [], [], [[0, 14]]]);
  // Words that are no longer anywhere are simply not marked.
  expect(
    marksFor([ARTICLE], [place(0, 0, 'gone entirely')], [])
      .flat()
      .flatMap((u) => u.marked),
  ).toEqual([]);
});

test('a highlight in a reply is marked in that reply, or wherever its words went', () => {
  const replies = [[paragraph('Agreed.')], [paragraph('Export first is right.')]];
  const marks = marksFor([ARTICLE, ...replies], [place(0, 0, 'Export first', 1)], []);
  expect(marks[2]?.[0]?.marked).toEqual([[0, 12]]);
  // The discussion grew and the reply is now the first one: it is found by its words.
  const moved = marksFor([ARTICLE, replies[1] ?? []], [place(0, 0, 'Export first', 1)], []);
  expect(moved[1]?.[0]?.marked).toEqual([[0, 12]]);
});

test('search matches are found across bold text, in the item and in its replies', () => {
  const found = [['sync'], ['is'], ['fast']];
  const marks = marksFor([ARTICLE, [paragraph('Agreed.')], [paragraph('sync is fast')]], [], found);
  expect(marks[0]?.[0]?.found).toEqual([[12, 24]]);
  expect(marks[1]?.[0]?.found).toEqual([]);
  expect(marks[2]?.[0]?.found).toEqual([[0, 12]]);
  // Words only a reply has are marked there.
  const reply = marksFor([ARTICLE, [paragraph('Keep a ledger.')]], [], [['ledger']]);
  expect(reply[0]?.every((unit) => unit.found.length === 0)).toBe(true);
  expect(reply[1]?.[0]?.found).toEqual([[7, 13]]);
});

test('words an item was opened at are marked as a match, where they are said to be or wherever they went', () => {
  const replies = [[paragraph('Agreed.')], [paragraph('Export ', 'first', ' is right.')]];
  // In a reply, whatever their case, across bold text.
  const marks = marksFor([ARTICLE, ...replies], [], [], { reply: 1, quote: 'export first is' });
  expect(marks[2]?.[0]?.found).toEqual([[0, 15]]);
  expect(marks.flat().filter((unit) => unit.found.length)).toHaveLength(1);
  // The reply has moved: the words are found where they now are. In the item's own text too.
  const moved = marksFor([ARTICLE, replies[1] ?? []], [], [], { reply: 4, quote: 'first is' });
  expect(moved[1]?.[0]?.found).toEqual([[7, 15]]);
  const own = marksFor([ARTICLE, ...replies], [], [], { reply: null, quote: 'Keep a log' });
  expect(own[0]?.[2]?.found).toEqual([[0, 10]]);
  // Words that are nowhere mark nothing.
  const none = marksFor([ARTICLE], [], [], { reply: null, quote: 'cheese' });
  expect(none.flat().every((unit) => unit.found.length === 0)).toBe(true);
});
