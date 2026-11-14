import { useEffect, useState } from 'react';
import { reason, Refused } from '../api/client';
import { Button } from '../ui/Button';
import { focusOnMount, Input } from '../ui/Input';
import { waitMessage } from './auth';

/**
 * One passphrase field and a button: sign-in and unlock. `check` sends the passphrase to the
 * server, which decides whether it is right and whether there have been too many attempts.
 */
export function PassphraseForm({
  submit,
  check,
  onSuccess,
}: {
  submit: string;
  check: (passphrase: string) => Promise<unknown>;
  onSuccess: () => void;
}) {
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // When the server says to wait: the moment the wait ends, and a clock to count down against.
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);

  const left = Math.ceil((until - now) / 1000);
  const waiting = left > 0;

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [waiting]);

  const message = waiting ? waitMessage(left) : problem;

  const send = async () => {
    if (!value || waiting || busy) return;
    setBusy(true);
    try {
      await check(value);
      onSuccess();
    } catch (error) {
      setValue('');
      if (error instanceof Refused && error.waitSeconds) {
        setProblem(null);
        setNow(Date.now());
        setUntil(Date.now() + error.waitSeconds * 1000);
      } else {
        setProblem(reason(error));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Input
        ref={focusOnMount}
        size="lg"
        type="password"
        autoComplete="current-password"
        aria-label="Passphrase"
        aria-invalid={message !== null}
        aria-describedby="passphrase-message"
        placeholder="Passphrase"
        disabled={waiting}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
      />
      <div id="passphrase-message" role="alert" className="text-note text-a3 empty:hidden">
        {message}
      </div>
      <Button type="submit" variant="primary" disabled={waiting || busy}>
        {submit}
      </Button>
    </form>
  );
}
