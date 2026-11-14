import { useEffect, useState, type ReactNode } from 'react';
import { api, reason, Refused, type Device, type LockMinutes } from '../api/client';
import { SectionLabel } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { focusOnMount, Input } from '../ui/Input';
import { ErrorState, LoadingRows } from '../ui/States';
import { Toggle } from '../ui/Toggle';
import { lastSeen, LOCK_AFTER, lockNote, passphraseProblem, waitMessage } from './auth';
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

const NOT_YET = 'Available when Munim stores your data on the server';

/** Both actions need data on the server, which does not exist yet, so they say so and do nothing. */
export function DataCard() {
  return (
    <Card className="gap-8">
      <SectionLabel as="h2">Your data</SectionLabel>
      <p className="text-pretty text-mute">
        Export downloads everything Munim holds as an archive of JSON and text files. Deleting
        removes every saved item, highlight, watch and connection, after you confirm with your
        passphrase.
      </p>
      <div className="flex gap-6">
        <Button size="lg" disabled title={NOT_YET}>
          Export everything
        </Button>
        <Button size="lg" danger disabled title={NOT_YET}>
          Delete all data
        </Button>
      </div>
    </Card>
  );
}
