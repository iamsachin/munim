import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAsk } from '../reader/queries';
import { useReader } from '../reader/store';
import { AiBadge } from '../ui/atoms';
import { Button } from '../ui/Button';

/** The always-visible question field. Submitting queues the question and opens the Ask screen. */
export function AskBar() {
  const { state } = useReader();
  const ask = useAsk();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');

  return (
    <header className="flex items-center border-b border-line bg-panel px-16 py-10">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ask(draft)) return;
          setDraft('');
          void navigate('/ask');
        }}
        className="flex max-w-820 flex-1 items-center gap-10 rounded-8 border border-accent bg-ask-fill py-4 pr-4 pl-10 ring-3 ring-ask-ring"
      >
        <AiBadge />
        <input
          id="ask-bar"
          aria-label="Ask"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          placeholder="Ask across your feeds, saved items and threads"
          className="min-w-0 flex-1 bg-transparent py-6 text-input outline-none placeholder:text-mute"
        />
        <span className="font-mono text-code whitespace-nowrap text-mute">
          in {state.scope.toLowerCase()}
        </span>
        <Button type="submit" variant="primary">
          Ask
        </Button>
      </form>
    </header>
  );
}
