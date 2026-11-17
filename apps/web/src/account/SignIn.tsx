import { useState } from 'react';
import { api, reason, Refused } from '../api/client';
import { Button } from '../ui/Button';
import { AuthCard } from './AuthCard';
import { PassphraseForm } from './PassphraseForm';
import { useSession } from './session';

export function SignIn() {
  const session = useSession();
  if (session.signIn !== 'passphrase') return <ByCode />;
  return (
    <AuthCard heading="Sign in" documentTitle="Sign in">
      <PassphraseForm
        submit="Sign in"
        check={api.signIn}
        onSuccess={() => {
          session.set('open');
        }}
      />
      <p className="text-note text-mute">
        Forgot it? It can be reset from the server&apos;s command line.
      </p>
    </AuthCard>
  );
}

/**
 * Sign-in by a code. It is sent to the owner's address, which whoever runs the install has
 * set, so nobody types an address here; on an install with no mail it is written to the
 * server's log instead.
 */
function ByCode() {
  const session = useSession();
  const mailed = session.signIn === 'email';
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api.sendSignInCode();
      setSent(true);
    } catch (error) {
      if (error instanceof Refused && error.waitSeconds) {
        // One was sent a moment ago, so there is a code to enter.
        setSent(true);
        setProblem(
          `A code was made a moment ago. Another can be asked for in ${String(error.waitSeconds)} seconds.`,
        );
      } else setProblem(reason(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard heading="Sign in" documentTitle="Sign in">
      {sent ? (
        <>
          <p className="text-pretty text-mute">
            {mailed
              ? "A code was sent to the owner's email address."
              : "A code was written to the server's log."}{' '}
            It works once, for ten minutes.
          </p>
          <PassphraseForm
            code
            submit="Sign in"
            check={api.signInWithCode}
            onSuccess={() => {
              session.set('open');
            }}
          />
          <Button className="self-start" disabled={busy} onClick={() => void send()}>
            Send another code
          </Button>
        </>
      ) : (
        <>
          <p className="text-pretty text-mute">
            {mailed
              ? "Munim sends a code to its owner's email address. It cannot be sent anywhere else."
              : 'This install has no mail, so Munim writes a code to its own log on the server, where whoever runs it can read it.'}
          </p>
          <Button variant="primary" disabled={busy} onClick={() => void send()}>
            Send me a code
          </Button>
        </>
      )}
      <div role="alert" className="text-note text-a3 empty:hidden">
        {problem}
      </div>
    </AuthCard>
  );
}
