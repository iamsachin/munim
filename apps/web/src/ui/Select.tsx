import type { ComponentProps } from 'react';
import { cx } from './cx';

/** A native select dressed like the small Input. For choices too many or too long for chips. */
export function Select({ className, ...rest }: ComponentProps<'select'>) {
  return (
    <select
      className={cx(
        'min-w-0 cursor-pointer rounded-5 border border-line bg-card px-9 py-5 text-note text-ink outline-none focus:border-accent disabled:cursor-default disabled:opacity-55',
        className,
      )}
      {...rest}
    />
  );
}
