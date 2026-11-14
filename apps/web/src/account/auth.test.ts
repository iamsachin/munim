import { expect, test } from 'vitest';
import { lockNote, mockAccepts, passphraseProblem } from './auth';

test('a new passphrase needs twelve characters and a matching repeat', () => {
  expect(passphraseProblem('short', 'short')).toBe('Use at least 12 characters.');
  expect(passphraseProblem('elevenchars', 'elevenchars')).toBe('Use at least 12 characters.');
  expect(passphraseProblem('twelve chars', 'twelve char5')).toBe('The two entries do not match.');
  expect(passphraseProblem('twelve chars', 'twelve chars')).toBeNull();
  // Length is checked first, so a short mismatch reports the length.
  expect(passphraseProblem('a', 'b')).toBe('Use at least 12 characters.');
});

test('the mock check accepts exactly what could have been set', () => {
  expect(mockAccepts('twelve chars')).toBe(true);
  expect(mockAccepts('elevenchars')).toBe(false);
});

test('the lock note says when Munim locks', () => {
  expect(lockNote({ on: true, after: '15 min' })).toBe('After 15 minutes without activity');
  expect(lockNote({ on: true, after: '1 hour' })).toBe('After 1 hour without activity');
  expect(lockNote({ on: false, after: '5 min' })).toBe('Munim stays open until you sign out');
});
