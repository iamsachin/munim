import type { ComponentProps } from 'react';
import { cx } from './cx';

const SIZE = {
  sm: 'px-9 py-5 text-note',
  md: 'px-9 py-6 text-note',
  lg: 'px-10 py-8',
};

/**
 * Text field. Focus is shown by the accent border, as designed. `ai` is the field inside an AI card.
 * Callers must supply a label or aria-label.
 */
export function Input({
  size = 'sm',
  tone = 'field',
  className,
  ...rest
}: Omit<ComponentProps<'input'>, 'size'> & { size?: keyof typeof SIZE; tone?: 'field' | 'ai' }) {
  return (
    <input
      className={cx(
        'min-w-0 rounded-5 border text-ink outline-none placeholder:text-mute focus:border-accent',
        tone === 'ai' ? 'border-ai-line bg-bg' : 'border-line bg-card',
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
}
