// An item's text as the runs that can be highlighted and searched, and what to mark in each.
import type { ItemDetail } from '../api/client';
import { findMatches, type Range } from './found';

export type Block = ItemDetail['blocks'][number];
export type Span = Extract<Block, { type: 'paragraph' }>['spans'][number];
export type Place = ItemDetail['highlights'][number];

/** Words an item is opened at, from a citation: which reply they are in (null for the item's own
 * text), and the words. */
export interface Cited {
  reply: number | null;
  quote: string;
}

/** What to mark in one unit: the owner's highlights, and what a search matched. */
export interface Marks {
  marked: Range[];
  found: Range[];
}

/** How many units a block is: a list is one per item; code, images and videos are none. */
export const unitCount = (block: Block) =>
  block.type === 'list' ? block.items.length : 'spans' in block ? 1 : 0;

/**
 * The units of some blocks, in reading order: each paragraph, heading, paragraph of a quotation
 * and list item is one. A highlight is stored as a unit's number and the characters within it.
 */
export const unitsOf = (blocks: readonly Block[]): (readonly Span[])[] =>
  blocks.flatMap((block) =>
    block.type === 'list' ? block.items : 'spans' in block ? [block.spans] : [],
  );

/**
 * What to mark, for every unit of every part of an item. The parts are its own text, then each
 * reply in turn.
 *
 * A highlight is marked where it was made if those characters are still its words. If the text
 * has changed since (a feed corrected an article, a discussion grew and the replies moved), it
 * is found again by its words, wherever they now are. Only the item's own text is searched, so
 * only it has search matches. Words the item was opened at (`cited`) are marked as a match is,
 * wherever they are.
 */
export function marksFor(
  parts: readonly (readonly Block[])[],
  highlights: readonly Place[],
  found: readonly (readonly string[])[],
  cited?: Cited,
): Marks[][] {
  const texts = parts.map((blocks) =>
    unitsOf(blocks).map((spans) => spans.map((span) => span.text).join('')),
  );
  const marks = texts.map((units) => units.map((): Marks => ({ marked: [], found: [] })));

  for (const { reply, unit, start, end, quote } of highlights) {
    const part = reply === null ? 0 : reply + 1;
    if (texts[part]?.[unit]?.slice(start, end) === quote) {
      marks[part]?.[unit]?.marked.push([start, end]);
      continue;
    }
    const words = quote.toLowerCase();
    search: for (const [p, units] of texts.entries()) {
      for (const [u, text] of units.entries()) {
        const at = text.toLowerCase().indexOf(words);
        if (at < 0) continue;
        marks[p]?.[u]?.marked.push([at, at + quote.length]);
        break search;
      }
    }
  }

  findMatches(texts[0] ?? [], found).forEach((ranges, u) => {
    const unit = marks[0]?.[u];
    if (unit) unit.found = ranges;
  });

  if (cited) {
    const words = cited.quote.toLowerCase();
    // Looked for where they are said to be, then everywhere: replies move as a discussion grows.
    const first = cited.reply === null ? 0 : cited.reply + 1;
    look: for (const p of [first, ...texts.keys()]) {
      for (const [u, text] of (texts[p] ?? []).entries()) {
        const at = text.toLowerCase().indexOf(words);
        if (at < 0) continue;
        marks[p]?.[u]?.found.push([at, at + words.length]);
        break look;
      }
    }
  }
  return marks;
}
