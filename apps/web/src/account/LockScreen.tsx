import { api } from '../api/client';
import { Button } from '../ui/Button';
import { AuthCard } from './AuthCard';
import { PassphraseForm } from './PassphraseForm';
import { useSession } from './session';

/** Covers the app while it is locked. Unlocking returns to exactly where the owner was. */
export function LockScreen() {
  const session = useSession();
  return (
    <div className="fixed inset-0 z-20 bg-bg">
      <AuthCard heading="Locked">
        <p className="text-mute">Enter your passphrase to carry on where you left off.</p>
        <PassphraseForm
          submit="Unlock"
          check={api.unlock}
          onSuccess={() => {
            session.set('open');
          }}
        />
        <Button
          className="self-start"
          onClick={() => {
            // Signed out here either way: if the call fails, the next one will say so.
            void api.signOut().catch(() => undefined);
            session.set('signed_out');
          }}
        >
          Sign out
        </Button>
      </AuthCard>
    </div>
  );
}
