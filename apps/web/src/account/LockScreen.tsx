import { useNavigate } from 'react-router';
import { useReader } from '../reader/store';
import { Button } from '../ui/Button';
import { AuthCard } from './AuthCard';
import { PassphraseForm } from './PassphraseForm';

/** Covers the app while it is locked. Unlocking returns to exactly where the owner was. */
export function LockScreen() {
  const { update } = useReader();
  const navigate = useNavigate();
  const unlock = () => {
    update({ locked: false });
  };
  return (
    <div className="fixed inset-0 z-20 bg-bg">
      <AuthCard heading="Locked">
        <p className="text-mute">Enter your passphrase to carry on where you left off.</p>
        <PassphraseForm submit="Unlock" onSuccess={unlock} />
        <Button
          className="self-start"
          onClick={() => {
            unlock();
            void navigate('/sign-in');
          }}
        >
          Sign out
        </Button>
      </AuthCard>
    </div>
  );
}
