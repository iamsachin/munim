import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Gallery } from './gallery/Gallery';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

// shortcut: the gallery is the only page, add routing when the app shell is built
createRoot(root).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
