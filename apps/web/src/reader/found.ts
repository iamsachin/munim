// Search matches inside an article: where the words that were searched for are, so they can
// be marked. The server says which of the article's words match each word searched for (it
// knows that "movements" is a form of "movement"); this finds them in the text.

/** [start, end) in a piece of text. */
export type Range = readonly [number, number];

const WORD = /[\p{L}\p{N}]+/gu;

/**
 * For each text, the ranges to mark. If the words searched for appear together, in order,
 * anywhere in the texts, only those places are marked: that is what the search found. If they
 * appear nowhere together, every one of them is marked wherever it is.
 */
export function findMatches(
  texts: readonly string[],
  found: readonly (readonly string[])[],
): Range[][] {
  const forms = found.map((words) => new Set(words));
  const none = texts.map((): Range[] => []);
  if (forms.length === 0) return none;

  const tokens = texts.map((text) =>
    [...text.matchAll(WORD)].map((m) => ({ word: m[0].toLowerCase(), at: m.index })),
  );
  const together = tokens.map((list) => {
    const ranges: Range[] = [];
    for (let i = 0; i + forms.length <= list.length; i++) {
      if (!forms.every((set, n) => set.has(list[i + n]?.word ?? ''))) continue;
      const first = list[i];
      const last = list[i + forms.length - 1];
      if (!first || !last) continue;
      ranges.push([first.at, last.at + last.word.length]);
      i += forms.length - 1;
    }
    return ranges;
  });
  if (together.some((ranges) => ranges.length > 0)) return together;

  const any = new Set(found.flat());
  return tokens.map((list) =>
    list.filter((t) => any.has(t.word)).map((t): Range => [t.at, t.at + t.word.length]),
  );
}

/** Cuts already-cut pieces of a text again at the ranges, flagging what falls inside one. */
export function withFound<T extends { text: string }>(
  pieces: readonly T[],
  ranges: readonly Range[],
): (T & { found: boolean })[] {
  const out: (T & { found: boolean })[] = [];
  let offset = 0;
  for (const piece of pieces) {
    const end = offset + piece.text.length;
    let at = offset;
    for (const [from, to] of ranges) {
      const start = Math.max(from, at);
      const stop = Math.min(to, end);
      if (start >= stop) continue;
      if (start > at) {
        out.push({ ...piece, text: piece.text.slice(at - offset, start - offset), found: false });
      }
      out.push({ ...piece, text: piece.text.slice(start - offset, stop - offset), found: true });
      at = stop;
    }
    if (at < end) out.push({ ...piece, text: piece.text.slice(at - offset), found: false });
    offset = end;
  }
  return out;
}
