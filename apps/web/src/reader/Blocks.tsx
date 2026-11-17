import { useMemo, useState } from 'react';
import { cx } from '../ui/cx';
import type { ItemDetail } from '../api/client';
import { within, type Range } from './found';
import { isBare, nameOf } from './links';
import { Marked } from './Marked';
import { Player } from './Player';
import { unitCount, type Block, type Marks, type Span } from './units';

/** Running totals: where each thing starts, given how long each one is. */
const starts = (lengths: readonly number[]) =>
  lengths.reduce<number[]>((at, length, i) => [...at, (at[i] ?? 0) + length], [0]).slice(0, -1);
const firstUnits = (blocks: readonly Block[]) => starts(blocks.map(unitCount));
const startsOf = (spans: readonly Span[]) => starts(spans.map((span) => span.text.length));

const READ = 'text-read leading-read text-pretty';

/**
 * An item's text, drawn from the blocks the server made of it. Every source's text arrives in
 * this one shape, and none of it as markup: each block and each mark is drawn here, so nothing a
 * source sends can run or restyle the page.
 */
export function Blocks({
  blocks,
  where,
  marks,
  links,
  compact = false,
  className,
}: {
  blocks: readonly Block[];
  /** The item these blocks belong to, and which reply if they are one: a selection in them is
   * saved as a highlight there. */
  where: { item: number; reply: number | null };
  /** What to mark in each unit of the text: highlights, and what a search matched. */
  marks: readonly Marks[] | undefined;
  /** What is known of the pages the item links to: each link is shown with its site's icon,
   * and a bare address by the page's title. */
  links?: readonly Linked[];
  /** For a reply: the size of the text around it, and less space between blocks. */
  compact?: boolean;
  className?: string;
}) {
  // A reply wraps as the design draws it; only reading text is balanced.
  const read = compact ? '' : READ;
  // The number of each block's first unit. A highlight is stored by its unit's number.
  const first = useMemo(() => firstUnits(blocks), [blocks]);
  const known = useMemo(() => new Map(links?.map((link) => [link.href, link])), [links]);
  /** The runs of one unit, each given the part of the unit's marks that falls in it. */
  const run = (unit: number, spans: readonly Span[]) =>
    startsOf(spans).map((at, i) => {
      const span = spans[i];
      return (
        span && (
          <Run
            key={i}
            span={span}
            link={span.href ? known.get(span.href) : undefined}
            marked={within(marks?.[unit]?.marked ?? [], at, span.text.length)}
            found={within(marks?.[unit]?.found ?? [], at, span.text.length)}
          />
        )
      );
    });

  return (
    // A long address has nowhere to break, and would run out of a narrow pane.
    <div
      data-highlight-item={where.item}
      data-highlight-reply={where.reply ?? ''}
      className={cx('flex flex-col wrap-anywhere', compact ? 'gap-6' : 'gap-12', className)}
    >
      {blocks.map((block, i) => {
        const unit = first[i] ?? 0;
        switch (block.type) {
          case 'paragraph':
            // pre-line keeps the line breaks an author put inside a paragraph, as in verse.
            return (
              <p key={i} data-unit={unit} className={cx(read, 'whitespace-pre-line')}>
                {run(unit, block.spans)}
              </p>
            );
          case 'heading':
            return block.level === 2 ? (
              <h3 key={i} data-unit={unit} className="pt-6 text-title leading-title font-semibold">
                {run(unit, block.spans)}
              </h3>
            ) : (
              <h4 key={i} data-unit={unit} className="text-read font-semibold">
                {run(unit, block.spans)}
              </h4>
            );
          case 'quote': {
            // A quotation of several paragraphs arrives as several blocks: draw them as one.
            if (i > 0 && blocks.at(i - 1)?.type === 'quote') return null;
            const paragraphs: (readonly Span[])[] = [];
            for (const next of blocks.slice(i)) {
              if (next.type !== 'quote') break;
              paragraphs.push(next.spans);
            }
            return (
              <blockquote
                key={i}
                className={cx(read, 'flex flex-col gap-12 border-l-2 border-line pl-12 text-mute')}
              >
                {paragraphs.map((spans, n) => (
                  <p key={n} data-unit={unit + n} className="whitespace-pre-line">
                    {run(unit + n, spans)}
                  </p>
                ))}
              </blockquote>
            );
          }
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List
                key={i}
                className={cx(
                  read,
                  'flex flex-col gap-4 pl-20',
                  block.ordered ? 'list-decimal' : 'list-disc',
                )}
              >
                {block.items.map((spans, n) => (
                  <li key={n} data-unit={unit + n} className="whitespace-pre-line">
                    {run(unit + n, spans)}
                  </li>
                ))}
              </List>
            );
          }
          case 'code':
            return (
              <pre
                key={i}
                // Code scrolls sideways rather than wrapping, so the keyboard must be able to reach it.
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                className="overflow-x-auto rounded-5 border border-line bg-card p-10 font-mono text-sm leading-read"
              >
                {block.text}
              </pre>
            );
          case 'image':
            return <Picture key={block.src} src={block.src} alt={block.alt} />;
          case 'video':
            return <Player key={block.video} src={block.src} alt={block.alt} video={block.video} />;
        }
      })}
    </div>
  );
}

type Linked = ItemDetail['links'][number];

/** The icon of a link's site, fetched through Munim's server. A site with none shows nothing. */
function SiteIcon({ src, className }: { src: string; className: string }) {
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={className}
      onError={(e) => {
        e.currentTarget.hidden = true;
      }}
    />
  );
}

function Run({
  span,
  link,
  marked,
  found,
}: {
  span: Span;
  link: Linked | undefined;
  marked: readonly Range[];
  found: readonly Range[];
}) {
  const text = <Marked text={span.text} marked={marked} found={found} />;
  const { marks } = span;
  const styled = (
    <span
      className={cx(
        marks.includes('bold') && 'font-semibold',
        marks.includes('italic') && 'italic',
        marks.includes('code') && 'rounded-2 bg-card px-3 font-mono',
      )}
    >
      {text}
    </span>
  );
  if (!span.href) return marks.length ? styled : text;
  if (isBare(span.text, span.href)) {
    const name = link?.title || nameOf(span.href);
    return (
      // A bare address is a card one line tall: its site's icon and the page's title. The
      // title is drawn by CSS and the address stays in the text, unseen, so that the paragraph
      // has the same characters as before and a highlight in it stays where it was made.
      <a
        href={span.href}
        target="_blank"
        rel="noreferrer"
        aria-label={name}
        title={span.href}
        data-title={name}
        className="relative inline-flex h-lh max-w-full items-center gap-4 rounded-4 border border-line bg-card px-6 align-bottom text-ink no-underline after:min-w-0 after:truncate after:content-[attr(data-title)] hover:border-accent"
      >
        {link && <SiteIcon src={link.icon} className="size-14 shrink-0 rounded-2" />}
        <span className="sr-only">{marks.length ? styled : text}</span>
      </a>
    );
  }
  return (
    // Underlined as well as coloured, so a link does not depend on colour alone.
    <a
      href={span.href}
      target="_blank"
      rel="noreferrer"
      title={link?.title || undefined}
      className="underline underline-offset-2"
    >
      {link && <SiteIcon src={link.icon} className="mr-3 inline size-12 rounded-2 align-middle" />}
      {marks.length ? styled : text}
    </a>
  );
}

/** An image, fetched through Munim's server. If it cannot be had, it says so in its place. */
function Picture({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <p className="rounded-5 border border-line px-10 py-8 text-note text-mute">
        {alt ? `An image could not be loaded: ${alt}` : 'An image could not be loaded.'}
      </p>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => {
        setFailed(true);
      }}
      className="max-w-full self-start rounded-6 border border-line"
    />
  );
}
