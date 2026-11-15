import type { Source } from '../ui/atoms';

/**
 * Where Munim cannot write back, and what it says instead of a reply box. A source that is not
 * listed can be replied to; none can yet. Only official write APIs will count.
 */
export const NO_REPLY: Partial<Record<Source, string>> = {
  RD: 'Replying on Reddit is not available yet.',
  X: 'Replying on X is not available yet.',
  IG: 'Replying on Instagram is not available yet.',
  HN: 'Hacker News has no official way to reply from another app.',
  YT: 'Replying on YouTube is not available yet.',
  RSS: 'Feeds have no replies.',
};
