// AI settings: the rules, and mock data for what the server does not hold yet (models, usage,
// the limit). Provider keys are the server's.
import type { AiKey } from '../api/client';

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

// Mock of each provider's models endpoint. The real lists are fetched, never hard-coded.
export const MODELS: Record<Provider, readonly string[]> = {
  openai: ['gpt-5.5', 'gpt-5.4-mini'],
  anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
};

export interface UsageRow {
  feature: Feature;
  model: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  /** Estimated, in cents, so sums are exact. */
  cents: number;
}

export const PERIODS = ['This month', 'Last month'] as const;
export type Period = (typeof PERIODS)[number];

export const USAGE: Record<Period, UsageRow[]> = {
  'This month': [
    {
      feature: 'digest',
      model: 'gpt-5.4-mini',
      requests: 14,
      tokensIn: 412_300,
      tokensOut: 18_900,
      cents: 31,
    },
    {
      feature: 'ask',
      model: 'gpt-5.5',
      requests: 37,
      tokensIn: 1_204_000,
      tokensOut: 41_200,
      cents: 342,
    },
    {
      feature: 'watch',
      model: 'gpt-5.4-mini',
      requests: 512,
      tokensIn: 603_000,
      tokensOut: 5_100,
      cents: 47,
    },
  ],
  'Last month': [
    {
      feature: 'digest',
      model: 'gpt-5.4-mini',
      requests: 31,
      tokensIn: 905_000,
      tokensOut: 41_000,
      cents: 68,
    },
    {
      feature: 'ask',
      model: 'gpt-5.5',
      requests: 64,
      tokensIn: 2_010_000,
      tokensOut: 72_400,
      cents: 591,
    },
    {
      feature: 'watch',
      model: 'gpt-5.4-mini',
      requests: 1_340,
      tokensIn: 1_612_000,
      tokensOut: 13_400,
      cents: 126,
    },
  ],
};

export const totalCents = (rows: readonly UsageRow[]) => rows.reduce((n, r) => n + r.cents, 0);

export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const providerOf = (model: string) =>
  (Object.keys(MODELS) as Provider[]).find((p) => MODELS[p].includes(model));

export interface AiState {
  /** null: no model chosen, so the feature is off. */
  models: Record<Feature, string | null>;
  /** Monthly limit in whole dollars; null for no limit. */
  limit: number | null;
}

export const AI_INITIAL: AiState = {
  models: { digest: 'gpt-5.4-mini', ask: 'gpt-5.5', watch: 'gpt-5.4-mini' },
  limit: 10,
};

/** AI features stop for the rest of the month once the estimated cost reaches the limit. */
export const aiPaused = (ai: AiState) =>
  ai.limit !== null && totalCents(USAGE['This month']) >= ai.limit * 100;

/** The providers whose models can be chosen: those with a key the provider accepted. */
export const usableProviders = (keys: readonly AiKey[]) =>
  keys.filter((key) => key.ok).map((key) => key.provider);

/**
 * The model a feature runs on, or null if it is off: none was chosen, or the one chosen belongs
 * to a provider whose key is missing or rejected.
 */
export function modelFor(ai: AiState, feature: Feature, usable: readonly Provider[]) {
  const model = ai.models[feature];
  const provider = model === null ? undefined : providerOf(model);
  return provider !== undefined && usable.includes(provider) ? model : null;
}
