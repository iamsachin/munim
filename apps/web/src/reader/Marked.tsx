import { Highlight } from '../ui/atoms';
import { splitMarks } from './marks';

/** Text with the owner's highlighted quotes marked in place. */
export function Marked({ text, quotes }: { text: string; quotes: readonly string[] }) {
  return splitMarks(text, quotes).map((piece, i) =>
    piece.marked ? <Highlight key={i}>{piece.text}</Highlight> : piece.text,
  );
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
