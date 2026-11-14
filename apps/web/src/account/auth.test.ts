import { expect, test } from 'vitest';
import { idleStep, lastSeen, lockNote, passphraseProblem, waitMessage } from './auth';

test('a new passphrase needs twelve characters and a matching repeat', () => {
  expect(passphraseProblem('short', 'short')).toBe('Use at least 12 characters.');
  expect(passphraseProblem('elevenchars', 'elevenchars')).toBe('Use at least 12 characters.');
  expect(passphraseProblem('twelve chars', 'twelve char5')).toBe('The two entries do not match.');
  expect(passphraseProblem('twelve chars', 'twelve chars')).toBeNull();
  // Length is checked first, so a short mismatch reports the length.
  expect(passphraseProblem('a', 'b')).toBe('Use at least 12 characters.');
});

test('the wait message counts down in plain words', () => {
  expect(waitMessage(30)).toBe('Too many attempts. Try again in 30 seconds.');
  expect(waitMessage(1)).toBe('Too many attempts. Try again in 1 second.');
});

test('the lock note says when Munim locks', () => {
  expect(lockNote(15)).toBe('After 15 minutes without activity');
  expect(lockNote(60)).toBe('After 1 hour without activity');
  expect(lockNote(null)).toBe('Munim stays open until you sign out');
});

test('a device was last seen in the largest whole unit', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  expect(lastSeen('2026-11-14T11:59:10Z', now)).toBe('Active now');
  expect(lastSeen('2026-11-14T11:58:00Z', now)).toBe('2 minutes ago');
  expect(lastSeen('2026-11-14T11:00:00Z', now)).toBe('1 hour ago');
  expect(lastSeen('2026-11-14T09:30:00Z', now)).toBe('2 hours ago');
  expect(lastSeen('2026-11-08T12:00:00Z', now)).toBe('6 days ago');
  // A clock that is slightly ahead on the server must not read as the future.
  expect(lastSeen('2026-11-14T12:00:30Z', now)).toBe('Active now');
});

test('the idle timer locks after the chosen time, and never when set to never', () => {
  const start = 1_000_000;
  const minute = 60_000;
  expect(idleStep(start + 15 * minute - 1, start, start, 15)).toBe('wait');
  expect(idleStep(start + 15 * minute, start, start, 15)).toBe('lock');
  expect(idleStep(start + 500 * minute, start, start, null)).toBe('wait');
});

test('activity is reported at most once a minute, and only if there was any', () => {
  const start = 1_000_000;
  // Touched 10s after the last report: too soon to report again.
  expect(idleStep(start + 30_000, start + 10_000, start, 15)).toBe('wait');
  expect(idleStep(start + 60_000, start + 10_000, start, 15)).toBe('report');
  // Nothing touched since the last report: nothing to say.
  expect(idleStep(start + 120_000, start - 5_000, start, 15)).toBe('wait');
});
