import { Found, Highlight } from '../ui/atoms';
import { flagged, type Range } from './found';

/**
 * A run of text with the owner's highlights marked in place and, when it was opened from a
 * search, the words the search matched. The ranges count from the start of this text.
 */
export function Marked({
  text,
  marked,
  found,
}: {
  text: string;
  marked: readonly Range[];
  found: readonly Range[];
}) {
  return flagged(flagged([{ text }], marked, 'marked'), found, 'found').map((piece, i) => {
    const words = piece.found ? <Found key={i}>{piece.text}</Found> : piece.text;
    return piece.marked ? <Highlight key={i}>{words}</Highlight> : words;
  });
}
