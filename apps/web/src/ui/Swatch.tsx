import { cx } from './cx';

/** Round colour choice, ringed when selected. */
export function Swatch({
  name,
  color,
  on,
  onPick,
}: {
  name: string;
  color: string;
  on: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={on}
      title={name}
      onClick={onPick}
      style={{ background: color }}
      className={cx(
        'size-24 cursor-pointer rounded-pill border-2 border-panel ring-2',
        on ? 'ring-ink' : 'ring-transparent',
      )}
    />
  );
}
