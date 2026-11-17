import { cx } from './cx';

/** On/Off pill. `label` names what is being switched, for screen readers. */
export function Toggle({
  on,
  label,
  onChange,
  disabled = false,
  title,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
  /** It cannot be switched yet; `title` says why. */
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      title={title}
      onClick={() => {
        onChange(!on);
      }}
      className={cx(
        'w-52 cursor-pointer rounded-pill border py-4 text-sm leading-ui font-semibold disabled:cursor-default',
        on ? 'border-accent bg-accent text-bg' : 'border-line text-mute',
      )}
    >
      {on ? 'On' : 'Off'}
    </button>
  );
}
