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
