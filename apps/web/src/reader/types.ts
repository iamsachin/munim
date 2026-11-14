import type { Source } from '../ui/atoms';

export type MediaKind = 'Video' | 'Image';

export interface Comment {
  who: string;
  meta: string;
  text: string;
  /** Nesting level, 0 for a top-level reply. */
  depth: number;
}

export interface Item {
  src: Source;
  title: string;
  /** Secondary line: a subtitle, or a media note such as "video 18:24". */
  sub: string;
  /** Where it came from: subreddit, handle, feed name or score. */
  from: string;
  replies: number;
  age: string;
  unread: boolean;
  comments: Comment[];
  media?: MediaKind;
}

export type SavedKind = 'Video' | 'Thread' | 'Article' | 'Post';

export interface SavedItem {
  kind: SavedKind;
  src: Source;
  title: string;
  from: string;
  parsed: string;
  when: string;
}

export interface HighlightEntry {
  quote: string;
  note: string;
  src: Source;
  title: string;
  from: string;
  when: string;
}

export interface LaterEntry {
  src: Source;
  title: string;
  from: string;
  mins: number;
  added: string;
}

export interface Watch {
  name: string;
  kind: string;
  where: string;
  count: number;
  last: string;
}

export interface Match {
  watch: string;
  src: Source;
  title: string;
  age: string;
}

export interface Digest {
  title: string;
  lead: string;
  sections: { head: string; text: string; items: { src: Source; title: string }[] }[];
}
