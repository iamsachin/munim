import { Navigate, Route, Routes } from 'react-router';
import { Connections } from './account/Connections';
import { Settings } from './account/Settings';
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

export function App() {
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
        <Route path="settings" element={<Settings />} />
      </Route>
      {/* The design-system reference; not linked from the app. */}
      <Route path="gallery" element={<Gallery />} />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}
