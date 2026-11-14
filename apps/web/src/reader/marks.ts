import type { Source } from '../ui/atoms';
import type { HighlightEntry } from './types';

/**
 * Where Munim cannot write back, and what it says instead of a reply box. A source that is not
 * listed can be replied to; none can yet. Only official write APIs will count.
 */
export const NO_REPLY: Partial<Record<Source, string>> = {
  RD: 'Replying on Reddit arrives with the Reddit connection.',
  X: 'Replying on X is not available yet.',
  IG: 'Replying on Instagram is not available yet.',
  HN: 'Hacker News has no official way to reply from another app.',
  YT: 'Replying on YouTube is not available yet.',
  RSS: 'Feeds have no replies.',
};

export const highlightKey = (h: Pick<HighlightEntry, 'title' | 'quote'>) =>
  `${h.title}\n${h.quote}`;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Cuts `text` into pieces, flagging the ones that are a highlighted quote. Matching ignores case,
 * and longer quotes win, so a quote inside another one does not break it up.
 */
export function splitMarks(text: string, quotes: readonly string[]) {
  const wanted = quotes.map((q) => q.trim()).filter(Boolean);
  if (wanted.length === 0) return text ? [{ text, marked: false }] : [];
  const longestFirst = [...wanted].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${longestFirst.map(escape).join('|')})`, 'gi');
  // With one capturing group, split() alternates plain text and matches.
  return text
    .split(pattern)
    .map((part, i) => ({ text: part, marked: i % 2 === 1 }))
    .filter((piece) => piece.text !== '');
}

/** The highlights with a new one in front. The same quote from the same item is not added twice. */
export function withHighlight(
  highlights: readonly HighlightEntry[],
  entry: Omit<HighlightEntry, 'note' | 'when'>,
): readonly HighlightEntry[] {
  const quote = entry.quote.trim();
  if (!quote) return highlights;
  const fresh = { ...entry, quote, note: '', when: 'Now' };
  return highlights.some((h) => highlightKey(h) === highlightKey(fresh))
    ? highlights
    : [fresh, ...highlights];
}
