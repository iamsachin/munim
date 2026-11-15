// AI settings: the names and rules the screens share. Everything else is the server's.
import type { AiChoice, AiKey } from '../api/client';

export const PROVIDERS = {
  openai: { name: 'OpenAI', code: 'OAI' },
  anthropic: { name: 'Anthropic', code: 'ANT' },
} as const;
export type Provider = keyof typeof PROVIDERS;

/** The features that call a model. Per-item summaries are not one: a summary is an Ask. */
export const FEATURES = {
  digest: { name: 'Digest', note: 'Daily and weekly digests' },
  ask: { name: 'Ask', note: 'Answers with citations' },
  watch: { name: 'Watch matching', note: 'Topic watches. Keyword watches need no AI.' },
} as const;
export type Feature = keyof typeof FEATURES;

/** The months usage can be shown for, by the name the server knows each by. */
export const PERIODS = { this: 'This month', last: 'Last month' } as const;
export type Period = keyof typeof PERIODS;

export const usd = (dollars: number) => `$${dollars.toFixed(2)}`;

/** Whether what is typed in a money field is an amount: a number, and not below zero. */
export const isAmount = (text: string) =>
  text.trim() !== '' && Number.isFinite(Number(text)) && Number(text) >= 0;

/** A model as a select's value: ids are only unique within their provider. */
export const optionOf = (provider: Provider, model: string) => `${provider}/${model}`;

/**
 * The model a feature runs on, as its select's value, or null if the feature is off: none was
 * chosen, or its provider's key is missing or rejected, or the provider no longer lists it.
 * The choice itself is kept, so it is back when the key is.
 */
export function modelFor(choice: AiChoice | undefined, keys: readonly AiKey[]) {
  if (!choice?.provider || !choice.model) return null;
  const key = keys.find((k) => k.provider === choice.provider);
  return key?.ok && key.models.includes(choice.model)
    ? optionOf(choice.provider, choice.model)
    : null;
}
