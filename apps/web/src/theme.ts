export const ACCENTS = {
  Amber: 'oklch(0.82 0.13 75)',
  Blue: 'oklch(0.76 0.12 250)',
  Green: 'oklch(0.82 0.13 155)',
  Coral: 'oklch(0.76 0.13 25)',
  Gray: 'oklch(0.9 0.008 255)',
} as const;

export const DENSITIES = { Compact: 1, Comfortable: 1.7, Roomy: 2.4 } as const;

export const THEMES = { Dark: 'dark', Light: 'light' } as const;

export interface ThemeSettings {
  theme: keyof typeof THEMES;
  accent: keyof typeof ACCENTS;
  density: keyof typeof DENSITIES;
}

export const DEFAULT_THEME: ThemeSettings = {
  theme: 'Dark',
  accent: 'Amber',
  density: 'Comfortable',
};

/** Writes the three hooks styles.css reads: data-theme, --accent and --dn. */
export function applyTheme(
  settings: ThemeSettings,
  root: Pick<HTMLElement, 'dataset' | 'style'> = document.documentElement,
) {
  root.dataset.theme = THEMES[settings.theme];
  root.style.setProperty('--accent', ACCENTS[settings.accent]);
  root.style.setProperty('--dn', String(DENSITIES[settings.density]));
}

const own = <T extends object>(table: T, key: unknown, fallback: keyof T): keyof T =>
  typeof key === 'string' && Object.hasOwn(table, key) ? (key as keyof T) : fallback;

/** Reads settings saved by an earlier visit. Anything missing or unrecognised falls back to the default. */
export function parseTheme(raw: string | null): ThemeSettings {
  let saved: unknown;
  try {
    saved = JSON.parse(raw ?? 'null');
  } catch {
    saved = null;
  }
  const v = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>;
  return {
    theme: own(THEMES, v.theme, DEFAULT_THEME.theme),
    accent: own(ACCENTS, v.accent, DEFAULT_THEME.accent),
    density: own(DENSITIES, v.density, DEFAULT_THEME.density),
  };
}
