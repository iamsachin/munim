import type { ReactNode } from 'react';
import { StatusDot, type Tone } from './atoms';
import { cx } from './cx';

/** Sidebar row: optional dot, name, optional count. */
export function NavRow({
  name,
  count,
  dot,
  on = false,
  disabled = false,
  onClick,
}: {
  name: string;
  count?: ReactNode;
  dot?: Tone;
  on?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-current={on ? 'page' : undefined}
      onClick={onClick}
      className={cx(
        'flex cursor-pointer items-center justify-between gap-6 rounded-5 px-8 py-dn-3 text-left enabled:hover:bg-card disabled:cursor-default disabled:opacity-55',
        on ? 'bg-card text-ink' : 'text-mute',
      )}
    >
      <span className="flex items-center gap-8">
        {dot ? <StatusDot tone={dot} /> : <span className="size-6" />}
        {name}
      </span>
      <span className="font-mono text-meta text-mute">{count}</span>
    </button>
  );
}
