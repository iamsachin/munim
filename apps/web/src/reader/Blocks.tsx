import { useState } from 'react';
import type { ItemDetail } from '../api/client';
import { cx } from '../ui/cx';
import { highlightable, Marked } from './Marked';

export type Block = ItemDetail['blocks'][number];
type Span = Extract<Block, { type: 'paragraph' }>['spans'][number];

const READ = 'text-read leading-read text-pretty';

/**
 * An item's text, drawn from the blocks the server made of it. Every source's text arrives in
 * this one shape, and none of it as markup: each block and each mark is drawn here, so nothing a
 * source sends can run or restyle the page.
 */
export function Blocks({
  blocks,
  item,
  quotes,
  compact = false,
  className,
}: {
  blocks: readonly Block[];
  /** What the text belongs to, so a selection in it can be saved as a highlight. */
  item: { src: string; title: string; from: string };
  /** The owner's highlights in this item, marked where they appear. */
  quotes: readonly string[];
  /** For a reply: the size of the text around it, and less space between blocks. */
  compact?: boolean;
  className?: string;
}) {
  const mine = highlightable(item);
  // A reply wraps as the design draws it; only reading text is balanced.
  const read = compact ? '' : READ;
  const run = (spans: readonly Span[]) =>
    spans.map((span, i) => <Run key={i} span={span} quotes={quotes} />);

  return (
    // A long address has nowhere to break, and would run out of a narrow pane.
    <div className={cx('flex flex-col wrap-anywhere', compact ? 'gap-6' : 'gap-12', className)}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'paragraph':
            // pre-line keeps the line breaks an author put inside a paragraph, as in verse.
            return (
              <p key={i} className={cx(read, 'whitespace-pre-line')} {...mine}>
                {run(block.spans)}
              </p>
            );
          case 'heading':
            return block.level === 2 ? (
              <h3 key={i} className="pt-6 text-title leading-title font-semibold" {...mine}>
                {run(block.spans)}
              </h3>
            ) : (
              <h4 key={i} className="text-read font-semibold" {...mine}>
                {run(block.spans)}
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
                  <p key={n} className="whitespace-pre-line" {...mine}>
                    {run(spans)}
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
                  <li key={n} className="whitespace-pre-line" {...mine}>
                    {run(spans)}
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
        }
      })}
    </div>
  );
}

function Run({ span, quotes }: { span: Span; quotes: readonly string[] }) {
  const text = <Marked text={span.text} quotes={quotes} />;
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
  return (
    // Underlined as well as coloured, so a link does not depend on colour alone.
    <a href={span.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
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
