import { expect, test } from 'vitest';
import {
  AI_INITIAL,
  aiPaused,
  modelFor,
  providerOf,
  totalCents,
  usableProviders,
  USAGE,
  usd,
} from './ai';

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

test('only providers whose key was accepted can be chosen from', () => {
  expect(usableProviders([])).toEqual([]);
  expect(
    usableProviders([
      { provider: 'openai', tail: 'hort', ok: false },
      { provider: 'anthropic', tail: 'WXYZ', ok: true },
    ]),
  ).toEqual(['anthropic']);
  expect(usableProviders([{ provider: 'openai', tail: null, ok: false }])).toEqual([]);
});

test('a feature is off while the provider of its model has no working key', () => {
  const ai = {
    ...AI_INITIAL,
    models: { digest: 'gpt-5.4-mini', ask: 'claude-sonnet-5-5', watch: null },
  };
  expect(modelFor(ai, 'digest', ['openai', 'anthropic'])).toBe('gpt-5.4-mini');
  expect(modelFor(ai, 'digest', ['anthropic'])).toBeNull();
  expect(modelFor(ai, 'ask', ['anthropic'])).toBe('claude-sonnet-5-5');
  expect(modelFor(ai, 'watch', ['openai', 'anthropic'])).toBeNull();
  // The choice is kept, so it returns with the key.
  expect(modelFor(ai, 'digest', ['openai'])).toBe('gpt-5.4-mini');
});
