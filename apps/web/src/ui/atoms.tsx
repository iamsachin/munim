import type { ComponentProps } from 'react';
import { cx } from './cx';

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
  IG: { name: 'Instagram', tone: 'a3' },
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
 * Two- or three-letter source code in the source's colour; the full name is read to screen readers.
 * `inheritSize` is for metadata lines, where the design sets it at the line's own size.
 */
export function SourceTag({ src, inheritSize = false }: { src: Source; inheritSize?: boolean }) {
  const { name, tone } = SOURCES[src];
  return (
    <span className={cx('font-mono font-medium', !inheritSize && 'text-code', TEXT[tone])}>
      <span aria-hidden="true">{src}</span>
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

/** Striped placeholder until real thumbnails exist. Sits above a row's stretched RowButton. */
export function MediaThumb({ kind, onClick }: { kind: 'Video' | 'Image'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="stripes relative z-1 flex h-28 w-40 flex-none cursor-zoom-in items-center justify-center rounded-4 border border-line hover:border-accent"
    >
      <span aria-hidden="true" className="rounded-2 bg-bg px-3 font-mono text-micro text-mute">
        {kind === 'Video' ? 'VID' : 'IMG'}
      </span>
      <span className="sr-only">Preview {kind.toLowerCase()}</span>
    </button>
  );
}
