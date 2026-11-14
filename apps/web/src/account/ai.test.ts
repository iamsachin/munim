import { expect, test } from 'vitest';
import {
  AI_INITIAL,
  aiPaused,
  providerOf,
  totalCents,
  usableProviders,
  USAGE,
  usd,
  withKey,
  withoutKey,
} from './ai';

const LONG_KEY = 'sk-test-0123456789abcdefWXYZ';

test('costs are summed in cents and shown as dollars', () => {
  expect(totalCents(USAGE['This month'])).toBe(420);
  expect(usd(420)).toBe('$4.20');
  expect(usd(5)).toBe('$0.05');
  expect(totalCents([])).toBe(0);
});

test('AI pauses when the month reaches the limit, not before, and never without one', () => {
  expect(aiPaused({ ...AI_INITIAL, limit: 10 })).toBe(false);
  expect(aiPaused({ ...AI_INITIAL, limit: 5 })).toBe(false);
  expect(aiPaused({ ...AI_INITIAL, limit: 4 })).toBe(true);
  expect(aiPaused({ ...AI_INITIAL, limit: 0 })).toBe(true);
  expect(aiPaused({ ...AI_INITIAL, limit: null })).toBe(false);
});

test('a model belongs to the provider that lists it', () => {
  expect(providerOf('gpt-5.5')).toBe('openai');
  expect(providerOf('claude-haiku-5-5')).toBe('anthropic');
  expect(providerOf('unknown')).toBeUndefined();
});

test('a pasted key keeps only its last four characters and makes the provider usable', () => {
  const ai = withKey(AI_INITIAL, 'anthropic', `  ${LONG_KEY}  `);
  expect(ai.keys.anthropic).toEqual({ tail: 'WXYZ', ok: true });
  expect(JSON.stringify(ai)).not.toContain(LONG_KEY);
  expect(usableProviders(ai)).toEqual(['openai', 'anthropic']);
  expect(withKey(AI_INITIAL, 'anthropic', '   ')).toBe(AI_INITIAL);
});

test('a rejected or removed key switches off the features that used that provider', () => {
  const rejected = withKey(AI_INITIAL, 'openai', 'short');
  expect(rejected.keys.openai).toEqual({ tail: 'hort', ok: false });
  expect(rejected.models).toEqual({ digest: null, ask: null, watch: null });
  expect(usableProviders(rejected)).toEqual([]);

  const mixed = { ...withKey(AI_INITIAL, 'anthropic', LONG_KEY) };
  mixed.models = { ...mixed.models, ask: 'claude-sonnet-5-5' };
  expect(withoutKey(mixed, 'openai').models).toEqual({
    digest: null,
    ask: 'claude-sonnet-5-5',
    watch: null,
  });
});
