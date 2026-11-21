import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, reason, sessionOver, sourceIcon, type YouTube } from '../api/client';
import {
  age,
  useFeeds,
  useForgetX,
  useHackerNews,
  useSetHackerNews,
  useSetXToken,
  useX,
} from '../reader/queries';
import { SectionLabel, SourceTag, StatusDot } from '../ui/atoms';
import { Button, buttonClass } from '../ui/Button';
import { Input } from '../ui/Input';
import { Cell, Table, TableHeader, TableRow, Th } from '../ui/Table';

const COLS = 'grid-cols-[34px_110px_minmax(80px,1fr)_minmax(0,150px)_90px_110px_100px]';

const PLANNED = [
  ['CAL', 'Calendar'],
  ['ML', 'Mail'],
  ['BUD', 'Budget'],
] as const;

/** Every row is what the server says. A source Munim cannot read says so, and why. */
export function Connections() {
  const hackerNews = useHackerNews();
  const setHackerNews = useSetHackerNews();
  const feeds = useFeeds();
  const [now] = useState(() => Date.now());
  const queries = useQueryClient();
  const youtube = useQuery({ queryKey: ['youtube'], queryFn: api.youtube });
  const [settingUp, setSettingUp] = useState(false);
  const x = useX();
  const forgetX = useForgetX();
  const [settingUpX, setSettingUpX] = useState(false);
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
    if (short === '0m') return 'Just now';
    return short ? `${short.slice(0, -1)} ${unit} ago` : '';
  };
  const yt = youtube.data;
  const hn = hackerNews.data;

  // What is wrong with each, if anything is: it could not be read or changed, or its last fetch
  // failed.
  const hnTrouble = hackerNews.isError
    ? 'Could not load'
    : setHackerNews.isError
      ? 'Could not change'
      : hn?.enabled && hn.problem
        ? 'Not syncing'
        : '';
  const ytTrouble = youtube.isError
    ? 'Could not load'
    : disconnect.isError
      ? 'Could not change'
      : yt?.connected && yt.problem
        ? 'Not syncing'
        : '';
  const failing = feeds.data?.filter((feed) => feed.problem).length ?? 0;
  const count = feeds.data?.length ?? 0;
  // Feeds are fetched one by one; the row shows when the latest of them was.
  const fetched = feeds.data
    ?.map((feed) => feed.fetched_at)
    .filter((at) => at != null)
    .sort()
    .at(-1);

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

        <TableRow pad={6} hover={false} className={`${COLS} items-center`}>
          <Cell>
            <SourceTag src="HN" icon={sourceIcon('HN')} />
          </Cell>
          <Cell className="font-semibold">Hacker News</Cell>
          <Cell className="font-mono text-sm text-mute">Front page</Cell>
          <Cell className="text-note text-mute">Read</Cell>
          <Cell className="font-mono text-meta text-mute">
            {hn?.enabled ? ago(hn.synced_at) : ''}
          </Cell>
          <Cell
            className="flex items-center gap-6 text-note"
            title={hnTrouble === 'Not syncing' ? hn?.problem : undefined}
          >
            <StatusDot tone={hn?.enabled && !hnTrouble ? 'ok' : 'a3'} />
            {hnTrouble ||
              (hackerNews.isPending ? 'Checking' : hn?.enabled ? 'Connected' : 'Disconnected')}
          </Cell>
          <Cell className="justify-self-end">
            <Button
              size="md"
              aria-label={`${hn?.enabled ? 'Disconnect' : 'Connect'} Hacker News`}
              disabled={!hn || setHackerNews.isPending}
              onClick={() => {
                setHackerNews.mutate(!hn?.enabled);
              }}
            >
              {hn?.enabled ? 'Disconnect' : 'Connect'}
            </Button>
          </Cell>
        </TableRow>

        <TableRow pad={6} hover={false} className={`${COLS} items-center`}>
          <Cell>
            <SourceTag src="YT" icon={sourceIcon('YT')} />
          </Cell>
          <Cell className="font-semibold">YouTube</Cell>
          <Cell className="truncate font-mono text-sm text-mute">
            {yt?.connected ? yt.account : yt?.configured ? 'Ready to connect' : 'Not set up'}
          </Cell>
          <Cell className="text-note text-mute">Read</Cell>
          <Cell className="font-mono text-meta text-mute">
            {yt?.connected ? ago(yt.synced_at) : ''}
          </Cell>
          <Cell
            className="flex items-center gap-6 text-note"
            title={ytTrouble === 'Not syncing' ? yt?.problem : undefined}
          >
            <StatusDot tone={yt?.connected && !ytTrouble ? 'ok' : 'a3'} />
            {ytTrouble ||
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

        {/* Feeds are added and removed one by one on the RSS screen; this row sums them up. */}
        <TableRow pad={6} hover={false} className={`${COLS} items-center`}>
          <Cell>
            <SourceTag src="RSS" />
          </Cell>
          <Cell className="font-semibold">RSS</Cell>
          <Cell className="font-mono text-sm text-mute">
            {feeds.data ? `${String(count)} ${count === 1 ? 'feed' : 'feeds'}` : ''}
          </Cell>
          <Cell className="text-note text-mute">Read</Cell>
          <Cell className="font-mono text-meta text-mute">{ago(fetched)}</Cell>
          <Cell
            className="flex items-center gap-6 text-note"
            title={
              failing ? `${String(failing)} of ${String(count)} could not be refreshed` : undefined
            }
          >
            <StatusDot
              tone={count > 0 && !failing ? 'ok' : feeds.data && !failing ? 'line' : 'a3'}
            />
            {feeds.isError
              ? 'Could not load'
              : feeds.isPending
                ? 'Checking'
                : failing
                  ? 'Not syncing'
                  : count > 0
                    ? 'Connected'
                    : 'No feeds yet'}
          </Cell>
          <Cell className="justify-self-end">
            <Link to="/rss" aria-label="Manage feeds" className={buttonClass({ size: 'md' })}>
              Manage
            </Link>
          </Cell>
        </TableRow>

        {/* X is read only for watches, with a token from the owner's own developer app. */}
        <TableRow pad={6} hover={false} className={`${COLS} items-center`}>
          <Cell>
            <SourceTag src="X" />
          </Cell>
          <Cell className="font-semibold">X</Cell>
          <Cell className="truncate font-mono text-sm text-mute">
            {x.data?.connected ? `Token ending ${x.data.tail}` : 'Not set up'}
          </Cell>
          <Cell className="text-note text-mute">Watches only</Cell>
          <Cell className="font-mono text-meta text-mute">
            {x.data?.connected ? ago(x.data.synced_at) : ''}
          </Cell>
          <Cell className="flex items-center gap-6 text-note" title={x.data?.problem || undefined}>
            <StatusDot tone={x.data?.connected && !x.data.problem && !x.isError ? 'ok' : 'a3'} />
            {x.isError
              ? 'Could not load'
              : forgetX.isError
                ? 'Could not change'
                : x.isPending
                  ? 'Checking'
                  : !x.data.connected
                    ? 'Disconnected'
                    : x.data.problem
                      ? 'Not syncing'
                      : 'Connected'}
          </Cell>
          <Cell className="justify-self-end">
            {x.data?.connected ? (
              <Button
                size="md"
                aria-label="Disconnect X"
                disabled={forgetX.isPending}
                onClick={() => {
                  forgetX.mutate(undefined);
                }}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                size="md"
                aria-label="Set up X"
                aria-expanded={settingUpX}
                disabled={!x.data}
                onClick={() => {
                  setSettingUpX(true);
                }}
              >
                Set up
              </Button>
            )}
          </Cell>
        </TableRow>

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
      {/* Shown while setting up, and whenever X has something to say. */}
      {x.data && ((settingUpX && !x.data.connected) || x.data.problem) && (
        <XSetup
          problem={x.data.problem}
          entering={!x.data.connected}
          onClose={() => {
            setSettingUpX(false);
          }}
        />
      )}
    </main>
  );
}

/** Where the owner pastes the token of their X developer app, with what it will be used for. */
function XSetup({
  problem,
  entering,
  onClose,
}: {
  problem: string;
  entering: boolean;
  onClose: () => void;
}) {
  const [token, setToken] = useState('');
  const save = useSetXToken();

  return (
    <section aria-label="X setup" className="flex max-w-760 flex-col gap-8 px-16 py-14">
      <SectionLabel as="h2">X</SectionLabel>
      {problem && (
        <p role="status" className="text-a3">
          {problem}
        </p>
      )}
      {entering && (
        <>
          <p className="text-pretty text-mute">
            Munim reads X only for watches. A keyword or a person you switch on for X, on the
            Watches screen, is searched there once a day, and at most 10 posts come back. X charges
            your developer account for each post it returns. Create an app in X&apos;s developer
            console, buy credits there, and paste the app&apos;s Bearer Token here. Posts from X are
            not sent to an AI model.
          </p>
          <form
            className="flex gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (!token.trim() || save.isPending) return;
              save.mutate(token.trim(), {
                onSuccess: () => {
                  setToken('');
                  onClose();
                },
              });
            }}
          >
            <Input
              size="md"
              type="password"
              autoComplete="off"
              className="flex-1"
              aria-label="X Bearer Token"
              placeholder="Bearer Token"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
              }}
            />
            <Button type="submit" size="stretch" disabled={save.isPending}>
              Save
            </Button>
            <Button size="stretch" onClick={onClose}>
              Cancel
            </Button>
          </form>
          <div role="alert" className="text-note text-a3 empty:hidden">
            {save.isError && !sessionOver(save.error) ? reason(save.error) : null}
          </div>
        </>
      )}
    </section>
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
