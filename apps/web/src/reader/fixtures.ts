// Mock data from design/handoff/Atrium.dc.html. Replaced by server data in milestone 3.
import type {
  Digest,
  Feed,
  HighlightEntry,
  Item,
  LaterEntry,
  Match,
  SavedItem,
  Watch,
} from './types';

export const ITEMS: Item[] = [
  {
    src: 'RD',
    title: 'What finally got you to move your feeds off five different apps?',
    sub: 'I kept losing threads I meant to come back to',
    from: 'r/selfhosted',
    replies: 214,
    age: '3h',
    unread: true,
    summary:
      'Most replies name saving and search as the reason to consolidate. A smaller group warns that API limits make replying from a third-party client unreliable.',
    comments: [
      {
        who: 'marrow_fern',
        meta: '2h · 86',
        text: 'Saving was the thing. Once everything landed in one archive I stopped opening the apps at all.',
        depth: 0,
      },
      {
        who: 'tin_orchard',
        meta: '1h · 21',
        text: 'Same, but replies still fail for me about one time in ten.',
        depth: 1,
      },
      {
        who: 'quietpacket',
        meta: '1h · 40',
        text: 'Search across all of it. I can finally find the comment I half remember.',
        depth: 0,
      },
      {
        who: 'oldbarn',
        meta: '58m · 17',
        text: 'What do you index, full text or just titles?',
        depth: 1,
      },
      {
        who: 'nine_lathes',
        meta: '44m · 28',
        text: 'API limits. I read here and still reply in the native apps.',
        depth: 0,
      },
    ],
  },
  {
    src: 'X',
    title: 'Shipped offline sync this week. The hard part was deciding which device wins',
    sub: '',
    from: '@lena_builds',
    replies: 37,
    age: '4h',
    unread: true,
    summary:
      'A nine-post thread on conflict handling. They tried last-write-wins, then per-field merges, and settled on per-field merges with a visible history.',
    comments: [
      {
        who: '@ops_notes',
        meta: '3h',
        text: 'Did you consider CRDTs or was that too heavy?',
        depth: 0,
      },
      {
        who: '@lena_builds',
        meta: '3h',
        text: 'Tried one. Storage grew faster than we liked for notes this small.',
        depth: 1,
      },
    ],
  },
  {
    src: 'HN',
    title: 'Show HN: A local-first archive for everything you read',
    sub: '',
    from: '612 points',
    replies: 388,
    age: '4h',
    unread: true,
    summary:
      'Discussion centers on storage format and search. Several commenters ask about import from existing read-later tools; the author says export came first.',
    comments: [
      { who: 'pfk', meta: '3h', text: 'Export as the first feature is the right call.', depth: 0 },
      {
        who: 'dannyw',
        meta: '2h',
        text: 'How large does the index get for 10k articles?',
        depth: 0,
      },
      { who: 'author', meta: '2h', text: 'About 400 MB with full text.', depth: 1 },
    ],
  },
  {
    src: 'YT',
    title: 'Building a home server rack from scratch',
    sub: 'video 18:24',
    from: 'Bench Hours',
    replies: 142,
    age: '5h',
    unread: true,
    summary:
      'An 18-minute build video. Chapters cover the frame, cooling, cable runs and power. The transcript is saved and searchable.',
    comments: [
      {
        who: 'railside',
        meta: '4h · 31',
        text: 'The airflow section at 9:40 is the part most people skip.',
        depth: 0,
      },
      {
        who: 'Bench Hours',
        meta: '3h · 12',
        text: 'Agreed, I added a chapter marker for it.',
        depth: 1,
      },
    ],
    media: 'Video',
  },
  {
    src: 'RSS',
    title: 'A year of running my own feed reader',
    sub: 'What broke and what I stopped reading',
    from: 'Low Tech Notes',
    replies: 0,
    age: '6h',
    unread: true,
    summary:
      'The author kept 40 of 130 feeds after a year and reads in one evening session. Polling less often fixed most reliability problems.',
    comments: [],
  },
  {
    src: 'IG',
    title: 'Glaze test 14. Same recipe, three firing schedules',
    sub: 'video 0:42',
    from: '@studio.kiln',
    replies: 12,
    age: '8h',
    unread: false,
    summary:
      'A 42-second video comparing three firing schedules on one glaze. Transcript and frames are saved.',
    comments: [
      { who: '@clay.daily', meta: '7h', text: 'The slow cool one is the best by far.', depth: 0 },
    ],
    media: 'Video',
  },
  {
    src: 'RD',
    title: 'Backups: what is your restore test schedule?',
    sub: '',
    from: 'r/homelab',
    replies: 96,
    age: '8h',
    unread: true,
    summary:
      'Most people test restores quarterly or never. The top reply recommends restoring one random file every week.',
    comments: [],
    media: 'Image',
  },
  {
    src: 'HN',
    title: 'SQLite as an application file format, ten years on',
    sub: '',
    from: '431 points',
    replies: 172,
    age: '9h',
    unread: false,
    summary:
      'Largely positive experience reports, with caveats about concurrent writers and network file systems.',
    comments: [],
  },
  {
    src: 'X',
    title: 'Reading list for the week, mostly about queues',
    sub: 'thread 1/9',
    from: '@ops_notes',
    replies: 8,
    age: '9h',
    unread: false,
    summary: 'Nine links on queueing, three of which are already in your saved items.',
    comments: [],
  },
  {
    src: 'YT',
    title: 'Conflict-free sync explained in 12 minutes',
    sub: 'video 12:07',
    from: 'Wire Talks',
    replies: 64,
    age: '10h',
    unread: false,
    summary: 'A short explainer on merge strategies for offline edits, with one worked example.',
    comments: [],
    media: 'Video',
  },
  {
    src: 'RSS',
    title: 'Notes on end-to-end encryption for small apps',
    sub: '',
    from: 'Plain Crypto',
    replies: 0,
    age: '10h',
    unread: false,
    summary:
      'A practical checklist: where keys live, how recovery works, and what the server can still see.',
    comments: [],
  },
  {
    src: 'RD',
    title: 'Is anyone still using RSS for release notes?',
    sub: '',
    from: 'r/rss',
    replies: 58,
    age: '11h',
    unread: false,
    summary:
      'Yes, widely. Most code hosts still publish release feeds and several people list the URL patterns.',
    comments: [],
  },
  {
    src: 'RSS',
    title: 'The case for boring sync protocols',
    sub: '',
    from: 'Wire Notes',
    replies: 0,
    age: '12h',
    unread: false,
    summary: 'Argues for periodic full sync with checksums over clever incremental schemes.',
    comments: [],
  },
  {
    src: 'IG',
    title: 'New studio shelving finally up',
    sub: 'photo',
    from: '@studio.kiln',
    replies: 4,
    age: '13h',
    unread: false,
    summary: 'One photo, four comments.',
    comments: [],
    media: 'Image',
  },
  {
    src: 'HN',
    title: 'Ask HN: How do you keep track of long discussions?',
    sub: '',
    from: '208 points',
    replies: 143,
    age: '14h',
    unread: false,
    summary: 'Answers split between summaries, saved highlights and simply not trying.',
    comments: [],
  },
  {
    src: 'X',
    title: 'Rate limits changed again. Summary of what moved',
    sub: '',
    from: '@api_watch',
    replies: 61,
    age: '15h',
    unread: false,
    summary: 'Read limits dropped for the free tier; posting limits are unchanged.',
    comments: [],
    media: 'Image',
  },
  {
    src: 'YT',
    title: 'Kiln firing schedules, a full walkthrough',
    sub: 'video 41:30',
    from: 'Studio Kiln',
    replies: 23,
    age: '18h',
    unread: false,
    summary: 'A 41-minute walkthrough of four firing schedules. Chapters and transcript are saved.',
    comments: [],
    media: 'Video',
  },
  {
    src: 'RD',
    title: 'Summarizing 400-comment threads: what actually works',
    sub: '',
    from: 'r/LocalLLaMA',
    replies: 187,
    age: '22h',
    unread: false,
    summary:
      'Chunking by reply tree beats chunking by length. People recommend summarizing each top-level branch, then merging.',
    comments: [],
    media: 'Image',
  },
];

export const SAVED: SavedItem[] = [
  {
    kind: 'Video',
    src: 'IG',
    title: 'Glaze test 14. Same recipe, three firing schedules',
    from: '@studio.kiln',
    parsed: 'Transcript · 12 frames',
    when: 'Today',
  },
  {
    kind: 'Thread',
    src: 'RD',
    title: 'What finally got you to move your feeds off five different apps?',
    from: 'r/selfhosted',
    parsed: 'Summary · 214 comments',
    when: 'Today',
  },
  {
    kind: 'Thread',
    src: 'HN',
    title: 'Show HN: A local-first archive for everything you read',
    from: '612 points',
    parsed: 'Summary · 388 comments',
    when: 'Today',
  },
  {
    kind: 'Article',
    src: 'RSS',
    title: 'Notes on end-to-end encryption for small apps',
    from: 'Plain Crypto',
    parsed: 'Full text',
    when: 'Today',
  },
  {
    kind: 'Video',
    src: 'YT',
    title: 'Conflict-free sync explained in 12 minutes',
    from: 'Wire Talks',
    parsed: 'Transcript · chapters',
    when: 'Yesterday',
  },
  {
    kind: 'Post',
    src: 'X',
    title: 'Small thing: export should be the first feature, not the last',
    from: '@lena_builds',
    parsed: 'Text',
    when: 'Yesterday',
  },
  {
    kind: 'Video',
    src: 'RD',
    title: 'Rack tour: 12U in a closet',
    from: 'r/homelab',
    parsed: 'Transcript · processing',
    when: 'Yesterday',
  },
  {
    kind: 'Thread',
    src: 'RD',
    title: 'Summarizing 400-comment threads: what actually works',
    from: 'r/LocalLLaMA',
    parsed: 'Summary · 187 comments',
    when: 'Mon',
  },
  {
    kind: 'Article',
    src: 'RSS',
    title: 'The case for boring sync protocols',
    from: 'Wire Notes',
    parsed: 'Full text',
    when: 'Mon',
  },
  {
    kind: 'Post',
    src: 'X',
    title: 'Rate limits changed again. Summary of what moved',
    from: '@api_watch',
    parsed: 'Text · 2 images',
    when: 'Sun',
  },
  {
    kind: 'Video',
    src: 'IG',
    title: 'Kiln opening, Saturday batch',
    from: '@studio.kiln',
    parsed: 'Transcript · 20 frames',
    when: 'Sat',
  },
  {
    kind: 'Article',
    src: 'RSS',
    title: 'Designing a calendar that does less',
    from: 'Field Notes',
    parsed: 'Full text',
    when: 'Fri',
  },
  {
    kind: 'Thread',
    src: 'HN',
    title: 'Passkeys in practice after a year',
    from: '290 points',
    parsed: 'Summary · 201 comments',
    when: 'Thu',
  },
];

export const FEEDS: Feed[] = [
  {
    name: 'Low Tech Notes',
    articles: [
      {
        title: 'A year of running my own feed reader',
        meta: '6h · 12 min',
        summary: 'The author kept 40 of 130 feeds after a year and reads in one evening session.',
        body: 'I started the year with 130 feeds and a habit of opening the reader whenever I was bored. By March the unread count had become a second inbox. What fixed it was not a feature. I stopped polling every fifteen minutes, moved to twice a day, and deleted any feed I had skipped ten times in a row.',
      },
      {
        title: 'Reading in the evening, a short essay',
        meta: '1d · 5 min',
        summary: 'A short case for reading once a day at a fixed time.',
        body: 'There is a particular quiet to reading things after they have stopped being new. Most of what felt urgent at noon has resolved itself by nine.',
      },
    ],
  },
  {
    name: 'Plain Crypto',
    articles: [
      {
        title: 'Notes on end-to-end encryption for small apps',
        meta: '10h · 9 min',
        summary:
          'A checklist: where keys live, how recovery works, and what the server can still see.',
        body: 'Before choosing a cipher, write down what the server is allowed to know. For most small apps the honest answer includes sizes, timestamps and who talks to whom. Decide whether that is acceptable, then design recovery, because recovery is where most schemes quietly give the server a copy of the key.',
      },
    ],
  },
  {
    name: 'Wire Notes',
    articles: [
      {
        title: 'The case for boring sync protocols',
        meta: '12h · 7 min',
        summary: 'Argues for periodic full sync with checksums over clever incremental schemes.',
        body: 'Incremental sync is fast until it is wrong, and when it is wrong it is wrong silently. A periodic full comparison with checksums is slow, predictable, and tells you when something drifted.',
      },
      {
        title: 'What a retry budget is',
        meta: '2d · 4 min',
        summary: 'Defines retry budgets and shows one worked example.',
        body: 'A retry budget caps the share of requests that may be retries. Ten percent is a common starting point.',
      },
    ],
  },
  {
    name: 'Field Notes',
    articles: [
      {
        title: 'Designing a calendar that does less',
        meta: '19h · 8 min',
        summary: 'A calendar that shows only today and the next thing.',
        body: 'Most calendar views answer a question nobody asked: what does the whole month look like. The question people ask is what is next, and how long until it starts.',
      },
    ],
  },
  {
    name: 'Release notes',
    articles: [
      {
        title: 'Reader 4.2: faster full-text search',
        meta: '1d · 2 min',
        summary: 'Search index rebuilt; queries are about three times faster.',
        body: 'This release rebuilds the search index. Existing libraries are migrated in the background on first launch.',
      },
    ],
  },
];

export const HIGHLIGHTS: HighlightEntry[] = [
  {
    quote: 'Recovery is where most schemes quietly give the server a copy of the key.',
    note: 'Check this against our own recovery flow.',
    src: 'RSS',
    title: 'Notes on end-to-end encryption for small apps',
    from: 'Plain Crypto',
    when: 'Today',
  },
  {
    quote: 'Chunking by reply tree beats chunking by length.',
    note: '',
    src: 'RD',
    title: 'Summarizing 400-comment threads: what actually works',
    from: 'r/LocalLLaMA',
    when: 'Yesterday',
  },
  {
    quote: 'Incremental sync is fast until it is wrong, and when it is wrong it is wrong silently.',
    note: 'Good argument for a weekly full check.',
    src: 'RSS',
    title: 'The case for boring sync protocols',
    from: 'Wire Notes',
    when: 'Mon',
  },
  {
    quote: 'Export should be the first feature, not the last.',
    note: '',
    src: 'X',
    title: 'Small thing: export should be the first feature',
    from: '@lena_builds',
    when: 'Mon',
  },
  {
    quote: 'The airflow section at 9:40 is the part most people skip.',
    note: 'Rewatch before ordering fans.',
    src: 'YT',
    title: 'Building a home server rack from scratch',
    from: 'Bench Hours',
    when: 'Sun',
  },
];

export const LATER: LaterEntry[] = [
  {
    src: 'RSS',
    title: 'Notes on end-to-end encryption for small apps',
    from: 'Plain Crypto',
    mins: 9,
    added: 'Today',
  },
  {
    src: 'YT',
    title: 'Kiln firing schedules, a full walkthrough',
    from: 'Studio Kiln',
    mins: 42,
    added: 'Today',
  },
  {
    src: 'HN',
    title: 'SQLite as an application file format, ten years on',
    from: '431 points',
    mins: 14,
    added: 'Yesterday',
  },
  {
    src: 'RSS',
    title: 'Designing a calendar that does less',
    from: 'Field Notes',
    mins: 8,
    added: 'Yesterday',
  },
  {
    src: 'X',
    title: 'Reading list for the week, mostly about queues',
    from: '@ops_notes',
    mins: 6,
    added: 'Mon',
  },
  {
    src: 'RD',
    title: 'Backups: what is your restore test schedule?',
    from: 'r/homelab',
    mins: 11,
    added: 'Mon',
  },
];

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
