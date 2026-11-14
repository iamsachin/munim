import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, reason, sessionOver, type YouTube } from '../api/client';
import { age, useHackerNews, useSetHackerNews } from '../reader/queries';
import { toggled, useReader } from '../reader/store';
import { SectionLabel, SourceTag, SOURCES, StatusDot, type Source } from '../ui/atoms';
import { Button, buttonClass } from '../ui/Button';
import { Input } from '../ui/Input';
import { Cell, Table, TableHeader, TableRow, Th } from '../ui/Table';

const COLS = 'grid-cols-[34px_110px_minmax(80px,1fr)_minmax(0,150px)_90px_110px_100px]';

// Mock, from the handoff, except Access: only Reddit can be written to (see NO_REPLY), and
// except Hacker News and YouTube, whose rows show what the server says.
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
  const queries = useQueryClient();
  const youtube = useQuery({ queryKey: ['youtube'], queryFn: api.youtube });
  const [settingUp, setSettingUp] = useState(false);
  const disconnect = useMutation({
    mutationFn: api.disconnectYouTube,
    onSuccess: (state) => {
      queries.setQueryData(['youtube'], state);
    },
  });
  /** "2 min ago", as the handoff words it, from the app's short ages ("2m", "3h", "2d"). */
  const ago = (at: string | null | undefined) => {
    const short = at ? age(at, now) : '';
    const unit = short.endsWith('m') ? 'min' : short.slice(-1);
    return short ? `${short.slice(0, -1)} ${unit} ago` : '';
  };
  const yt = youtube.data;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-baseline gap-12 border-b border-line px-16 py-12">
        <title>Connections · Munim</title>
        <h1 className="text-title font-semibold">Connections</h1>
        <span className="text-note text-mute">
          Sign-ins to sources are sealed on the server and never sent to the browser.
        </span>
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
          if (c.src === 'YT') {
            const trouble = youtube.isError
              ? 'Could not load'
              : disconnect.isError
                ? 'Could not change'
                : yt?.connected && yt.problem
                  ? 'Not syncing'
                  : '';
            return (
              <TableRow key={c.src} pad={6} hover={false} className={`${COLS} items-center`}>
                <Cell>
                  <SourceTag src={c.src} />
                </Cell>
                <Cell className="font-semibold">YouTube</Cell>
                <Cell className="truncate font-mono text-sm text-mute">
                  {yt?.connected ? yt.account : yt?.configured ? 'Ready to connect' : 'Not set up'}
                </Cell>
                <Cell className="text-note text-mute">{c.access}</Cell>
                <Cell className="font-mono text-meta text-mute">
                  {yt?.connected ? ago(yt.synced_at) : ''}
                </Cell>
                <Cell className="flex items-center gap-6 text-note">
                  <StatusDot tone={yt?.connected && !trouble ? 'ok' : 'a3'} />
                  {trouble ||
                    (youtube.isPending ? 'Checking' : yt?.connected ? 'Connected' : 'Disconnected')}
                </Cell>
                <Cell className="justify-self-end">
                  {yt?.connected ? (
                    <Button
                      size="md"
                      aria-label="Disconnect YouTube"
                      disabled={disconnect.isPending}
                      onClick={() => {
                        disconnect.mutate();
                      }}
                    >
                      Disconnect
                    </Button>
                  ) : yt?.configured && yt.redirect_ok ? (
                    // A link, not a call: the browser itself goes to Google and comes back.
                    <a
                      href="/api/sources/youtube/start"
                      aria-label="Connect YouTube"
                      className={buttonClass({ size: 'md' })}
                    >
                      Connect
                    </a>
                  ) : (
                    <Button
                      size="md"
                      aria-label="Set up YouTube"
                      aria-expanded={settingUp}
                      disabled={!yt}
                      onClick={() => {
                        setSettingUp(true);
                      }}
                    >
                      Set up
                    </Button>
                  )}
                </Cell>
              </TableRow>
            );
          }
          const real = c.src === 'HN' ? hackerNews : undefined;
          const off = real ? !real.data?.enabled : state.disconnected.has(c.src);
          const name = SOURCES[c.src].name;
          const sync = real ? ago(real.data?.synced_at) : c.sync;
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
      {/* Shown while setting up, and whenever there is something to say about the sign-in. */}
      {yt && (settingUp || yt.problem || (yt.configured && !yt.connected)) && (
        <YouTubeSetup
          state={yt}
          open={settingUp}
          onClose={() => {
            setSettingUp(false);
          }}
        />
      )}
    </main>
  );
}

/**
 * What YouTube needs before it can be connected, and what went wrong if something did. Each
 * install signs in through a Google Cloud project of the owner's own, so its client ID and
 * secret are entered here; the server seals them.
 */
function YouTubeSetup({
  state,
  open,
  onClose,
}: {
  state: YouTube;
  open: boolean;
  onClose: () => void;
}) {
  const queries = useQueryClient();
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const save = useMutation({
    mutationFn: api.setYouTubeCredentials,
    onSuccess: (saved) => {
      queries.setQueryData(['youtube'], saved);
      setId('');
      setSecret('');
      onClose();
    },
  });
  const entering = open || !state.configured;

  return (
    <section aria-label="YouTube setup" className="flex max-w-760 flex-col gap-8 px-16 py-14">
      <SectionLabel as="h2">YouTube</SectionLabel>
      {state.problem && (
        <p role="status" className="text-a3">
          {state.problem}
        </p>
      )}
      {!state.connected && (
        <>
          <p className="text-pretty text-mute">
            Munim reads your subscriptions by signing in to Google as you, with read-only access,
            through a Google Cloud project of your own. In that project, switch on the YouTube Data
            API and create an OAuth client of the type &quot;Web application&quot; with this
            redirect address:
          </p>
          <p className="font-mono text-sm wrap-anywhere">{state.redirect_uri}</p>
          {!state.redirect_ok && (
            <p className="text-a3">
              Google only sends people back to an https address, or to this machine. Open Munim over
              https to connect YouTube.
            </p>
          )}
          {entering ? (
            <form
              className="flex gap-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (id.trim() && secret.trim() && !save.isPending) {
                  save.mutate({ client_id: id, client_secret: secret });
                }
              }}
            >
              <Input
                size="md"
                className="flex-1"
                aria-label="Client ID"
                placeholder="Client ID"
                autoComplete="off"
                value={id}
                onChange={(e) => {
                  setId(e.target.value);
                }}
              />
              <Input
                size="md"
                type="password"
                className="flex-1"
                aria-label="Client secret"
                placeholder="Client secret"
                autoComplete="off"
                value={secret}
                onChange={(e) => {
                  setSecret(e.target.value);
                }}
              />
              <Button type="submit" size="stretch" disabled={save.isPending}>
                Save
              </Button>
              {state.configured && (
                <Button size="stretch" onClick={onClose}>
                  Cancel
                </Button>
              )}
            </form>
          ) : (
            <p className="text-mute">The client ID and secret are saved.</p>
          )}
          <div role="alert" className="text-note text-a3 empty:hidden">
            {save.isError && !sessionOver(save.error) ? reason(save.error) : null}
          </div>
          <p className="text-note text-mute">
            While the Google project is in testing, Google ends the sign-in after 7 days and you
            connect again.
          </p>
        </>
      )}
    </section>
  );
}
