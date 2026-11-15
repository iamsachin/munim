import { useMutationState } from '@tanstack/react-query';
import type { Ask as Asked } from '../api/client';
import { ScreenHeader } from '../shell/ScreenHeader';
import { AiBadge, SectionLabel } from '../ui/atoms';
import { Card } from '../ui/Card';
import { Chip, SuggestChip } from '../ui/Chip';
import { CitationRow } from '../ui/CitationRow';
import { EmptyState, ErrorState, LoadingRows } from '../ui/States';
import { EMPTY } from './copy';
import { useAsk, useAsks } from './queries';
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

/**
 * What was asked and what was answered. A question goes to the server, where the worker puts
 * it to the model the owner chose for Ask; the answer appears here when it is ready, with the
 * items it rests on.
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
        {asks.data?.map((asked) => (
          <div key={asked.id} className="flex flex-col gap-10">
            <div className="max-w-4/5 self-end rounded-8 bg-card px-12 py-8 text-prose">
              {asked.question}
            </div>
            <Card tone="ai" className="gap-8">
              <div className="flex items-center gap-8">
                <AiBadge />
                <span className="font-mono text-code text-mute">{FROM[asked.scope]}</span>
              </div>
              {asked.status === 'pending' ? (
                <div role="status" className="text-prose text-mute">
                  Waiting for the answer.
                </div>
              ) : (
                // pre-line keeps the paragraphs the model wrote.
                <div className="text-prose leading-prose text-pretty whitespace-pre-line">
                  {asked.answer || asked.problem}
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
          </div>
        ))}
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
