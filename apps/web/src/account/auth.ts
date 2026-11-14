// Sign-in rules the browser applies itself. The server has the final say on all of them.

import type { LockMinutes } from '../api/client';

export const MIN_PASSPHRASE = 12;

/** Why a new passphrase cannot be used, or null if it can. No composition rules: length is what counts. */
export function passphraseProblem(passphrase: string, repeat: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE) {
    return `Use at least ${String(MIN_PASSPHRASE)} characters.`;
  }
  if (passphrase !== repeat) return 'The two entries do not match.';
  return null;
}

export const waitMessage = (seconds: number) =>
  `Too many attempts. Try again in ${String(seconds)} ${seconds === 1 ? 'second' : 'seconds'}.`;

export const LOCK_AFTER = { '5 min': 5, '15 min': 15, '1 hour': 60 } as const;

export const lockNote = (minutes: LockMinutes) =>
  minutes === null
    ? 'Munim stays open until you sign out'
    : `After ${minutes === 60 ? '1 hour' : `${String(minutes)} minutes`} without activity`;

/** "Active now", or how long ago in the largest whole unit: "5 minutes ago", "2 days ago". */
export function lastSeen(iso: string, now: number): string {
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (seconds < 120) return 'Active now';
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ] as const;
  for (const [unit, size] of units) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return `${String(count)} ${unit}${count === 1 ? '' : 's'} ago`;
    }
  }
  return 'Active now';
}

/** How often the idle timer looks, and the least time between two activity reports. */
export const IDLE_TICK_MS = 15_000;
export const REPORT_EVERY_MS = 60_000;

/**
 * What the idle timer should do at `now`: lock, because nothing has been touched for the chosen
 * time; tell the server the owner is active, at most once a minute; or nothing.
 */
export function idleStep(
  now: number,
  lastActivity: number,
  lastReport: number,
  minutes: LockMinutes,
): 'lock' | 'report' | 'wait' {
  if (minutes !== null && now - lastActivity >= minutes * 60_000) return 'lock';
  if (lastActivity > lastReport && now - lastReport >= REPORT_EVERY_MS) return 'report';
  return 'wait';
}

/**
 * How what travels between this browser and the server is protected, read from the address the
 * app was opened at. `plain` is true when anyone on the network could read it.
 */
export function connection(protocol: string, host: string) {
  if (protocol === 'https:') return { says: 'Encrypted (https)', plain: false };
  const here = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  return here
    ? { says: 'Not encrypted, and it never leaves this machine', plain: false }
    : { says: 'Not encrypted (http): others on the network can read it', plain: true };
}
