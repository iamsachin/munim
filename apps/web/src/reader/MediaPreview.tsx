import type { Item } from '../api/client';
import { SourceTag } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Player } from './Player';
import { age, useItem } from './queries';

/**
 * Modal preview of an item's media. A video that can be played is played here, in its source's
 * own player; anything else has a striped placeholder until real media exists for it.
 */
export function MediaPreview({
  item,
  play = false,
  now,
  onOpenThread,
  onClose,
}: {
  item: Item;
  /** Start the video at once, when the owner chose it to watch it. */
  play?: boolean;
  now: number;
  onOpenThread: () => void;
  onClose: () => void;
}) {
  // The row knows only that it is a video; the item itself says which, and has its still.
  const opened = useItem(item.id);
  const video = opened.data?.blocks.find((block) => block.type === 'video');

  return (
    <Modal label="Media preview" onClose={onClose} className="cursor-zoom-out">
      <div className="flex w-full max-w-880 cursor-default flex-col gap-10">
        {video ? (
          <Player src={video.src} alt={video.alt} video={video.video} start={play} />
        ) : (
          <div className="stripes-lg flex aspect-16/10 max-h-[70vh] items-center justify-center rounded-8 border border-line">
            <span className="rounded-4 bg-bg px-10 py-4 font-mono text-sm text-mute">
              {item.media} from {item.origin}
            </span>
          </div>
        )}
        <div className="flex items-center gap-10">
          <SourceTag src={item.source} />
          <span className="min-w-0 flex-1 truncate font-semibold">{item.title}</span>
          <span className="font-mono text-meta text-mute">
            {item.origin} · {age(item.published_at, now)}
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
