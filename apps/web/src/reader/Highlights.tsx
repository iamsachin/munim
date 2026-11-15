import { useState } from 'react';
import { ScreenHeader } from '../shell/ScreenHeader';
import { Highlight, SourceTag } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { focusOnMount, Input } from '../ui/Input';
import { EmptyState, ErrorState, LoadingRows } from '../ui/States';
import { EMPTY } from './copy';
import { day, useHighlights, useNoteHighlight, useRemoveHighlight } from './queries';

export function Highlights() {
  const highlights = useHighlights();
  const setNoteOf = useNoteHighlight();
  const remove = useRemoveHighlight();
  const [editing, setEditing] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [now] = useState(() => Date.now());

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Highlights">
        <span className="text-note text-mute">
          Select text in any article or comment to highlight it.
        </span>
      </ScreenHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-10 overflow-y-auto p-16">
        {highlights.isPending && <LoadingRows what="highlights" rows={3} />}
        {highlights.isError && (
          <ErrorState what="the highlights" onRetry={() => void highlights.refetch()} />
        )}
        {highlights.data?.length === 0 && <EmptyState compact>{EMPTY.highlights}</EmptyState>}
        {highlights.data?.map((h) => {
          const key = h.id;
          // Enough of the quote to tell two buttons apart when read aloud.
          const which = h.quote.slice(0, 40);
          return (
            <Card key={key} className="max-w-820 gap-8">
              <div className="text-read leading-prose text-pretty">
                <Highlight>{h.quote}</Highlight>
              </div>
              {editing === key ? (
                <form
                  className="flex gap-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setNoteOf.mutate({ id: h.id, note });
                    setEditing(null);
                  }}
                >
                  <Input
                    ref={focusOnMount}
                    size="md"
                    className="flex-1"
                    aria-label="Note"
                    placeholder="Note"
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value);
                    }}
                  />
                  <Button type="submit" size="stretch">
                    Save note
                  </Button>
                  <Button
                    size="stretch"
                    onClick={() => {
                      setEditing(null);
                    }}
                  >
                    Cancel
                  </Button>
                </form>
              ) : (
                h.note && <div className="text-mute">Note: {h.note}</div>
              )}
              <div className="flex items-baseline gap-10 font-mono text-meta text-mute">
                <SourceTag src={h.source} icon={h.icon} />
                <span className="min-w-0 truncate">
                  {h.title} · {h.origin}
                </span>
                <span className="ml-auto">{day(h.created_at, now)}</span>
                <Button
                  className="font-sans"
                  aria-label={`${h.note ? 'Edit' : 'Add'} note: ${which}`}
                  onClick={() => {
                    setNote(h.note);
                    setEditing(key);
                  }}
                >
                  {h.note ? 'Edit' : 'Add'} note
                </Button>
                <Button
                  className="font-sans"
                  aria-label={`Remove: ${which}`}
                  onClick={() => {
                    remove.mutate(h.id);
                  }}
                >
                  Remove
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
