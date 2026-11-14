/** "⌘" on Apple keyboards, "Ctrl" elsewhere. */
export const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/** g, then one of these keys, goes to a view. The command palette and the help list read this too. */
export const GO: Record<string, { name: string; to: string }> = {
  t: { name: 'Today', to: '/today' },
  s: { name: 'Stream', to: '/stream' },
  l: { name: 'Read later', to: '/later' },
  v: { name: 'Saved', to: '/saved' },
  h: { name: 'Highlights', to: '/highlights' },
  r: { name: 'RSS', to: '/rss' },
  d: { name: 'Digest', to: '/digest' },
  w: { name: 'Watches', to: '/watches' },
  a: { name: 'Ask', to: '/ask' },
  c: { name: 'Connections', to: '/connections' },
  i: { name: 'AI', to: '/ai' },
  ',': { name: 'Security and settings', to: '/settings' },
};

/** The shortcut list shown by "?". Keys handled in a screen are listed here by hand; keep them in step. */
export const HELP: { title: string; rows: { keys: string[]; what: string }[] }[] = [
  {
    title: 'Anywhere',
    rows: [
      { keys: [MOD, 'K'], what: 'Commands' },
      { keys: ['/'], what: 'Ask' },
      { keys: ['?'], what: 'This list' },
      { keys: ['Esc'], what: 'Close' },
    ],
  },
  {
    title: 'Stream and RSS',
    rows: [
      { keys: ['j'], what: 'Next item' },
      { keys: ['k'], what: 'Previous item' },
      { keys: ['a'], what: 'Ask about it' },
      { keys: ['h'], what: 'Highlight selected text' },
      { keys: ['s'], what: 'Save or unsave (Stream)' },
      { keys: ['l'], what: 'Read later (Stream)' },
    ],
  },
  {
    title: 'Go to',
    rows: Object.entries(GO).map(([key, { name }]) => ({ keys: ['g', key], what: name })),
  },
];

/** The commands whose label contains the query, ignoring case. A blank query matches them all. */
export function matchCommands<T extends { label: string }>(commands: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
}
