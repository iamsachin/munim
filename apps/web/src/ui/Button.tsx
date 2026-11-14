import type { ComponentProps } from 'react';
import { cx } from './cx';

const GHOST_SIZE = { sm: 'py-3', md: 'py-4', lg: 'py-5' };

interface Props extends ComponentProps<'button'> {
  /** ghost: bordered secondary action. primary: solid accent. accent: accent outline, stretches beside an input. */
  variant?: 'ghost' | 'primary' | 'accent';
  /** Ghost only: vertical padding of 3, 4 or 5px. */
  size?: keyof typeof GHOST_SIZE;
  /** Ghost only: destructive action. */
  danger?: boolean;
}

export function Button({
  variant = 'ghost',
  size = 'sm',
  danger = false,
  type = 'button',
  className,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={cx(
        'cursor-pointer rounded-5 leading-ui disabled:cursor-default disabled:opacity-55',
        variant === 'ghost' &&
          cx(
            'border border-line px-10 text-sm font-medium',
            GHOST_SIZE[size],
            danger ? 'text-a3 enabled:hover:border-a3' : 'text-ink enabled:hover:border-accent',
          ),
        variant === 'primary' &&
          'bg-accent px-16 py-6 text-btn font-semibold text-bg enabled:hover:brightness-108',
        variant === 'accent' &&
          'border border-accent px-12 text-note font-semibold text-accent enabled:hover:bg-accent/14',
        className,
      )}
      {...rest}
    />
  );
}
