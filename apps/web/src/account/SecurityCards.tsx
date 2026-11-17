import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { api, reason, Refused, type Device, type LockMinutes } from '../api/client';
import { SectionLabel, StatusDot } from '../ui/atoms';
import { Button, buttonClass } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { focusOnMount, Input } from '../ui/Input';
import { ErrorState, LoadingRows } from '../ui/States';
import { Toggle } from '../ui/Toggle';
import {
  connection,
  lastSeen,
  LOCK_AFTER,
  lockNote,
  passphraseProblem,
  sealedNow,
  waitMessage,
} from './auth';
import { useSession } from './session';

export function Row({
  name,
  note,
  children,
}: {
  name: string;
  note: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-12 border-b border-rule py-6">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{name}</div>
        <div className="text-note text-mute">{note}</div>
      </div>
      {children}
    </div>
  );
}

const Problem = ({ children }: { children: ReactNode }) => (
  <div role="alert" className="text-note text-a3 empty:hidden">
    {children}
  </div>
);

export function SignInCard() {
  const session = useSession();
  const minutes = session.lockMinutes;
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [lockProblem, setLockProblem] = useState<string | null>(null);

  const close = () => {
    setChanging(false);
    setCurrent('');
    setNext('');
    setRepeat('');
    setProblem(null);
  };

  const setLock = (value: LockMinutes) => {
    setLockProblem(null);
    api.setLockSettings(value).then(
      (saved) => {
        session.setLockMinutes(saved.minutes);
      },
      (error: unknown) => {
        if (!session.refused(error)) setLockProblem(reason(error));
      },
    );
  };

  const change = async () => {
    const found = passphraseProblem(next, repeat);
    setProblem(found);
    if (found) return;
    try {
      await api.changePassphrase(current, next);
      close();
      setDone('Passphrase changed. Every other device was signed out.');
    } catch (error) {
      if (session.refused(error)) return;
      if (error instanceof Refused && error.waitSeconds) setProblem(waitMessage(error.waitSeconds));
      else if (error instanceof Refused && error.status === 403) {
        setProblem('The current passphrase is not right.');
      } else setProblem(reason(error));
    }
  };

  return (
    <Card className="gap-4">
      <SectionLabel as="h2" className="pb-4">
        Sign-in and lock
      </SectionLabel>
      {session.signIn !== 'passphrase' ? (
        <p className="py-6 text-pretty text-mute">
          {session.signIn === 'email'
            ? "You sign in with a code sent to the owner's email address, which is set where this install runs."
            : 'You sign in with a code that Munim writes to its own log on the server, where whoever runs this install can read it.'}{' '}
          There is no passphrase and no idle lock: a device stays signed in for 30 days, or until
          you sign it out below.
        </p>
      ) : (
        <>
          <Row name="Lock when idle" note={minutes === undefined ? ' ' : lockNote(minutes)}>
            <Toggle
              on={minutes !== null && minutes !== undefined}
              label="Lock when idle"
              onChange={(on) => {
                setLock(on ? 15 : null);
              }}
            />
          </Row>
          {minutes !== null && minutes !== undefined && (
            <Row name="Lock after" note="Time without activity">
              <div role="group" aria-label="Lock after" className="flex gap-6">
                {(Object.keys(LOCK_AFTER) as (keyof typeof LOCK_AFTER)[]).map((label) => (
                  <Chip
                    key={label}
                    on={minutes === LOCK_AFTER[label]}
                    onClick={() => {
                      setLock(LOCK_AFTER[label]);
                    }}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            </Row>
          )}
          <Problem>{lockProblem}</Problem>
          <Row name="Lock now" note="Asks for the passphrase straight away">
            <Button
              size="md"
              onClick={() => {
                // The screen locks either way; the server also locks unless it cannot be reached.
                void api.lock().catch(() => undefined);
                session.set('locked');
              }}
            >
              Lock
            </Button>
          </Row>
        </>
      )}
      {session.signIn === 'passphrase' && (
        <Row name="Passphrase" note="The one thing you sign in with">
          <Button
            size="md"
            aria-expanded={changing}
            onClick={() => {
              setDone(null);
              setChanging(true);
            }}
          >
            Change
          </Button>
        </Row>
      )}
      {changing && (
        <form
          className="flex flex-col gap-6 border-b border-rule py-8"
          onSubmit={(e) => {
            e.preventDefault();
            void change();
          }}
        >
          <Input
            ref={focusOnMount}
            size="md"
            type="password"
            autoComplete="current-password"
            aria-label="Current passphrase"
            placeholder="Current passphrase"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
            }}
          />
          <Input
            size="md"
            type="password"
            autoComplete="new-password"
            aria-label="New passphrase"
            placeholder="New passphrase"
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
            }}
          />
          <Input
            size="md"
            type="password"
            autoComplete="new-password"
            aria-label="Repeat new passphrase"
            placeholder="Repeat new passphrase"
            value={repeat}
            onChange={(e) => {
              setRepeat(e.target.value);
            }}
          />
          <Problem>{problem}</Problem>
          <div className="flex gap-6">
            <Button type="submit" size="md">
              Save passphrase
            </Button>
            <Button size="md" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {done && (
        <p role="status" className="py-6 text-note text-mute">
          {done}
        </p>
      )}
      <Row name="Two-step sign-in" note="Passkeys, with one-time codes as backup. Not built yet.">
        <Button size="md" disabled aria-label="Later: two-step sign-in is not built yet">
          Later
        </Button>
      </Row>
    </Card>
  );
}

export function DevicesCard() {
  const session = useSession();
  const [devices, setDevices] = useState<Device[] | 'loading' | 'failed'>('loading');
  // Read once per load, so "2 hours ago" does not change while the list is on screen.
  const [now, setNow] = useState(0);

  const fetchDevices = () => {
    api.devices().then(
      (list) => {
        setNow(Date.now());
        setDevices(list);
      },
      (error: unknown) => {
        if (!session.refused(error)) setDevices('failed');
      },
    );
  };
  // The list starts as 'loading', so the first fetch needs no state change of its own.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the card appears
  useEffect(fetchDevices, []);

  const load = () => {
    setDevices('loading');
    fetchDevices();
  };

  return (
    <Card className="gap-4">
      <SectionLabel as="h2" className="pb-4">
        Devices
      </SectionLabel>
      {devices === 'loading' && <LoadingRows what="devices" rows={2} />}
      {devices === 'failed' && <ErrorState what="the devices" onRetry={load} />}
      {Array.isArray(devices) &&
        devices.map((d) => (
          <div key={d.id} className="flex items-center gap-12 border-b border-rule py-6">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{d.name}</div>
              <div className="font-mono text-meta text-mute">
                {d.current ? 'This device · ' : ''}
                {lastSeen(d.last_seen, now)}
              </div>
            </div>
            {d.current ? (
              <Button
                size="md"
                onClick={() => {
                  void api.signOut().catch(() => undefined);
                  session.set('signed_out');
                }}
              >
                Sign out
              </Button>
            ) : (
              <Button
                size="md"
                aria-label={`Revoke ${d.name}`}
                onClick={() => {
                  api.revokeDevice(d.id).then(load, (error: unknown) => {
                    if (!session.refused(error)) setDevices('failed');
                  });
                }}
              >
                Revoke
              </Button>
            )}
          </div>
        ))}
    </Card>
  );
}

/**
 * Export hands over everything Munim holds; Delete all removes it, after the passphrase. The
 * account itself (passphrase, devices, lock setting) stays.
 */
export function DataCard() {
  const session = useSession();
  const queries = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Where sign-in is by a code there is no passphrase: a code made for this confirms it.
  const byCode = session.signIn !== 'passphrase';

  const close = () => {
    setConfirming(false);
    setPassphrase('');
    setProblem(null);
  };
  const begin = async () => {
    setDone(false);
    setConfirming(true);
    if (!byCode) return;
    try {
      await api.sendConfirmCode();
    } catch (error) {
      if (session.refused(error)) return;
      // Sent a moment ago: that code is still the one to enter.
      if (!(error instanceof Refused && error.waitSeconds)) setProblem(reason(error));
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteAll(byCode ? { code: passphrase } : { passphrase });
      close();
      setDone(true);
      // Every list and count on every screen is now out of date.
      await queries.invalidateQueries();
    } catch (error) {
      if (session.refused(error)) return;
      if (error instanceof Refused && error.waitSeconds) setProblem(waitMessage(error.waitSeconds));
      else if (error instanceof Refused && error.status === 403) {
        setProblem(
          byCode
            ? 'That code is not right, or is no longer good.'
            : 'That passphrase is not right.',
        );
      } else setProblem(reason(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="gap-8">
      <SectionLabel as="h2">Your data</SectionLabel>
      <p className="text-pretty text-mute">
        Export downloads everything Munim holds as an archive of JSON and text files, except the API
        keys you gave it. Deleting removes every feed, item, highlight, connection and API key,
        after you confirm with {byCode ? 'a code made for it' : 'your passphrase'}. Your{' '}
        {byCode ? 'devices stay' : 'passphrase and devices stay'}.
      </p>
      <div className="flex gap-6">
        {/* A plain link: the browser downloads the archive the server sends. */}
        <a href="/api/export" download className={buttonClass({ size: 'lg' })}>
          Export everything
        </a>
        <Button size="lg" danger aria-expanded={confirming} onClick={() => void begin()}>
          Delete all data
        </Button>
      </div>
      {confirming && (
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (passphrase && !busy) void remove();
          }}
        >
          <p className="text-a3">
            {byCode
              ? `This cannot be undone. A code was ${session.signIn === 'email' ? 'sent to your email' : "written to the server's log"}: enter it to confirm.`
              : 'This cannot be undone. Enter your passphrase to confirm.'}
          </p>
          <div className="flex gap-6">
            <Input
              ref={focusOnMount}
              size="md"
              type={byCode ? 'text' : 'password'}
              inputMode={byCode ? 'numeric' : undefined}
              autoComplete={byCode ? 'one-time-code' : 'current-password'}
              className="flex-1"
              aria-label={byCode ? 'Code to confirm deleting' : 'Passphrase to confirm deleting'}
              placeholder={byCode ? 'Code' : 'Passphrase'}
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
              }}
            />
            <Button type="submit" size="stretch" danger disabled={busy}>
              Delete everything
            </Button>
            <Button size="stretch" onClick={close}>
              Cancel
            </Button>
          </div>
          <Problem>{problem}</Problem>
        </form>
      )}
      {done && (
        <p role="status" className="text-note text-mute">
          Everything was deleted.
        </p>
      )}
    </Card>
  );
}

const MASTER_KEY = {
  file: 'A file in the data folder, master.key',
  unmade: 'Not made yet: a file in the data folder, once a key is stored',
  environment: 'Set by this install (MUNIM_MASTER_KEY)',
} as const;

/**
 * What Munim encrypts and what it does not. Every line is something this install does: the
 * handoff's card claimed end-to-end encryption, which this architecture does not have.
 */
export function EncryptionCard() {
  const facts = useQuery({ queryKey: ['security'], queryFn: api.security });
  const unknown = facts.isError ? 'Could not load' : 'Checking';
  const link = connection(window.location.protocol, window.location.hostname);

  return (
    <Card className="gap-8">
      <SectionLabel as="h2">Encryption</SectionLabel>
      <div className="flex items-center gap-8 font-semibold">
        <StatusDot tone="ok" />
        Secrets are sealed
      </div>
      <p className="text-pretty text-mute">
        API keys and sign-ins to sources are encrypted with this install&apos;s master key before
        they are stored, and are never sent back to the browser. What you read, save and highlight
        is kept as plain text in the database, so that search and Ask can work. Encrypting the disk
        it sits on is up to whoever runs this server.
      </p>
      <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-12 gap-y-4 text-note">
        <dt className="text-mute">Master key</dt>
        <dd>{facts.data ? MASTER_KEY[facts.data.master_key] : unknown}</dd>
        <dt className="text-mute">Sealed now</dt>
        <dd>{facts.data ? sealedNow(facts.data.sealed, facts.data.sign_ins) : unknown}</dd>
        <dt className="text-mute">Passphrase</dt>
        <dd>Kept only as a hash, never as written</dd>
        <dt className="text-mute">Connection</dt>
        <dd className={link.plain ? 'text-a3' : undefined}>{link.says}</dd>
      </dl>
    </Card>
  );
}
