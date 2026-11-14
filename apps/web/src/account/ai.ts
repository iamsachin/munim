// AI settings: mock data and the rules that go with it. Replaced by server data in milestone 4.

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

/** A stored key is never kept or shown in full: only its last four characters, and whether it works. */
export interface StoredKey {
  tail: string;
  ok: boolean;
}

export interface AiState {
  keys: Record<Provider, StoredKey | null>;
  /** null: no model chosen, so the feature is off. */
  models: Record<Feature, string | null>;
  /** Monthly limit in whole dollars; null for no limit. */
  limit: number | null;
}

export const AI_INITIAL: AiState = {
  keys: { openai: { tail: '4f2a', ok: true }, anthropic: null },
  models: { digest: 'gpt-5.4-mini', ask: 'gpt-5.5', watch: 'gpt-5.4-mini' },
  limit: 10,
};

/** AI features stop for the rest of the month once the estimated cost reaches the limit. */
export const aiPaused = (ai: AiState) =>
  ai.limit !== null && totalCents(USAGE['This month']) >= ai.limit * 100;

/** The providers whose models can be chosen: those with a working key. */
export const usableProviders = (ai: AiState) =>
  (Object.keys(PROVIDERS) as Provider[]).filter((p) => ai.keys[p]?.ok);

// Mock stand-in for the server's test call: real keys are long.
const looksValid = (key: string) => key.length >= 20;

/** Stores a pasted key. Blank input changes nothing. */
export function withKey(ai: AiState, provider: Provider, pasted: string): AiState {
  const key = pasted.trim();
  if (!key) return ai;
  const next = {
    ...ai,
    keys: { ...ai.keys, [provider]: { tail: key.slice(-4), ok: looksValid(key) } },
  };
  return looksValid(key) ? next : withoutModelsOf(next, provider);
}

/** Removes a provider's key. Features that were using one of its models are left with none. */
export function withoutKey(ai: AiState, provider: Provider): AiState {
  return withoutModelsOf({ ...ai, keys: { ...ai.keys, [provider]: null } }, provider);
}

function withoutModelsOf(ai: AiState, provider: Provider): AiState {
  const models = { ...ai.models };
  for (const f of Object.keys(models) as Feature[]) {
    const model = models[f];
    if (model !== null && providerOf(model) === provider) models[f] = null;
  }
  return { ...ai, models };
}
