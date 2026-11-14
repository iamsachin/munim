import { api } from '../api/client';
import { AuthCard } from './AuthCard';
import { PassphraseForm } from './PassphraseForm';
import { useSession } from './session';

export function SignIn() {
  const session = useSession();
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
