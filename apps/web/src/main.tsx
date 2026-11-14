import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { SessionProvider } from './account/session';
import { Queries } from './api/queries';
import { App } from './App';
import { ReaderProvider } from './reader/store';
import { ThemeProvider } from './settings';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

// Chromium lays a native select out with whichever font it has, and does not correct it when
// the real one arrives. So the faces are loaded before anything is drawn; they ship with the
// app, and if one cannot be had the app starts without it.
const FACES = ['400', '500', '600'].map((weight) => `${weight} 1em "IBM Plex Sans"`);
FACES.push('400 1em "IBM Plex Mono"', '500 1em "IBM Plex Mono"');

void Promise.allSettled(FACES.map((face) => document.fonts.load(face, 'a'))).then(() => {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <ThemeProvider>
          <SessionProvider>
            <Queries>
              <ReaderProvider>
                <App />
              </ReaderProvider>
            </Queries>
          </SessionProvider>
        </ThemeProvider>
      </BrowserRouter>
    </StrictMode>,
  );
});
