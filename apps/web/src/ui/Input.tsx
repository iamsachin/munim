import type { ComponentProps } from 'react';
import { cx } from './cx';

/** Text field. Focus is shown by the accent border, as designed. Callers must supply a label or aria-label. */
export function Input({
  size = 'sm',
  className,
  ...rest
}: Omit<ComponentProps<'input'>, 'size'> & { size?: 'sm' | 'md' }) {
  return (
    <input
      className={cx(
        'min-w-0 rounded-5 border border-line bg-card text-ink outline-none placeholder:text-mute focus:border-accent',
        size === 'sm' ? 'px-9 py-5 text-note' : 'px-10 py-8',
        className,
      )}
      {...rest}
    />
  );
}
