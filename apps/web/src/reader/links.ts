// How a link in an item's text is shown: a bare address as a small card, a worded link as it is.

const SCHEME = /^https?:\/\//;
const NAME_CHARACTERS = 48;

const plain = (address: string) => address.replace(SCHEME, '').replace(/^www\./, '');

/**
 * Whether a link's own text is nothing but its address, as when someone pastes one. Such a link
 * says nothing by itself, so it is shown as a card with the page's title; a link with words of
 * its own keeps them, or the sentence around it would stop making sense.
 */
export function isBare(text: string, href: string): boolean {
  // Sources cut a long address short, with an ellipsis.
  const shown = text.trim().replace(/(…|\.\.\.)$/, '');
  if (!shown || /\s/.test(shown)) return false;
  if (SCHEME.test(shown)) return true;
  return shown.includes('.') && plain(href).startsWith(plain(shown));
}

/** What a card is called until its page's title is known, or if it has none: its site and path. */
export function nameOf(href: string): string {
  const name = plain(href)
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '');
  return name.length > NAME_CHARACTERS ? `${name.slice(0, NAME_CHARACTERS)}…` : name;
}
