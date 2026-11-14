import { createContext, use, useLayoutEffect, useState, type ReactNode } from 'react';
import { applyTheme, parseTheme, type ThemeSettings } from './theme';

const KEY = 'munim.theme';

// Storage can be unavailable (private windows, blocked site data); the app must work without it.
function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const Ctx = createContext<{
  theme: ThemeSettings;
  setTheme: (patch: Partial<ThemeSettings>) => void;
} | null>(null);

// shortcut: appearance is kept in this browser only, move it to the server with the other settings in milestone 3
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, set] = useState(() => parseTheme(read()));

  // Layout effect, so the saved theme is applied before the first paint.
  useLayoutEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, JSON.stringify(theme));
    } catch {
      // Not saved; the choice still holds for this visit.
    }
  }, [theme]);

  const setTheme = (patch: Partial<ThemeSettings>) => {
    set((t) => ({ ...t, ...patch }));
  };
  return <Ctx value={{ theme, setTheme }}>{children}</Ctx>;
}

export function useTheme() {
  const ctx = use(Ctx);
  if (!ctx) throw new Error('useTheme needs a ThemeProvider above it');
  return ctx;
}
