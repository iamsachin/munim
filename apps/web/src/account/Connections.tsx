import { useState } from 'react';
import { age, useHackerNews, useSetHackerNews } from '../reader/queries';
import { toggled, useReader } from '../reader/store';
import { SourceTag, SOURCES, StatusDot, type Source } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Cell, Table, TableHeader, TableRow, Th } from '../ui/Table';

const COLS = 'grid-cols-[34px_110px_minmax(80px,1fr)_minmax(0,150px)_90px_110px_100px]';

// Mock, from the handoff, except Access: only Reddit can be written to (see NO_REPLY), and
// except Hacker News, whose row shows what the server says.
const CONNECTED: { src: Source; account: string; access: string; sync: string }[] = [
  { src: 'RD', account: 'u/you', access: 'Read, reply, vote', sync: '2 min ago' },
  { src: 'X', account: '@you', access: 'Read', sync: '5 min ago' },
  { src: 'IG', account: '@you', access: 'Read', sync: '14 min ago' },
  { src: 'HN', account: 'Front page', access: 'Read', sync: '' },
  { src: 'YT', account: 'Your subscriptions', access: 'Read', sync: '9 min ago' },
  { src: 'RSS', account: '5 feeds', access: 'Read', sync: '31 min ago' },
];
const PLANNED = [
  ['CAL', 'Calendar'],
  ['ML', 'Mail'],
  ['BUD', 'Budget'],
] as const;

export function Connections() {
  const { state, update } = useReader();
  const hackerNews = useHackerNews();
  const setHackerNews = useSetHackerNews();
  const [now] = useState(() => Date.now());

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      {/* The handoff adds a line here about token encryption. It returns, worded truthfully, once that is built. */}
      <div className="border-b border-line px-16 py-12">
        <title>Connections · Munim</title>
        <h1 className="text-title font-semibold">Connections</h1>
      </div>
      <Table label="Connections">
        <TableHeader className={COLS}>
          <Th>
            <span className="sr-only">Code</span>
          </Th>
          <Th>Source</Th>
          <Th>Account</Th>
          <Th>Access</Th>
          <Th>Last sync</Th>
          <Th>Status</Th>
          <Th>
            <span className="sr-only">Actions</span>
          </Th>
        </TableHeader>
        {CONNECTED.map((c) => {
          const real = c.src === 'HN' ? hackerNews : undefined;
          const off = real ? !real.data?.enabled : state.disconnected.has(c.src);
          const name = SOURCES[c.src].name;
          const synced = real?.data?.synced_at;
          // "2 min ago", as the handoff words it, from the app's short ages ("2m", "3h", "2d").
          const short = synced ? age(synced, now) : '';
          const unit = short.endsWith('m') ? 'min' : short.slice(-1);
          const sync = real ? (short ? `${short.slice(0, -1)} ${unit} ago` : '') : c.sync;
          // What is wrong, if anything is: the row could not be read or changed, or the source
          // could not be fetched.
          const problem = !real
            ? ''
            : real.isError
              ? 'Could not load'
              : setHackerNews.isError
                ? 'Could not change'
                : real.data?.enabled && real.data.problem
                  ? 'Not syncing'
                  : '';
          const status =
            problem || (real?.isPending ? 'Checking' : off ? 'Disconnected' : 'Connected');
          return (
            <TableRow key={c.src} pad={6} hover={false} className={`${COLS} items-center`}>
              <Cell>
                <SourceTag src={c.src} />
              </Cell>
              <Cell className="font-semibold">{name}</Cell>
              <Cell className="font-mono text-sm text-mute">{c.account}</Cell>
              <Cell className="text-note text-mute">{c.access}</Cell>
              <Cell className="font-mono text-meta text-mute">{off ? '' : sync}</Cell>
              <Cell
                className="flex items-center gap-6 text-note"
                title={problem === 'Not syncing' ? real?.data?.problem : undefined}
              >
                <StatusDot tone={off || problem ? 'a3' : 'ok'} />
                {status}
              </Cell>
              <Cell className="justify-self-end">
                <Button
                  size="md"
                  aria-label={`${off ? 'Connect' : 'Disconnect'} ${name}`}
                  disabled={real && (!real.data || setHackerNews.isPending)}
                  onClick={() => {
                    if (real) setHackerNews.mutate(off);
                    else update((s) => ({ disconnected: toggled(s.disconnected, c.src) }));
                  }}
                >
                  {off ? 'Connect' : 'Disconnect'}
                </Button>
              </Cell>
            </TableRow>
          );
        })}
        {/* The handoff fades these rows to 55%, which makes them unreadable; muted text says the same. */}
        {PLANNED.map(([code, name]) => (
          <TableRow key={code} pad={6} hover={false} className={`${COLS} items-center`}>
            <Cell className="font-mono text-code font-medium text-mute">{code}</Cell>
            <Cell className="font-semibold text-mute">{name}</Cell>
            <Cell />
            <Cell />
            <Cell />
            <Cell className="flex items-center gap-6 text-note text-mute">
              <StatusDot tone="line" />
              Not available yet
            </Cell>
            <Cell className="justify-self-end">
              <Button size="md" disabled aria-label={`Later: ${name} is not available yet`}>
                Later
              </Button>
            </Cell>
          </TableRow>
        ))}
      </Table>
    </main>
  );
}
