import { useState } from 'react';
import { ScreenHeader } from '../shell/ScreenHeader';
import { Highlight, SourceTag } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { focusOnMount, Input } from '../ui/Input';
import { EmptyState } from '../ui/States';
import { EMPTY } from './copy';
import { highlightKey } from './marks';
import { useReader } from './store';

export function Highlights() {
  const { state, update } = useReader();
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState('');

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Highlights">
        <span className="text-note text-mute">
          Select text in any article or comment to highlight it.
        </span>
      </ScreenHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-10 overflow-y-auto p-16">
        {state.highlights.length === 0 && <EmptyState compact>{EMPTY.highlights}</EmptyState>}
        {state.highlights.map((h) => {
          const key = highlightKey(h);
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
                    update((s) => ({
                      highlights: s.highlights.map((x) =>
                        highlightKey(x) === key ? { ...x, note: note.trim() } : x,
                      ),
                    }));
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
                <SourceTag src={h.src} />
                <span className="min-w-0 truncate">
                  {h.title} · {h.from}
                </span>
                <span className="ml-auto">{h.when}</span>
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
                    update((s) => ({
                      highlights: s.highlights.filter((x) => highlightKey(x) !== key),
                    }));
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
