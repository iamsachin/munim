import { Found, Highlight } from '../ui/atoms';
import { withFound, type Range } from './found';
import { splitMarks } from './marks';

/**
 * Text with the owner's highlighted quotes marked in place and, when it was opened from a
 * search, the words the search matched.
 */
export function Marked({
  text,
  quotes,
  found = [],
}: {
  text: string;
  quotes: readonly string[];
  found?: readonly Range[];
}) {
  return withFound(splitMarks(text, quotes), found).map((piece, i) => {
    const words = piece.found ? <Found key={i}>{piece.text}</Found> : piece.text;
    return piece.marked ? <Highlight key={i}>{words}</Highlight> : words;
  });
}

/**
 * Put on the element whose text can be highlighted. SelectionHighlight reads these to know which
 * item a selection belongs to.
 */
export const highlightable = (item: { src: string; title: string; from: string }) => ({
  'data-highlight-src': item.src,
  'data-highlight-title': item.title,
  'data-highlight-from': item.from,
});
