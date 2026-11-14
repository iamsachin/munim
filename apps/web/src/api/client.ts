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
  devices: () => call<Device[]>('GET', 'devices'),
  revokeDevice: (id: number) => call<undefined>('DELETE', `devices/${String(id)}`),
  lockSettings: () => call<Schemas['LockSettings']>('GET', 'lock-settings'),
  feeds: () => call<Feed[]>('GET', 'feeds'),
  addFeed: (url: string) => call<Feed>('POST', 'feeds', { url } satisfies Schemas['FeedIn']),
  items: (query: ItemQuery = {}) => {
    const wanted = Object.entries(query).filter(([, value]) => value !== undefined && value !== '');
    const search = new URLSearchParams(wanted.map(([key, value]) => [key, String(value)]));
    return call<Item[]>('GET', `items?${search.toString()}`);
  },
  item: (id: number) => call<ItemDetail>('GET', `items/${String(id)}`),
  changeItem: (id: number, patch: ItemPatch) => call<Item>('PATCH', `items/${String(id)}`, patch),
  counts: () => call<Counts>('GET', 'counts'),
  setLockSettings: (minutes: LockMinutes) =>
    call<Schemas['LockSettings']>('PUT', 'lock-settings', {
      minutes,
    } satisfies Schemas['LockSettings']),
};
