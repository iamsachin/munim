import type { ComponentProps } from 'react';
import { cx } from './cx';

/** Filter pill. One of a group is on. */
export function Chip({ on, className, ...rest }: ComponentProps<'button'> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cx(
        'cursor-pointer rounded-pill border px-10 py-2 text-sm',
        on ? 'border-accent bg-accent font-semibold text-bg' : 'border-line text-mute',
        className,
      )}
      {...rest}
    />
  );
}

/** A suggested question. Outlined in the AI tint, because pressing it asks the AI. */
export function SuggestChip({ className, ...rest }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cx(
        'cursor-pointer rounded-pill border border-ai-line px-12 py-4 text-note hover:bg-accent/12',
        className,
      )}
      {...rest}
    />
  );
}
