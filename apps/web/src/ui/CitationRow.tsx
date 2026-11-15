import { Link } from 'react-router';
import { SourceTag, type Source } from './atoms';
import { cx } from './cx';

/**
 * One cited item. With `index` it is a numbered citation with its origin; without, a plain item
 * reference. With `quote` it shows the words of the item that were relied on, under its title
 * or, if no title is given, in its place. With `to` the whole row is a link there.
 */
export function CitationRow({
  index,
  src,
  title,
  quote,
  from,
  icon,
  to,
  surface = 'bg',
}: {
  index?: number;
  src: Source;
  /** Where the icon of the item's site is, at the server. */
  icon?: string | null;
  title?: string;
  quote?: string;
  from?: string;
  to?: string;
  surface?: 'bg' | 'card';
}) {
  const className = cx(
    // Centred, not on the baseline: the source is an icon, which has none.
    'grid items-center gap-x-10 rounded-5 px-10 py-6',
    index === undefined
      ? 'grid-cols-[34px_minmax(0,1fr)]'
      : 'grid-cols-[20px_34px_minmax(0,1fr)_auto]',
    surface === 'bg' ? 'bg-bg' : 'bg-card',
    to && 'text-ink hover:bg-card',
  );
  const cells = (
    <>
      {index !== undefined && <span className="font-mono text-code text-accent">{index}</span>}
      <SourceTag src={src} icon={icon} />
      <span className="flex min-w-0 flex-col gap-2">
        {title && <span className="truncate">{title}</span>}
        {quote && <span className={cx('text-pretty', title && 'text-mute')}>“{quote}”</span>}
      </span>
      {index !== undefined && <span className="font-mono text-meta text-mute">{from}</span>}
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {cells}
    </Link>
  ) : (
    <div className={className}>{cells}</div>
  );
}
