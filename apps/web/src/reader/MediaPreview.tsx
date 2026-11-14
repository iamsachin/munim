import { useEffect, useRef } from 'react';
import { SourceTag } from '../ui/atoms';
import { Button } from '../ui/Button';
import type { Item } from './types';

/** Modal preview of an item's media. A striped placeholder stands in until real media exists. */
export function MediaPreview({
  item,
  onOpenThread,
  onClose,
}: {
  item: Item;
  onOpenThread: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // showModal() gives the focus trap, Escape to close and the backdrop.
  // Development runs effects twice; calling it on an open dialog throws.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    // The keyboard equivalent of the backdrop click is Escape, which <dialog> handles itself.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-label="Media preview"
      onClose={onClose}
      onClick={(e) => {
        // The dialog fills the screen; a click on it rather than on its content is a click outside.
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 size-full max-h-none max-w-none cursor-zoom-out items-center justify-center bg-transparent p-32 text-ink backdrop:bg-scrim open:flex"
    >
      <div className="flex w-full max-w-880 cursor-default flex-col gap-10">
        <div className="stripes-lg flex aspect-16/10 max-h-[70vh] items-center justify-center rounded-8 border border-line">
          <span className="rounded-4 bg-bg px-10 py-4 font-mono text-sm text-mute">
            {item.media} from {item.from}
          </span>
        </div>
        <div className="flex items-center gap-10">
          <SourceTag src={item.src} />
          <span className="min-w-0 flex-1 truncate font-semibold">{item.title}</span>
          <span className="font-mono text-meta text-mute">
            {item.from} · {item.age}
          </span>
          <Button size="mdw" onClick={onOpenThread}>
            Open thread
          </Button>
          <Button variant="primary" compact onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </dialog>
  );
}
