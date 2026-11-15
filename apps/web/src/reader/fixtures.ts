// Mock data from design/handoff/Atrium.dc.html. Replaced by server data in milestone 3.
import type { Match, Watch } from './types';

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
