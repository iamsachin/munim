import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { StatusDot, type Tone } from './atoms';
import { cx } from './cx';

const BASE = 'flex items-center justify-between gap-6 rounded-5 px-8 py-dn-3 text-left';

/** Sidebar row: optional dot, name, optional count. Without `to` it is a planned, disabled entry. */
export function NavRow({
  name,
  count,
  dot,
  to,
}: {
  name: string;
  count?: ReactNode;
  dot?: Tone;
  to?: string;
}) {
  const body = (
    <>
      <span className="flex items-center gap-8">
        {dot ? <StatusDot tone={dot} /> : <span className="size-6" />}
        {name}
      </span>
      <span className="font-mono text-meta text-mute">{count}</span>
    </>
  );
  if (to === undefined) {
    return (
      <button type="button" disabled className={cx(BASE, 'text-mute opacity-55')}>
        {body}
      </button>
    );
  }
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cx(BASE, 'hover:bg-card', isActive ? 'bg-card text-ink' : 'text-mute')
      }
    >
      {body}
    </NavLink>
  );
}
