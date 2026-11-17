import type { components } from './schema';

type Schemas = components['schemas'];
export type SessionState = Schemas['SessionOut']['state'];
export type Device = Schemas['DeviceOut'];
export type LockMinutes = Schemas['LockSettings']['minutes'];
export type Feed = Schemas['FeedOut'];
export type Item = Schemas['ItemOut'];
export type ItemDetail = Schemas['ItemDetail'];
export type ItemPatch = Schemas['ItemPatch'];
export type Counts = Schemas['Counts'];
export type Connection = Schemas['ConnectionOut'];
/** Where the YouTube connection stands: set up or not, signed in or not. No secrets. */
export type YouTube = Schemas['YouTubeOut'];
/** A passage the owner marked, with its note and what it was taken from. */
export type Highlight = Schemas['HighlightOut'];
/** What the browser knows of a provider's key: its last four characters and whether it works. */
/** Where the icon of a source that is one site is, at the server (which fetches and keeps it). */
export const sourceIcon = (source: 'HN' | 'YT') => `/api/sources/${source}/icon`;

export type Ask = Schemas['AskOut'];
export type Digests = Schemas['DigestsOut'];
export type Watches = Schemas['WatchesOut'];
export type X = Schemas['XOut'];
export type AiKey = Schemas['KeyOut'];
export type AiChoice = Schemas['ChoiceOut'];
export type AiPrice = Schemas['Price'];
export type AiLimit = Schemas['LimitOut'];
export type AiUsage = Schemas['UsageOut'];

/** Which items to list. Everything left out means "do not narrow by this". */
export interface ItemQuery {
  show?: 'all' | 'unread' | 'saved' | 'later';
  source?: Item['source'];
  feed?: number;
  q?: string;
}

/** The server answered, and the answer was no. `waitSeconds` is set when it said to try later. */
export class Refused extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly waitSeconds?: number,
  ) {
    super(`${String(status)} ${detail}`);
  }
}

export const UNREACHABLE = 'Could not reach the server.';

/**
 * True if a call that needs an open session failed because the session is locked or over. The
 * app shows that as a whole, so the screen that made the call has nothing to add.
 */
export const sessionOver = (error: unknown) =>
  error instanceof Refused && (error.status === 401 || error.status === 423);

/** What to show for a failed call: the server's reason, or that it could not be reached. */
export const reason = (error: unknown) => (error instanceof Refused ? error.detail : UNREACHABLE);

const csrfToken = () => /(?:^|; )csrftoken=([^;]+)/.exec(document.cookie)?.[1] ?? '';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: {
      'X-CSRFToken': csrfToken(),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : response.statusText;
    const wait = typeof data?.wait_seconds === 'number' ? data.wait_seconds : undefined;
    throw new Refused(response.status, detail, wait);
  }
  // The shapes below are generated from the server's own OpenAPI document.
  return data as T;
}

const passphrase = (value: string): Schemas['PassphraseIn'] => ({ passphrase: value });

export const api = {
  session: () => call<Schemas['SessionOut']>('GET', 'session'),
  setup: (value: string) => call<Schemas['SessionOut']>('POST', 'setup', passphrase(value)),
  signIn: (value: string) => call<Schemas['SessionOut']>('POST', 'sign-in', passphrase(value)),
  signOut: () => call<undefined>('POST', 'sign-out'),
  lock: () => call<undefined>('POST', 'lock'),
  unlock: (value: string) => call<Schemas['SessionOut']>('POST', 'unlock', passphrase(value)),
  active: () => call<undefined>('POST', 'active'),
  changePassphrase: (current: string, next: string) =>
    call<undefined>('POST', 'passphrase', { current, new: next } satisfies Schemas['ChangeIn']),
  deleteAll: (value: string) => call<undefined>('POST', 'delete-all', passphrase(value)),
  devices: () => call<Device[]>('GET', 'devices'),
  revokeDevice: (id: number) => call<undefined>('DELETE', `devices/${String(id)}`),
  lockSettings: () => call<Schemas['LockSettings']>('GET', 'lock-settings'),
  security: () => call<Schemas['SecurityOut']>('GET', 'security'),
  feeds: () => call<Feed[]>('GET', 'feeds'),
  addFeed: (url: string) => call<Feed>('POST', 'feeds', { url } satisfies Schemas['FeedIn']),
  removeFeed: (id: number) => call<undefined>('DELETE', `feeds/${String(id)}`),
  items: (query: ItemQuery = {}) => {
    const wanted = Object.entries(query).filter(([, value]) => value !== undefined && value !== '');
    const search = new URLSearchParams(wanted.map(([key, value]) => [key, String(value)]));
    return call<Item[]>('GET', `items?${search.toString()}`);
  },
  /** One item. `q` is the search it was opened from, so the server can say what matched. */
  item: (id: number, q = '') =>
    call<ItemDetail>('GET', `items/${String(id)}${q && `?q=${encodeURIComponent(q)}`}`),
  changeItem: (id: number, patch: ItemPatch) => call<Item>('PATCH', `items/${String(id)}`, patch),
  counts: () => call<Counts>('GET', 'counts'),
  highlights: () => call<Highlight[]>('GET', 'highlights'),
  /** `of` is what the passage is in: an item ("items/3") or an answer ("asks/5"). */
  addHighlight: ({ of, ...place }: Schemas['HighlightIn'] & { of: string }) =>
    call<Highlight>('POST', `${of}/highlights`, place),
  noteHighlight: ({ id, note }: { id: number; note: string }) =>
    call<Highlight>('PATCH', `highlights/${String(id)}`, { note } satisfies Schemas['NoteIn']),
  removeHighlight: (id: number) => call<undefined>('DELETE', `highlights/${String(id)}`),
  asks: () => call<Ask[]>('GET', 'asks'),
  ask: (question: Schemas['AskIn']) => call<Ask>('POST', 'asks', question),
  aiKeys: () => call<AiKey[]>('GET', 'ai/keys'),
  setAiKey: ({ provider, key }: { provider: AiKey['provider']; key: string }) =>
    call<AiKey>('PUT', `ai/keys/${provider}`, { key } satisfies Schemas['KeyIn']),
  removeAiKey: (provider: AiKey['provider']) => call<undefined>('DELETE', `ai/keys/${provider}`),
  aiPrices: () => call<AiPrice[]>('GET', 'ai/prices'),
  setAiPrice: (price: AiPrice) => call<AiPrice>('PUT', 'ai/prices', price),
  watches: () => call<Watches>('GET', 'watches'),
  addWatch: (watch: Schemas['WatchIn']) => call<Watches>('POST', 'watches', watch),
  /** Switches a watch on or off, or on or off for X. What is left out stays as it is. */
  setWatch: ({ id, ...change }: { id: number } & Schemas['WatchSwitch']) =>
    call<Watches>('PATCH', `watches/${String(id)}`, change),
  x: () => call<X>('GET', 'sources/x'),
  setXToken: (token: string) => call<X>('PUT', 'sources/x', { token } satisfies Schemas['XToken']),
  forgetX: () => call<X>('DELETE', 'sources/x'),
  removeWatch: (id: number) => call<Watches>('DELETE', `watches/${String(id)}`),
  digests: () => call<Digests>('GET', 'digests'),
  /** Switches digests on or off. Seven o'clock is the owner's, so the browser says where it is. */
  setDigests: (on: boolean) =>
    call<Digests>('PUT', 'digests/on', {
      on,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    } satisfies Schemas['DigestSwitch']),
  aiLimit: () => call<AiLimit>('GET', 'ai/limit'),
  setAiLimit: (limit: number | null) =>
    call<AiLimit>('PUT', 'ai/limit', { limit } satisfies Schemas['Limit']),
  aiUsage: (period: 'this' | 'last') => call<AiUsage>('GET', `ai/usage?period=${period}`),
  aiFeatures: () => call<AiChoice[]>('GET', 'ai/features'),
  setAiFeature: ({ feature, ...choice }: { feature: AiChoice['feature'] } & Schemas['ChoiceIn']) =>
    call<AiChoice>('PUT', `ai/features/${feature}`, choice satisfies Schemas['ChoiceIn']),
  youtube: () => call<YouTube>('GET', 'sources/youtube'),
  setYouTubeCredentials: (credentials: Schemas['YouTubeCredentials']) =>
    call<YouTube>('PUT', 'sources/youtube/credentials', credentials),
  disconnectYouTube: () => call<YouTube>('DELETE', 'sources/youtube'),
  hackerNews: () => call<Connection>('GET', 'sources/hacker-news'),
  setHackerNews: (enabled: boolean) =>
    call<Connection>('PUT', 'sources/hacker-news', {
      enabled,
    } satisfies Schemas['ConnectionIn']),
  setLockSettings: (minutes: LockMinutes) =>
    call<Schemas['LockSettings']>('PUT', 'lock-settings', {
      minutes,
    } satisfies Schemas['LockSettings']),
};
