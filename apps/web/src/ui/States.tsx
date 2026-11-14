import type { ReactNode } from 'react';
import { StatusDot } from './atoms';
import { Button } from './Button';
import { cx } from './cx';

/** What a list says when it has nothing to show: one muted line. `compact` is for inside a card or pane. */
export function EmptyState({
  compact = false,
  children,
}: {
  compact?: boolean;
  children: ReactNode;
}) {
  return <p className={cx('text-mute', compact ? 'py-12' : 'px-16 py-24')}>{children}</p>;
}

const WIDTHS = ['w-1/2', 'w-2/3', 'w-2/5', 'w-3/5'];

/**
 * Placeholder rows while a list loads. They are still, not animated, and the same height as real
 * rows, so nothing jumps when the data arrives. `what` names the list for screen readers.
 */
export function LoadingRows({ what, rows = 6 }: { what: string; rows?: number }) {
  return (
    <div role="status" aria-label={`Loading ${what}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="flex items-center border-b border-rule px-16 py-dn-5"
        >
          <span className={cx('h-10 rounded-4 bg-card', WIDTHS[i % WIDTHS.length])} />
          {/* An empty line of text, so the row is exactly as tall as one with content. */}
          <span className="invisible">&nbsp;</span>
        </div>
      ))}
    </div>
  );
}

/** What a list says when it could not be loaded: what failed, why if known, and a way to retry. */
export function ErrorState({
  what,
  detail,
  onRetry,
}: {
  what: string;
  detail?: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-8 px-16 py-24">
      <div className="flex items-center gap-8">
        <StatusDot tone="a3" />
        Could not load {what}.
      </div>
      {detail && <div className="font-mono text-meta text-mute">{detail}</div>}
      <Button size="md" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
