import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { focusOnMount, Input } from '../ui/Input';
import { MAX_TRIES, mockAccepts, WAIT_SECONDS } from './auth';

/** One passphrase field and a button: sign-in and unlock. Wrong entries are counted, then made to wait. */
export function PassphraseForm({ submit, onSuccess }: { submit: string; onSuccess: () => void }) {
  const [value, setValue] = useState('');
  const [tries, setTries] = useState(0);
  const waiting = tries >= MAX_TRIES;

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setTries(0);
    }, WAIT_SECONDS * 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [waiting]);

  const message = waiting
    ? `Too many attempts. Try again in ${String(WAIT_SECONDS)} seconds.`
    : tries > 0
      ? 'That passphrase is not right.'
      : null;

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value || waiting) return;
        if (mockAccepts(value)) {
          onSuccess();
          return;
        }
        setValue('');
        setTries((n) => n + 1);
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
      <Button type="submit" variant="primary" disabled={waiting}>
        {submit}
      </Button>
    </form>
  );
}
