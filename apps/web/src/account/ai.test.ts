import { expect, test } from 'vitest';
import type { AiKey } from '../api/client';
import { AI_INITIAL, aiPaused, modelFor, totalCents, USAGE, usd } from './ai';

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

test('a feature is off while its model cannot be used, and the choice is kept', () => {
  const openai: AiKey = { provider: 'openai', tail: '4f2a', ok: true, models: ['gpt-a', 'gpt-b'] };
  const ask = { feature: 'ask', provider: 'openai', model: 'gpt-b' } as const;
  expect(modelFor(ask, [openai])).toBe('openai/gpt-b');
  // None chosen yet, or not loaded.
  expect(modelFor({ feature: 'ask', provider: null, model: null }, [openai])).toBeNull();
  expect(modelFor(undefined, [openai])).toBeNull();
  // The key is gone, was rejected, or the provider stopped listing the model.
  expect(modelFor(ask, [])).toBeNull();
  expect(modelFor(ask, [{ ...openai, ok: false, models: [] }])).toBeNull();
  expect(modelFor(ask, [{ ...openai, models: ['gpt-a'] }])).toBeNull();
  // A model of the same name at another provider is not this one.
  expect(modelFor(ask, [{ ...openai, provider: 'anthropic' }])).toBeNull();
});
