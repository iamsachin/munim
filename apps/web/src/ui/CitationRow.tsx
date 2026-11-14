import { SourceTag, type Source } from './atoms';
import { cx } from './cx';

/** One cited item. With `index` it is a numbered citation with its origin; without, a plain item reference. */
export function CitationRow({
  index,
  src,
  title,
  from,
  surface = 'bg',
}: {
  index?: number;
  src: Source;
  title: string;
  from?: string;
  surface?: 'bg' | 'card';
}) {
  return (
    <div
      className={cx(
        'grid items-baseline gap-x-10 rounded-5 px-10 py-6',
        index === undefined
          ? 'grid-cols-[34px_minmax(0,1fr)]'
          : 'grid-cols-[20px_34px_minmax(0,1fr)_auto]',
        surface === 'bg' ? 'bg-bg' : 'bg-card',
      )}
    >
      {index !== undefined && <span className="font-mono text-code text-accent">{index}</span>}
      <SourceTag src={src} />
      <span className="truncate">{title}</span>
      {index !== undefined && <span className="font-mono text-meta text-mute">{from}</span>}
    </div>
  );
}
