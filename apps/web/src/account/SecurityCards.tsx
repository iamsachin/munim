import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toggled, useReader } from '../reader/store';
import { SectionLabel } from '../ui/atoms';
import { Button, buttonClass } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { focusOnMount, Input } from '../ui/Input';
import { Toggle } from '../ui/Toggle';
import {
  LOCK_AFTER,
  lockNote,
  mockAccepts,
  passphraseProblem,
  SAMPLE_ONLY,
  SESSIONS,
  type LockAfter,
} from './auth';

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
  const { state, update } = useReader();
  const lock = state.lock;
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const close = () => {
    setChanging(false);
    setCurrent('');
    setNext('');
    setRepeat('');
    setProblem(null);
  };

  return (
    <Card className="gap-4">
      <SectionLabel as="h2" className="pb-4">
        Sign-in and lock
      </SectionLabel>
      <Row name="Lock when idle" note={lockNote(lock)}>
        <Toggle
          on={lock.on}
          label="Lock when idle"
          onChange={(on) => {
            update((s) => ({ lock: { ...s.lock, on } }));
          }}
        />
      </Row>
      {lock.on && (
        <Row name="Lock after" note="Time without activity">
          <div role="group" aria-label="Lock after" className="flex gap-6">
            {(Object.keys(LOCK_AFTER) as LockAfter[]).map((after) => (
              <Chip
                key={after}
                on={lock.after === after}
                onClick={() => {
                  update((s) => ({ lock: { ...s.lock, after } }));
                }}
              >
                {after}
              </Chip>
            ))}
          </div>
        </Row>
      )}
      <Row name="Lock now" note="Asks for the passphrase straight away">
        <Button
          size="md"
          onClick={() => {
            update({ locked: true });
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
            const found = mockAccepts(current)
              ? passphraseProblem(next, repeat)
              : 'The current passphrase is not right.';
            setProblem(found);
            if (found) return;
            close();
            setDone(SAMPLE_ONLY);
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
  const { state, update } = useReader();
  return (
    <Card className="gap-4">
      <SectionLabel as="h2" className="pb-4">
        Devices
      </SectionLabel>
      {SESSIONS.filter((s) => !state.revoked.has(s.id)).map((s) => (
        <div key={s.id} className="flex items-center gap-12 border-b border-rule py-6">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{s.name}</div>
            <div className="font-mono text-meta text-mute">{s.note}</div>
          </div>
          {s.self ? (
            <Link to="/sign-in" className={buttonClass({ size: 'md' })}>
              Sign out
            </Link>
          ) : (
            <Button
              size="md"
              aria-label={`Revoke ${s.name}`}
              onClick={() => {
                update((st) => ({ revoked: toggled(st.revoked, s.id) }));
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

export function DataCard() {
  const [confirming, setConfirming] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const close = () => {
    setConfirming(false);
    setPassphrase('');
    setProblem(null);
  };

  return (
    <Card className="gap-8">
      <SectionLabel as="h2">Your data</SectionLabel>
      <p className="text-pretty text-mute">
        Export downloads everything Munim holds as an archive of JSON and text files. Deleting
        removes every saved item, highlight, watch and connection.
      </p>
      <div className="flex gap-6">
        <Button
          size="lg"
          onClick={() => {
            close();
            setMessage(SAMPLE_ONLY);
          }}
        >
          Export everything
        </Button>
        <Button
          size="lg"
          danger
          aria-expanded={confirming}
          onClick={() => {
            setMessage(null);
            setConfirming(true);
          }}
        >
          Delete all data
        </Button>
      </div>
      {confirming && (
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!mockAccepts(passphrase)) {
              setProblem('That passphrase is not right.');
              return;
            }
            close();
            setMessage(SAMPLE_ONLY);
          }}
        >
          <p className="text-a3">This cannot be undone. Enter your passphrase to confirm.</p>
          <div className="flex gap-6">
            <Input
              ref={focusOnMount}
              size="md"
              type="password"
              autoComplete="current-password"
              className="flex-1"
              aria-label="Passphrase to confirm deleting"
              placeholder="Passphrase"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
              }}
            />
            <Button type="submit" size="stretch" danger>
              Delete everything
            </Button>
            <Button size="stretch" onClick={close}>
              Cancel
            </Button>
          </div>
          <Problem>{problem}</Problem>
        </form>
      )}
      {message && (
        <p role="status" className="text-note text-mute">
          {message}
        </p>
      )}
    </Card>
  );
}
