import { useEffect, useEffectEvent, useState } from 'react';
import { useTheme } from '../settings';
import { useKeys } from '../shell/keys';
import { buttonClass } from '../ui/Button';
import { useAddHighlight } from './queries';

type Pending = Parameters<ReturnType<typeof useAddHighlight>['mutate']>[0];

const elementOf = (node: Node | null | undefined) =>
  node instanceof Element ? node : (node?.parentElement ?? null);

/**
 * A "Highlight" button that appears above text selected inside one unit of an item's text (a
 * paragraph, a heading, a list item). Pressing it, or the h key, saves the selection as a
 * highlight, by where it is: the item, the unit, and the characters within the unit.
 */
export function SelectionHighlight() {
  const add = useAddHighlight();
  const { theme } = useTheme();
  const [found, setFound] = useState<{ top: number; left: number; entry: Pending } | null>(null);

  const read = useEffectEvent(() => {
    const selection = document.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const selected = range?.toString() ?? '';
    const quote = selected.trim();
    const unit = elementOf(range?.startContainer)?.closest<HTMLElement>('[data-unit]');
    const text = unit?.closest<HTMLElement>('[data-highlight-item]');
    // The whole selection must sit inside one unit, and not inside text that is already
    // highlighted: that would store a second, redundant highlight.
    const inOneUnit = elementOf(range?.endContainer)?.closest('[data-unit]') === unit;
    const inHighlight = elementOf(range?.commonAncestorContainer)?.closest(
      'mark:not([data-found])',
    );
    if (!range || !quote || !unit || !text || !inOneUnit || inHighlight) {
      setFound(null);
      return;
    }
    // How far into the unit the selection starts: the length of the text before it.
    const before = document.createRange();
    before.selectNodeContents(unit);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length + (selected.length - selected.trimStart().length);
    const box = range.getBoundingClientRect();
    setFound({
      top: box.top,
      left: box.left + box.width / 2,
      entry: {
        item: Number(text.dataset.highlightItem),
        reply: text.dataset.highlightReply ? Number(text.dataset.highlightReply) : null,
        unit: Number(unit.dataset.unit),
        start,
        end: start + quote.length,
        quote,
      },
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
    add.mutate(found.entry);
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
