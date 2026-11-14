// Mock data from design/handoff/Atrium.dc.html. Replaced by server data in milestone 3.
import type { Digest, Match, Watch } from './types';

export const WATCHES: Watch[] = [
  { name: 'rate limits', kind: 'Keyword', where: 'All sources', count: 7, last: '15h ago' },
  { name: '@lena_builds', kind: 'Person', where: 'X', count: 3, last: '4h ago' },
  { name: 'local-first', kind: 'Topic', where: 'Hacker News, RSS', count: 5, last: '4h ago' },
  { name: 'kiln', kind: 'Keyword', where: 'Instagram, YouTube', count: 4, last: '8h ago' },
  { name: 'Actual Budget', kind: 'Keyword', where: 'Reddit', count: 0, last: 'No matches' },
];

export const MATCHES: Match[] = [
  {
    watch: 'local-first',
    src: 'HN',
    title: 'Show HN: A local-first archive for everything you read',
    age: '4h',
  },
  {
    watch: '@lena_builds',
    src: 'X',
    title: 'Shipped offline sync this week. The hard part was deciding which device wins',
    age: '4h',
  },
  {
    watch: 'kiln',
    src: 'IG',
    title: 'Glaze test 14. Same recipe, three firing schedules',
    age: '8h',
  },
  {
    watch: 'rate limits',
    src: 'X',
    title: 'Rate limits changed again. Summary of what moved',
    age: '15h',
  },
  { watch: 'kiln', src: 'YT', title: 'Kiln firing schedules, a full walkthrough', age: '18h' },
  {
    watch: 'rate limits',
    src: 'RD',
    title: 'What finally got you to move your feeds off five different apps?',
    age: '3h',
  },
];

export const DIGESTS: Record<'Daily' | 'Weekly', Digest> = {
  Daily: {
    title: 'Saturday 14 November',
    lead: 'Eighteen new items since yesterday evening. Two threads you replied to have new answers. The busiest discussion is the Hacker News thread on a local-first reading archive, and three of your watches matched.',
    sections: [
      {
        head: 'Threads worth opening',
        text: 'The r/selfhosted thread on consolidating feeds reached 214 comments, and tin_orchard replied to you there. The Show HN thread has 388 comments, mostly about storage format and import.',
        items: [
          { src: 'RD', title: 'What finally got you to move your feeds off five different apps?' },
          { src: 'HN', title: 'Show HN: A local-first archive for everything you read' },
        ],
      },
      {
        head: 'From your feeds',
        text: 'Low Tech Notes published a year-in-review of running a feed reader. Plain Crypto posted a checklist on end-to-end encryption that overlaps with two items you saved last week.',
        items: [
          { src: 'RSS', title: 'A year of running my own feed reader' },
          { src: 'RSS', title: 'Notes on end-to-end encryption for small apps' },
        ],
      },
      {
        head: 'Video',
        text: 'Three new videos, about 72 minutes in total. Transcripts are ready for all three.',
        items: [
          { src: 'YT', title: 'Building a home server rack from scratch' },
          { src: 'YT', title: 'Conflict-free sync explained in 12 minutes' },
        ],
      },
      {
        head: 'Watches',
        text: 'Matches for local-first, @lena_builds and kiln. Nothing new for Actual Budget.',
        items: [],
      },
    ],
  },
  Weekly: {
    title: 'Week of 9 November',
    lead: 'You opened 96 items, saved 13 and replied 6 times this week. Sync and local-first storage came up in four separate sources. Six items are still in your read later queue.',
    sections: [
      {
        head: 'Most discussed',
        text: 'The two largest threads were the Show HN archive post and the r/LocalLLaMA thread on summarizing long discussions.',
        items: [
          { src: 'HN', title: 'Show HN: A local-first archive for everything you read' },
          { src: 'RD', title: 'Summarizing 400-comment threads: what actually works' },
        ],
      },
      {
        head: 'Recurring topics',
        text: 'Sync protocols appeared in Wire Notes, a thread from @lena_builds and a Wire Talks video. Rate limits appeared seven times, mostly on X.',
        items: [
          { src: 'RSS', title: 'The case for boring sync protocols' },
          { src: 'X', title: 'Rate limits changed again. Summary of what moved' },
        ],
      },
      {
        head: 'What you saved',
        text: 'Thirteen items: four videos, four threads, three articles and two posts. You added five highlights.',
        items: [],
      },
      {
        head: 'Feeds you skipped',
        text: 'You have not opened anything from Release notes in three weeks.',
        items: [],
      },
    ],
  },
};
