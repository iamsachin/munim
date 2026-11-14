import type { ComponentProps } from 'react';
import { cx } from './cx';

/** Ghost sizes, named by the prototype's padding. `stretch` fills the height of the input beside it. */
const GHOST = {
  sm: 'px-10 py-3 text-sm font-medium',
  md: 'px-10 py-4 text-sm font-medium',
  lg: 'px-10 py-5 text-sm font-medium',
  mdw: 'px-12 py-4 text-sm font-medium',
  lgw: 'px-12 py-5 text-sm font-medium',
  stretch: 'px-10 text-note font-semibold',
};

interface Style {
  /** ghost: bordered secondary action. primary: solid accent. accent: accent outline, stretches beside an input. */
  variant?: 'ghost' | 'primary' | 'accent';
  /** Ghost only. */
  size?: keyof typeof GHOST;
  /** Ghost only: destructive action. */
  danger?: boolean;
  /** Primary only: the smaller size used in toolbars. */
  compact?: boolean;
}

/** The button look as a class string, for links that should look like buttons. */
export function buttonClass({
  variant = 'ghost',
  size = 'sm',
  danger = false,
  compact = false,
}: Style = {}) {
  return cx(
    'inline-block cursor-pointer rounded-5 leading-ui whitespace-nowrap disabled:cursor-default disabled:opacity-55',
    variant === 'ghost' &&
      cx(
        'border border-line',
        GHOST[size],
        danger
          ? 'text-a3 not-disabled:hover:border-a3'
          : 'text-ink not-disabled:hover:border-accent',
      ),
    variant === 'primary' &&
      cx(
        'bg-accent font-semibold text-bg not-disabled:hover:brightness-108',
        compact ? 'px-12 py-4 text-sm' : 'px-16 py-6 text-btn',
      ),
    variant === 'accent' &&
      'border border-accent px-12 text-note font-semibold text-accent not-disabled:hover:bg-accent/14',
  );
}

export function Button({
  variant,
  size,
  danger,
  compact,
  type = 'button',
  className,
  ...rest
}: ComponentProps<'button'> & Style) {
  return (
    <button
      type={type}
      className={cx(buttonClass({ variant, size, danger, compact }), className)}
      {...rest}
    />
  );
}
