import { expect, test } from 'vitest';
import type { AiKey } from '../api/client';
import { isAmount, modelFor, usd } from './ai';

test('money is shown in dollars and cents, and only an amount is taken for one', () => {
  expect(usd(4.2)).toBe('$4.20');
  expect(usd(0.05)).toBe('$0.05');
  expect(usd(0)).toBe('$0.00');
  expect(['4', '0', '0.15', ' 2.5 '].every(isAmount)).toBe(true);
  expect(['', ' ', '-1', 'ten', '1e999'].some(isAmount)).toBe(false);
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
