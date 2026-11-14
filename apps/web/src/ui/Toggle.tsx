import { cx } from './cx';

/** On/Off pill. `label` names what is being switched, for screen readers. */
export function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => {
        onChange(!on);
      }}
      className={cx(
        'w-52 cursor-pointer rounded-pill border py-4 text-sm leading-ui font-semibold',
        on ? 'border-accent bg-accent text-bg' : 'border-line text-mute',
      )}
    >
      {on ? 'On' : 'Off'}
    </button>
  );
}
