/** What each list says when it is empty. One place, so the voice stays the same. */
export const EMPTY = {
  filter: 'Nothing matches this filter.',
  stream: 'Nothing here yet. Connect a source and its items appear here.',
  newItems: 'Nothing new since yesterday.',
  repliesToYou: 'No replies to you.',
  replies: 'No replies yet.',
  youtubeComments: 'YouTube comments are not fetched.',
  later: 'The queue is empty.',
  saved: 'Nothing saved yet.',
  highlights: 'No highlights yet.',
  feeds: 'No feeds yet. Add one below.',
  articles: 'No articles fetched yet.',
  digest: 'No digest yet. The first one is written at 7:00.',
  watches: 'No watches yet. Add a keyword, person or topic.',
  matches: 'No matches yet.',
  asks: 'Nothing asked yet.',
  usage: 'No AI use in this period.',
} as const;

/**
 * What removing a feed does to its articles, said before it is done. `kept` of them are ones the
 * owner saved, queued or highlighted: those stay.
 */
export function removalOf({ articles, kept }: { articles: number; kept: number }) {
  const count = (n: number, noun: string) => `${String(n)} ${noun}${n === 1 ? '' : 's'}`;
  const gone = articles - kept;
  if (articles === 0) return 'It has no articles.';
  if (kept === 0) return `Its ${count(gone, 'article')} ${gone === 1 ? 'is' : 'are'} deleted.`;
  const yours = `you saved, queued or highlighted ${kept === 1 ? 'is' : 'are'} kept`;
  if (gone === 0) return `Its ${count(kept, 'article')} ${yours}. Nothing is deleted.`;
  return `${count(gone, 'article')} ${gone === 1 ? 'is' : 'are'} deleted. The ${String(kept)} ${yours}.`;
}

/**
 * Sources Munim cannot read, and why, in one line each. Only official ways in are used, and
 * these have none open to a personal reader today.
 */
export const UNAVAILABLE = {
  RD: 'Reddit must approve an app before it may read anything.',
  X: 'X charges for every post an app reads.',
  IG: 'Instagram has no official way to read a personal feed.',
} as const;
