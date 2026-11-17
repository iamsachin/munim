import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, Refused, type LockMinutes, type SessionState } from '../api/client';

/** Where this browser stands with the server, plus the two things the server cannot tell us. */
export type State = SessionState | 'loading' | 'unreachable';

export type SignInBy = 'passphrase' | 'email' | 'log';

interface Session {
  state: State;
  /** Idle lock time; null for never, undefined until it has been read. */
  lockMinutes: LockMinutes | undefined;
  /** How this install lets its owner in: by passphrase, or by a code that is mailed to them
   * or, on an install with no mail, written to the server's log. Only a passphrase locks. */
  signIn: SignInBy;
  set: (state: State) => void;
  setLockMinutes: (minutes: LockMinutes) => void;
  /** Asks the server again. */
  refresh: () => void;
  /**
   * For calls that need an open session: if the server said the session is locked or signed
   * out, moves there and returns true. Otherwise returns false and the caller reports the error.
   */
  refused: (error: unknown) => boolean;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, set] = useState<State>('loading');
  const [lockMinutes, setLockMinutes] = useState<LockMinutes | undefined>(undefined);
  const [signIn, setSignIn] = useState<SignInBy>('passphrase');

  const ask = useCallback(() => {
    api.session().then(
      (session) => {
        setSignIn(session.sign_in);
        set(session.state);
      },
      () => {
        set('unreachable');
      },
    );
  }, []);

  // The state starts as 'loading', so the first question needs no state change of its own.
  useEffect(ask, [ask]);

  const refresh = useCallback(() => {
    set('loading');
    ask();
  }, [ask]);

  const refused = useCallback((error: unknown) => {
    if (!(error instanceof Refused)) return false;
    if (error.status === 423) set('locked');
    else if (error.status === 401) set('signed_out');
    else return false;
    return true;
  }, []);

  // The idle timer and the settings card both need the lock time once the session is open.
  useEffect(() => {
    if (state !== 'open') return;
    api.lockSettings().then((settings) => {
      setLockMinutes(settings.minutes);
    }, refused);
  }, [state, refused]);

  return (
    <Ctx value={{ state, lockMinutes, signIn, set, setLockMinutes, refresh, refused }}>
      {children}
    </Ctx>
  );
}

export function useSession() {
  const ctx = use(Ctx);
  if (!ctx) throw new Error('useSession needs a SessionProvider above it');
  return ctx;
}
