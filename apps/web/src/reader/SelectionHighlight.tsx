import { useEffect, useEffectEvent, useState } from 'react';
import { useTheme } from '../settings';
import { useKeys } from '../shell/keys';
import { SOURCES, type Source } from '../ui/atoms';
import { buttonClass } from '../ui/Button';
import { withHighlight } from './marks';
import { useReader } from './store';
import type { HighlightEntry } from './types';

type Pending = Omit<HighlightEntry, 'note' | 'when'>;

/**
 * A "Highlight" button that appears above text selected inside a highlightable element.
 * Pressing it, or the h key, saves the selection as a highlight.
 */
export function SelectionHighlight() {
  const { update } = useReader();
  const { theme } = useTheme();
  const [found, setFound] = useState<{ top: number; left: number; entry: Pending } | null>(null);

  const read = useEffectEvent(() => {
    const selection = document.getSelection();
    const quote = selection?.toString().trim() ?? '';
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const node = range?.commonAncestorContainer;
    // The whole selection must sit inside one highlightable element.
    const home = (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>(
      '[data-highlight-title]',
    );
    const { highlightSrc: src, highlightTitle: title, highlightFrom: from } = home?.dataset ?? {};
    if (!quote || !range || !src || !Object.hasOwn(SOURCES, src) || title === undefined) {
      setFound(null);
      return;
    }
    const box = range.getBoundingClientRect();
    setFound({
      top: box.top,
      left: box.left + box.width / 2,
      entry: { quote, src: src as Source, title, from: from ?? '' },
    });
  });

  useEffect(() => {
    document.addEventListener('selectionchange', read);
    // Capture, because the lists scroll, not the page.
    document.addEventListener('scroll', read, true);
    return () => {
      document.removeEventListener('selectionchange', read);
      document.removeEventListener('scroll', read, true);
    };
  }, []);

  const save = () => {
    if (!found) return;
    update((s) => ({ highlights: withHighlight(s.highlights, found.entry) }));
    document.getSelection()?.removeAllRanges();
    setFound(null);
  };
  useKeys({ h: save }, theme.shortcuts === 'On' && found !== null);

  if (!found) return null;
  return (
    <button
      type="button"
      // Keep the selection when the button is pressed.
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onClick={save}
      // Follows the selection, so its position is computed, not a design value.
      style={{ top: found.top - 6, left: found.left }}
      className={`${buttonClass({ variant: 'primary', compact: true })} fixed z-10 -translate-x-1/2 -translate-y-full`}
    >
      Highlight
    </button>
  );
}
