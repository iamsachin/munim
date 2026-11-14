import { Navigate, Route, Routes, useSearchParams } from 'react-router';
import { AiSettings } from './account/AiSettings';
import { AuthCard } from './account/AuthCard';
import { Connections } from './account/Connections';
import { useSession } from './account/session';
import { Settings } from './account/Settings';
import { Setup } from './account/Setup';
import { SignIn } from './account/SignIn';
import { Gallery } from './gallery/Gallery';
import { Ask } from './reader/Ask';
import { DigestScreen } from './reader/DigestScreen';
import { Highlights } from './reader/Highlights';
import { Later } from './reader/Later';
import { Rss } from './reader/Rss';
import { Saved } from './reader/Saved';
import { Stream } from './reader/Stream';
import { Today } from './reader/Today';
import { Watches } from './reader/Watches';
import { Shell } from './shell/Shell';
import { ErrorState } from './ui/States';

/**
 * Where the admin sends a browser that is not signed in. By the time this renders the session is
 * open, so go on to the page that was asked for, which is only ever the admin.
 */
function AfterSignIn() {
  const next = useSearchParams()[0].get('next') ?? '';
  if (next.startsWith('/admin/')) {
    // The admin is served by Django, not this app, so it needs a real page load.
    window.location.replace(next);
    return null;
  }
  return <Navigate to="/today" replace />;
}

export function App() {
  const session = useSession();

  // Until the server says the session is open, there is nothing else to show at any address.
  if (session.state === 'loading') return null;
  if (session.state === 'unreachable') {
    return (
      <AuthCard heading="Munim is not answering" documentTitle="Not answering">
        <ErrorState what="Munim" detail="The server did not answer." onRetry={session.refresh} />
      </AuthCard>
    );
  }
  if (session.state === 'setup') return <Setup />;
  if (session.state === 'signed_out') return <SignIn />;

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="today" element={<Today />} />
        <Route path="stream/:source?" element={<Stream />} />
        <Route path="later" element={<Later />} />
        <Route path="saved" element={<Saved />} />
        <Route path="highlights" element={<Highlights />} />
        <Route path="rss" element={<Rss />} />
        <Route path="digest" element={<DigestScreen />} />
        <Route path="watches" element={<Watches />} />
        <Route path="ask" element={<Ask />} />
        <Route path="connections" element={<Connections />} />
        <Route path="ai" element={<AiSettings />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="sign-in" element={<AfterSignIn />} />
      {/* The design-system reference; not linked from the app. */}
      <Route path="gallery" element={<Gallery />} />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}
