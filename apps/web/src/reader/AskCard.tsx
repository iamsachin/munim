import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AiBadge } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { SuggestChip } from '../ui/Chip';
import { Input } from '../ui/Input';
import { ask, useReader } from './store';

/**
 * The AI card on an open thread or article. Nothing is summarised automatically: a summary is
 * one question away, and costs tokens only when asked for.
 */
export function AskCard({ what }: { what: 'thread' | 'article' }) {
  const { update } = useReader();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');

  const send = (q: string) => {
    // An empty question still opens Ask, scoped to this item.
    if (!ask(update, q, 'Open item')) update({ scope: 'Open item' });
    void navigate('/ask');
  };

  return (
    <Card tone="ai" compact className="gap-7">
      <div className="flex items-center gap-8 font-mono text-label tracking-label text-accent uppercase">
        <AiBadge />
        Ask
      </div>
      <form
        className="flex gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          send(question);
        }}
      >
        <Input
          size="md"
          tone="ai"
          className="flex-1"
          aria-label={`Ask about this ${what}`}
          placeholder={`Ask about this ${what}`}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
          }}
        />
        <Button type="submit" variant="accent">
          Ask
        </Button>
      </form>
      <div className="flex flex-wrap gap-6">
        <SuggestChip
          onClick={() => {
            send(`Summarize this ${what}`);
          }}
        >
          Summarize this {what}
        </SuggestChip>
      </div>
    </Card>
  );
}
