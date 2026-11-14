import type { ComponentProps } from 'react';
import { cx } from './cx';

/** Bordered surface. `ai` is the accent-tinted card reserved for AI output. Callers set the gap. */
export function Card({
  tone = 'panel',
  compact = false,
  className,
  ...rest
}: ComponentProps<'section'> & { tone?: 'panel' | 'ai'; compact?: boolean }) {
  return (
    <section
      className={cx(
        'flex min-w-0 flex-col rounded-6 border',
        compact ? 'p-12' : 'p-14',
        tone === 'ai' ? 'border-ai-line bg-ai-fill' : 'border-line bg-panel',
        className,
      )}
      {...rest}
    />
  );
}
