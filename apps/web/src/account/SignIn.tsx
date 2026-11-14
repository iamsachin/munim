import { useNavigate } from 'react-router';
import { AuthCard } from './AuthCard';
import { PassphraseForm } from './PassphraseForm';

export function SignIn() {
  const navigate = useNavigate();
  return (
    <AuthCard heading="Sign in" documentTitle="Sign in">
      <PassphraseForm
        submit="Sign in"
        onSuccess={() => {
          void navigate('/today');
        }}
      />
      <p className="text-note text-mute">
        Forgot it? It can be reset from the server&apos;s command line.
      </p>
    </AuthCard>
  );
}
