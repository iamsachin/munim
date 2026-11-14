// Sign-in rules and mock data. The server takes over the checks in milestone 3.

export const MIN_PASSPHRASE = 12;
export const MAX_TRIES = 3;
export const WAIT_SECONDS = 30;

/** Why a new passphrase cannot be used, or null if it can. No composition rules: length is what counts. */
export function passphraseProblem(passphrase: string, repeat: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE) {
    return `Use at least ${String(MIN_PASSPHRASE)} characters.`;
  }
  if (passphrase !== repeat) return 'The two entries do not match.';
  return null;
}

// Mock stand-in for the server's check: there is no stored passphrase, so anything long enough passes.
export const mockAccepts = (passphrase: string) => passphrase.length >= MIN_PASSPHRASE;

/** What the mock says in place of an action only a server can perform. */
export const SAMPLE_ONLY = 'Nothing happened: this build runs on sample data.';

export const LOCK_AFTER = { '5 min': 5, '15 min': 15, '1 hour': 60 } as const;
export type LockAfter = keyof typeof LOCK_AFTER;

export interface LockSettings {
  on: boolean;
  after: LockAfter;
}

export const LOCK_INITIAL: LockSettings = { on: true, after: '15 min' };

export const lockNote = (lock: LockSettings) =>
  lock.on
    ? `After ${lock.after === '1 hour' ? '1 hour' : `${String(LOCK_AFTER[lock.after])} minutes`} without activity`
    : 'Munim stays open until you sign out';

// Mock: the browsers signed in to this install.
export const SESSIONS = [
  { id: 'this', name: 'Chrome on macOS', note: 'This device · active now', self: true },
  { id: 'phone', name: 'Safari on iPhone', note: '2 hours ago', self: false },
  { id: 'linux', name: 'Firefox on Linux', note: '6 days ago', self: false },
];
