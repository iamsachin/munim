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
