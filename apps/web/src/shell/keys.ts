import { useEffect, useEffectEvent } from 'react';

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * The key a single-key shortcut may act on, or null when the event must be left alone: a modifier
 * is held, the owner is typing in a field, or a dialog is open.
 */
export function shortcutKey(e: KeyboardEvent): string | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return null;
  const target = e.target;
  if (target instanceof HTMLElement && (target.isContentEditable || TYPING.has(target.tagName))) {
    return null;
  }
  if (document.querySelector('dialog[open]')) return null;
  return e.key;
}

/** Single-key shortcuts for the screen that calls it. `enabled` is the owner's shortcuts setting. */
export function useKeys(keys: Record<string, () => void>, enabled: boolean) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const key = shortcutKey(e);
    if (key === null || !Object.hasOwn(keys, key)) return;
    e.preventDefault();
    keys[key]?.();
  });
  useEffect(() => {
    if (!enabled) return;
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [enabled]);
}

export const focusId = (id: string) => {
  document.getElementById(id)?.focus();
};
