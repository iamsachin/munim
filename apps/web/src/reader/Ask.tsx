import { useMutationState } from '@tanstack/react-query';
import { useState } from 'react';
import type { Ask as Asked } from '../api/client';
import { ScreenHeader } from '../shell/ScreenHeader';
import { AiBadge, SectionLabel } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip, SuggestChip } from '../ui/Chip';
import { CitationRow } from '../ui/CitationRow';
import { Input } from '../ui/Input';
import { EmptyState, ErrorState, LoadingRows } from '../ui/States';
import { EMPTY } from './copy';
import { conversations, useAsk, useAsks } from './queries';
import { SCOPES, useReader } from './store';

/** What a question was asked of, as the answer's card says it. */
const FROM: Record<Asked['scope'], string> = {
  everything: 'From everything',
  saved: 'From saved',
  week: 'From this week',
  item: 'From open item',
};

const TRY = [
  'Summarize what I saved this week',
  'Which threads have replies to me?',
  'What is new about sync protocols?',
];

/** One question and its answer, which is shown as far as it has been written. */
function Exchange({ asked }: { asked: Asked }) {
  const said = asked.answer || asked.problem;
  return (
    <>
      <div className="max-w-4/5 self-end rounded-8 bg-card px-12 py-8 text-prose">
        {asked.question}
      </div>
      <Card tone="ai" className="gap-8">
        <div className="flex items-center gap-8">
          <AiBadge />
          <span className="font-mono text-code text-mute">{FROM[asked.scope]}</span>
          {asked.status === 'pending' && said && (
            <span role="status" className="font-mono text-code text-mute">
              · writing
            </span>
          )}
        </div>
        {said ? (
          // pre-line keeps the paragraphs the model wrote.
          <div className="text-prose leading-prose text-pretty whitespace-pre-line">{said}</div>
        ) : (
          <div role="status" className="text-prose text-mute">
            Waiting for the answer.
          </div>
        )}
        {asked.cites.map((cite, i) => (
          <CitationRow
            key={i}
            index={i + 1}
            src={cite.source}
            icon={cite.icon}
            title={cite.title}
            from={cite.origin}
          />
        ))}
      </Card>
    </>
  );
}

/** The field under a conversation that asks a follow-up of the same items. */
function FollowUp({ about, onAsk }: { about: string; onAsk: (question: string) => boolean }) {
  const [question, setQuestion] = useState('');
  return (
    <form
      className="flex gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (onAsk(question)) setQuestion('');
      }}
    >
      <Input
        size="md"
        tone="ai"
        className="flex-1"
        aria-label={`Ask a follow-up to: ${about}`}
        placeholder="Ask a follow-up"
        value={question}
        onChange={(e) => {
          setQuestion(e.target.value);
        }}
      />
      <Button type="submit">Ask</Button>
    </form>
  );
}

/**
 * What was asked and what was answered. A question goes to the server, where the worker puts
 * it to the model the owner chose for Ask; the answer appears here as it is written, with the
 * items it rests on. A follow-up is asked of the same items, with what was said before.
 */
export function Ask() {
  const { state, update } = useReader();
  const ask = useAsk();
  const asks = useAsks();
  // Questions that never reached the server, so are not in its list: they are said here.
  const unsent = useMutationState({
    filters: { mutationKey: ['ask'], status: 'error' },
    select: (mutation) => (mutation.state.variables as { question: string }).question,
  });

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Ask" before={<AiBadge />}>
        <span className="mr-4 text-sm text-mute">Search in</span>
        {SCOPES.map((s) => (
          <Chip
            key={s}
            on={state.scope === s}
            onClick={() => {
              update({ scope: s });
            }}
          >
            {s}
          </Chip>
        ))}
      </ScreenHeader>
      <div className="flex min-h-0 max-w-820 flex-1 flex-col gap-14 overflow-y-auto px-16 py-20">
        {asks.isPending && <LoadingRows what="what was asked" rows={3} />}
        {asks.isError && <ErrorState what="what was asked" onRetry={() => void asks.refetch()} />}
        {asks.data?.length === 0 && unsent.length === 0 && (
          <EmptyState compact>{EMPTY.asks}</EmptyState>
        )}
        {conversations(asks.data ?? []).map((group) => {
          const last = group.at(-1);
          return (
            // One conversation is one entry: a rule sets it apart from the one before.
            <div
              key={group[0]?.id}
              className="flex flex-col gap-10 border-rule not-first:border-t not-first:pt-14"
            >
              {group.map((asked) => (
                <Exchange key={asked.id} asked={asked} />
              ))}
              {/* Once the last answer is in, the conversation can be carried on. */}
              {last && last.status !== 'pending' && (
                <FollowUp
                  about={group[0]?.question ?? ''}
                  onAsk={(question) => ask(question, undefined, undefined, last)}
                />
              )}
            </div>
          );
        })}
        {unsent.map((question, n) => (
          <div key={n} className="flex flex-col gap-4">
            <div className="max-w-4/5 self-end rounded-8 bg-card px-12 py-8 text-prose">
              {question}
            </div>
            <div role="alert" className="self-end text-note text-a3">
              This question could not be sent. Ask it again.
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-6">
          <SectionLabel>Try</SectionLabel>
          {TRY.map((t) => (
            <SuggestChip
              key={t}
              onClick={() => {
                ask(t);
              }}
            >
              {t}
            </SuggestChip>
          ))}
        </div>
      </div>
    </main>
  );
}
