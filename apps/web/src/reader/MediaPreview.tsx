import { SourceTag } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
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
  return (
    <Modal label="Media preview" onClose={onClose} className="cursor-zoom-out">
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
    </Modal>
  );
}
