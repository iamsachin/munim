import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from './cx';

/**
 * A modal dialog that fills the screen and places its content. The native <dialog> supplies the
 * focus trap, Escape to close and the backdrop; a click outside the content also closes it.
 */
export function Modal({
  label,
  onClose,
  align = 'center',
  className,
  children,
}: {
  label: string;
  onClose: () => void;
  /** `top` sits the content near the top of the screen, for the command palette. */
  align?: 'center' | 'top';
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // Development runs effects twice; calling showModal() on an open dialog throws.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    // The keyboard equivalent of clicking outside is Escape, which <dialog> handles itself.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        // The dialog fills the screen; a click on it rather than on its content is a click outside.
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        'm-0 size-full max-h-none max-w-none justify-center bg-transparent p-32 text-ink backdrop:bg-scrim open:flex',
        align === 'center' ? 'items-center' : 'items-start pt-[12vh]',
        className,
      )}
    >
      {children}
    </dialog>
  );
}
