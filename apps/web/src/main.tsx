import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ReaderProvider } from './reader/store';
import { ThemeProvider } from './settings';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ReaderProvider>
          <App />
        </ReaderProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
