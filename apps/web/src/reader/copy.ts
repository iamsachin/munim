/** What each list says when it is empty. One place, so the voice stays the same. */
export const EMPTY = {
  filter: 'Nothing matches this filter.',
  stream: 'Nothing here yet. Connect a source and its items appear here.',
  newItems: 'Nothing new since yesterday.',
  repliesToYou: 'No replies to you.',
  replies: 'No replies yet.',
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
