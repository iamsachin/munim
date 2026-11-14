import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useSession } from '../account/session';

/**
 * Server data for the screens. A failed read is shown with its own "Try again", so nothing is
 * retried behind the owner's back; and if a read or a change fails because the session is locked
 * or over, the app follows the server there.
 */
export function Queries({ children }: { children: ReactNode }) {
  const { refused } = useSession();
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: (error) => void refused(error) }),
        mutationCache: new MutationCache({ onError: (error) => void refused(error) }),
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
