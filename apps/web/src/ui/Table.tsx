import type { ComponentProps } from 'react';
import { cx } from './cx';

/*
 * A table drawn on CSS grid. Pass the same grid-cols-[...] class to TableHeader and every TableRow.
 * Children of TableHeader must be Th, children of TableRow must be Cell. If the rows scroll, wrap
 * them in TableBody.
 */

export function Table({ label, ...rest }: ComponentProps<'div'> & { label: string }) {
  return <div role="table" aria-label={label} {...rest} />;
}

export function TableHeader({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      role="row"
      className={cx(
        'grid gap-x-12 border-b border-line px-16 py-5 font-mono text-label tracking-label text-mute uppercase',
        className,
      )}
      {...rest}
    />
  );
}

export function Th(props: ComponentProps<'span'>) {
  return <span role="columnheader" {...props} />;
}

export function TableBody(props: ComponentProps<'div'>) {
  return <div role="rowgroup" {...props} />;
}

/** Row padding in the prototype is 4, 5 or 6px times the density. */
const PAD = { 4: 'py-dn-4', 5: 'py-dn-5', 6: 'py-dn-6' };

export function TableRow({
  selected = false,
  pad = 5,
  hover = true,
  className,
  ...rest
}: ComponentProps<'div'> & { selected?: boolean; pad?: keyof typeof PAD; hover?: boolean }) {
  return (
    <div
      role="row"
      aria-current={selected || undefined}
      className={cx(
        'relative grid gap-x-12 border-b border-rule px-16',
        PAD[pad],
        hover && 'hover:bg-card',
        selected && 'row-bar bg-card',
        className,
      )}
      {...rest}
    />
  );
}

export function Cell(props: ComponentProps<'div'>) {
  return <div role="cell" {...props} />;
}

/** The row's main action. Its hit area stretches over the whole TableRow; other controls in the row sit above it. */
export function RowButton({ className, ...rest }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cx('cursor-pointer text-left after:absolute after:inset-0', className)}
      {...rest}
    />
  );
}
