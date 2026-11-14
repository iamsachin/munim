import { useState } from 'react';
import { api, reason } from '../api/client';
import { Button } from '../ui/Button';
import { focusOnMount, Input } from '../ui/Input';
import { AuthCard } from './AuthCard';
import { MIN_PASSPHRASE, passphraseProblem } from './auth';
import { useSession } from './session';

/** First run: choose the passphrase, then straight into the app. */
export function Setup() {
  const session = useSession();
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const found = passphraseProblem(passphrase, repeat);
    setProblem(found);
    if (found || busy) return;
    setBusy(true);
    try {
      await api.setup(passphrase);
      session.set('open');
    } catch (error) {
      setProblem(reason(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard heading="Set a passphrase" documentTitle="Set up">
      <p className="text-mute">
        It is the only way into this Munim. There is one owner and no username.
      </p>
      <form
        className="flex flex-col gap-8"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Input
          ref={focusOnMount}
          size="lg"
          type="password"
          autoComplete="new-password"
          aria-label="Passphrase"
          aria-describedby="setup-rule setup-problem"
          aria-invalid={problem !== null}
          placeholder="Passphrase"
          value={passphrase}
          onChange={(e) => {
            setPassphrase(e.target.value);
          }}
        />
        <Input
          size="lg"
          type="password"
          autoComplete="new-password"
          aria-label="Repeat passphrase"
          placeholder="Repeat passphrase"
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value);
          }}
        />
        <div id="setup-rule" className="text-note text-mute">
          At least {MIN_PASSPHRASE} characters. A few unrelated words work well.
        </div>
        <div id="setup-problem" role="alert" className="text-note text-a3 empty:hidden">
          {problem}
        </div>
        <Button type="submit" variant="primary" disabled={busy}>
          Create and open Munim
        </Button>
      </form>
    </AuthCard>
  );
}
