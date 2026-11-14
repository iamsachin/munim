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

/** The ranges in order, with any that overlap or touch joined into one. */
export function union(ranges: readonly Range[]): Range[] {
  const out: [number, number][] = [];
  for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = out.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

/** The part of each range that falls inside [from, from + length), counted from `from`. */
export function within(ranges: readonly Range[], from: number, length: number): Range[] {
  return ranges
    .map(([a, b]): Range => [Math.max(a, from) - from, Math.min(b, from + length) - from])
    .filter(([a, b]) => a < b);
}

/**
 * Cuts pieces of a text at the ranges and sets `key` on each: true for what falls inside a
 * range. Pieces that were already cut (and flagged) for something else keep those flags.
 */
export function flagged<T extends { text: string }, K extends string>(
  pieces: readonly T[],
  ranges: readonly Range[],
  key: K,
): (T & Record<K, boolean>)[] {
  const out: (T & Record<K, boolean>)[] = [];
  const add = (piece: T, text: string, on: boolean) => {
    if (text) out.push({ ...piece, text, [key]: on } as T & Record<K, boolean>);
  };
  const wanted = union(ranges);
  let offset = 0;
  for (const piece of pieces) {
    const end = offset + piece.text.length;
    let at = offset;
    for (const [from, to] of wanted) {
      const start = Math.max(from, at);
      const stop = Math.min(to, end);
      if (start >= stop) continue;
      add(piece, piece.text.slice(at - offset, start - offset), false);
      add(piece, piece.text.slice(start - offset, stop - offset), true);
      at = stop;
    }
    add(piece, piece.text.slice(at - offset), false);
    offset = end;
  }
  return out;
}
