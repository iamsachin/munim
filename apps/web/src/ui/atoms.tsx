import { useState, type ComponentProps } from 'react';
import { cx } from './cx';
import { SOURCE_ICONS } from './sourceIcons';

export type Tone = 'accent' | 'ink' | 'a2' | 'a3' | 'a4' | 'ok' | 'line';

const TEXT: Record<Tone, string> = {
  accent: 'text-accent',
  ink: 'text-ink',
  a2: 'text-a2',
  a3: 'text-a3',
  a4: 'text-a4',
  ok: 'text-ok',
  line: 'text-line',
};

const BG: Record<Tone, string> = {
  accent: 'bg-accent',
  ink: 'bg-ink',
  a2: 'bg-a2',
  a3: 'bg-a3',
  a4: 'bg-a4',
  ok: 'bg-ok',
  line: 'bg-line',
};

export const SOURCES = {
  RD: { name: 'Reddit', tone: 'accent' },
  X: { name: 'X', tone: 'ink' },
  HN: { name: 'Hacker News', tone: 'a2' },
  YT: { name: 'YouTube', tone: 'a4' },
  RSS: { name: 'RSS', tone: 'a2' },
} as const satisfies Record<string, { name: string; tone: Tone }>;

export type Source = keyof typeof SOURCES;

export function AiBadge() {
  return (
    <span className="rounded-4 bg-accent px-6 py-1 font-mono text-label font-medium tracking-label text-bg">
      AI
    </span>
  );
}

export function SectionLabel({
  as: Tag = 'div',
  className,
  ...rest
}: ComponentProps<'div'> & { as?: 'div' | 'h2' | 'h3' }) {
  return (
    <Tag
      className={cx('font-mono text-label tracking-label text-mute uppercase', className)}
      {...rest}
    />
  );
}

/**
 * Where something came from: its site's own icon, or else the source's mark in the source's
 * colour (owner's decision, 2026-11-15; the handoff has a two- or three-letter code here). The
 * full name is read to screen readers and shown on hover. `inheritSize` is for metadata lines,
 * where the icon is the size of the line's text.
 */
export function SourceTag({
  src,
  icon,
  inheritSize = false,
}: {
  src: Source;
  /** Where the site's own icon is, at Munim's server. Without one, or if it cannot be had,
   * the source's mark is drawn. */
  icon?: string | null;
  inheritSize?: boolean;
}) {
  const { name, tone } = SOURCES[src];
  const [failed, setFailed] = useState(false);
  const size = inheritSize ? 'size-12' : 'size-14';
  const own = Boolean(icon) && !failed;
  return (
    // The name is shown on hover as well as read out: an icon alone can be unfamiliar.
    <span
      title={name}
      className={cx('inline-flex flex-col items-start gap-2 align-middle', TEXT[tone])}
    >
      {icon && own ? (
        <img
          src={icon}
          alt=""
          className={cx(size, 'rounded-2')}
          onError={() => {
            setFailed(true);
          }}
        />
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={size}>
          <path d={SOURCE_ICONS[src]} />
        </svg>
      )}
      {/* A feed's own icon does not say it is a feed, so it is labelled (owner's request).
          Not in a line of metadata, which names the feed beside it. */}
      {src === 'RSS' && own && !inheritSize && (
        <span aria-hidden="true" className="font-mono text-micro leading-none">
          rss
        </span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}

export function StatusDot({ tone, size = 6 }: { tone: Tone; size?: 6 | 7 }) {
  return (
    <span
      className={cx(
        'inline-block shrink-0 rounded-pill',
        size === 7 ? 'size-7' : 'size-6',
        BG[tone],
      )}
    />
  );
}

export function Highlight(props: ComponentProps<'mark'>) {
  return (
    <mark className="rounded-2 bg-mark box-decoration-clone px-2 py-1 text-inherit" {...props} />
  );
}

/**
 * A word a search matched, marked where it is. The one the owner has stepped to is outlined.
 * `data-found` is how the thread pane counts them and finds where they are.
 */
export function Found(props: ComponentProps<'mark'>) {
  return (
    <mark
      data-found
      // Ink, whatever the text around it: a match in a muted quotation must still be readable.
      className="rounded-2 bg-found box-decoration-clone px-2 py-1 text-ink data-current:outline data-current:outline-a2"
      {...props}
    />
  );
}

/** Sits above a row's stretched RowButton, hence relative z-1. */
export function SaveDot({ saved, onToggle }: { saved: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label="Save"
      aria-pressed={saved}
      onClick={onToggle}
      className="relative z-1 flex size-16 cursor-pointer items-center justify-center rounded-pill"
    >
      <span
        className={cx(
          'size-8 rounded-pill border',
          saved ? 'border-accent bg-accent' : 'border-dim',
        )}
      />
    </button>
  );
}

/**
 * The small picture in a row: the item's own still if it has one, and a striped placeholder
 * naming its kind if it has none or it cannot be loaded. Sits above a row's stretched RowButton.
 */
export function MediaThumb({
  kind,
  src,
  onClick,
}: {
  kind: 'Video' | 'Image';
  src?: string | null;
  onClick: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      className="stripes relative z-1 flex h-28 w-40 flex-none cursor-zoom-in items-center justify-center overflow-hidden rounded-4 border border-line hover:border-accent"
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => {
            setFailed(true);
          }}
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden="true" className="rounded-2 bg-bg px-3 font-mono text-micro text-mute">
          {kind === 'Video' ? 'VID' : 'IMG'}
        </span>
      )}
      <span className="sr-only">Preview {kind.toLowerCase()}</span>
    </button>
  );
}

/** A key on the keyboard. */
export function Kbd(props: ComponentProps<'kbd'>) {
  return (
    <kbd
      className="rounded-4 border border-line bg-card px-5 font-mono text-code text-ink"
      {...props}
    />
  );
}
