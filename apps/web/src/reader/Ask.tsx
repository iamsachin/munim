import { useMutationState } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Ask as Asked, Highlight } from '../api/client';
import { useTheme } from '../settings';
import { useKeys } from '../shell/keys';
import { ScreenHeader } from '../shell/ScreenHeader';
import { AiBadge, SectionLabel, SourceTag } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip, SuggestChip } from '../ui/Chip';
import { CitationRow } from '../ui/CitationRow';
import { cx } from '../ui/cx';
import { Input } from '../ui/Input';
import { EmptyState, ErrorState, LoadingRows } from '../ui/States';
import { Cell, RowButton, Table, TableBody, TableHeader, TableRow, Th } from '../ui/Table';
import { EMPTY } from './copy';
import type { Range } from './found';
import { Marked } from './Marked';
import { age, conversations, useAsk, useAsks, useHighlights } from './queries';
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

const COLS = 'grid-cols-[34px_minmax(0,1fr)_40px_30px]';

/**
 * An answer, as far as it has been written. Each of its lines is a unit, as a paragraph of an
 * item is: once the answer is finished, text selected in one can be highlighted, and the
 * highlights made in it are marked.
 */
function Answer({
  asked,
  highlights,
  plain,
}: {
  asked: Asked;
  highlights: readonly Highlight[];
  plain: boolean;
}) {
  const own = highlights.filter((h) => h.ask_id === asked.id);
  // Lines with words, as the server counts them. Said plainly, an answer has no citation
  // marks: they would all point at the one post named above the conversation.
  const lines = asked.answer
    .split('\n')
    .map((line) => (plain ? line.replace(/ ?\[\d+\]/g, '') : line))
    .filter((line) => line.trim());
  // Where a highlight is in a line: where it was made if those are still its words, or
  // wherever its words now are.
  const placed = (line: string, h: Highlight): Range[] => {
    const at = line.slice(h.start, h.end) === h.quote ? h.start : line.indexOf(h.quote);
    return at < 0 ? [] : [[at, at + h.quote.length]];
  };
  return (
    <div
      data-highlight-ask={asked.status === 'answered' ? asked.id : undefined}
      className="flex flex-col gap-8 text-prose leading-prose text-pretty"
    >
      {lines.map((line, unit) => (
        <p key={unit} data-unit={unit}>
          <Marked
            text={line}
            found={[]}
            marked={own.filter((h) => h.unit === unit).flatMap((h) => placed(line, h))}
          />
        </p>
      ))}
    </div>
  );
}

/**
 * One question and its answer. `plain` is for a conversation about one post, which is named
 * once above it: the answer then does not say again what it is from.
 */
function Exchange({
  asked,
  highlights,
  plain,
}: {
  asked: Asked;
  highlights: readonly Highlight[];
  plain: boolean;
}) {
  return (
    <>
      <div className="max-w-4/5 self-end rounded-8 bg-card px-12 py-8 text-prose">
        {asked.question}
      </div>
      <Card tone="ai" className="gap-8">
        <div className="flex items-center gap-8">
          <AiBadge />
          {!plain && <span className="font-mono text-code text-mute">{FROM[asked.scope]}</span>}
          {asked.status === 'pending' && asked.answer && (
            <span role="status" className="font-mono text-code text-mute">
              · writing
            </span>
          )}
        </div>
        {asked.answer ? (
          <Answer asked={asked} highlights={highlights} plain={plain} />
        ) : asked.problem ? (
          <div className="text-prose leading-prose text-pretty">{asked.problem}</div>
        ) : (
          <div role="status" className="text-prose text-mute">
            Waiting for the answer.
          </div>
        )}
        {(plain ? [] : asked.cites).map((cite, i) => (
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

/** The field under a conversation that carries it on, asked of the same items. */
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
 * What was asked, as a list of conversations with the open one beside it. The questions about
 * one post are one conversation, named by the post; a question about nothing in particular
 * starts its own, named by the question. A question goes to the server, where the worker puts
 * it to the model the owner chose for Ask; the answer appears as it is written, with the items
 * it rests on, and a passage of it can be highlighted like any other text.
 */
export function Ask() {
  const { state, update } = useReader();
  const { theme } = useTheme();
  const ask = useAsk();
  const asks = useAsks();
  const highlights = useHighlights();
  // Ages are worked out against one moment, so they do not change while the screen is open.
  const [now] = useState(() => Date.now());
  // Questions that never reached the server, so are not in its list: they are said here.
  const unsent = useMutationState({
    filters: { mutationKey: ['ask'], status: 'error' },
    select: (mutation) => (mutation.state.variables as { question: string }).question,
  });

  const groups = conversations(asks.data ?? []);
  // The open conversation is the one chosen, if it is still listed; otherwise the latest.
  const current = groups.find((group) => group[0]?.id === state.conversation) ?? groups[0];
  const first = current?.[0];
  const last = current?.at(-1);
  const move = (step: number) => {
    const at = current ? groups.indexOf(current) : 0;
    const next = groups[Math.min(groups.length - 1, Math.max(0, at + step))];
    if (next) update({ conversation: next[0]?.id });
  };
  useKeys(
    {
      j: () => {
        move(1);
      },
      k: () => {
        move(-1);
      },
    },
    theme.shortcuts === 'On',
  );

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
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <Table label="Conversations" className="flex min-h-0 flex-1 flex-col">
            <TableHeader className={COLS}>
              <Th>Src</Th>
              <Th>Conversation</Th>
              <Th className="text-right">Msgs</Th>
              <Th className="text-right">Age</Th>
            </TableHeader>
            <TableBody className="min-h-0 flex-1 overflow-y-auto">
              {groups.map((group) => {
                const about = group[0]?.about;
                // Each question is a message, and so is each answer that has come.
                const messages =
                  group.length + group.filter((asked) => asked.status !== 'pending').length;
                return (
                  <TableRow
                    key={group[0]?.id}
                    selected={group === current}
                    className={cx(COLS, 'min-h-44 items-center')}
                  >
                    <Cell>{about && <SourceTag src={about.source} icon={about.icon} />}</Cell>
                    <Cell className="flex min-w-0">
                      <RowButton
                        onClick={() => {
                          update({ conversation: group[0]?.id });
                        }}
                        className="min-w-0 flex-1 truncate"
                      >
                        {about?.title ?? group[0]?.question}{' '}
                        <span className="pl-6 font-mono text-meta text-mute">
                          {about?.origin ?? (group[0] && FROM[group[0].scope])}
                        </span>
                      </RowButton>
                    </Cell>
                    <Cell className="text-right font-mono text-meta text-mute">{messages}</Cell>
                    <Cell className="text-right font-mono text-meta text-mute">
                      {age(group.at(-1)?.asked_at ?? '', now)}
                    </Cell>
                  </TableRow>
                );
              })}
              {asks.isPending && (
                <div role="row">
                  <Cell>
                    <LoadingRows what="what was asked" rows={3} />
                  </Cell>
                </div>
              )}
              {asks.isError && (
                <div role="row">
                  <Cell>
                    <ErrorState what="what was asked" onRetry={() => void asks.refetch()} />
                  </Cell>
                </div>
              )}
              {asks.data?.length === 0 && (
                <div role="row">
                  <Cell className="px-16">
                    <EmptyState compact>{EMPTY.asks}</EmptyState>
                  </Cell>
                </div>
              )}
            </TableBody>
          </Table>
          <div className="flex flex-col gap-8 border-t border-line px-16 py-10">
            {unsent.map((question, n) => (
              <div key={n} role="alert" className="text-note text-a3">
                “{question}” could not be sent. Ask it again.
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
        </div>

        <section
          aria-label="Conversation"
          className="flex min-h-0 min-w-0 flex-col gap-12 border-l border-line bg-panel p-14"
        >
          {first && last && (
            <>
              {first.about && (
                <>
                  <div className="flex items-center gap-8 font-mono text-meta text-mute">
                    <SourceTag src={first.about.source} icon={first.about.icon} inheritSize />
                    <span className="min-w-0 truncate">{first.about.origin}</span>
                  </div>
                  <h2 className="text-title leading-title font-semibold text-pretty">
                    {/* The post itself, open in the Stream. */}
                    <Link
                      to={`/stream?item=${String(first.about.item_id)}`}
                      className="hover:underline"
                    >
                      {first.about.title}
                    </Link>
                  </h2>
                </>
              )}
              {/* Reversed, so that it opens at its latest answer and stays there as that
                  answer is written; the margin keeps a short conversation at the top. */}
              <div
                // It scrolls, so the keyboard must be able to reach it.
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto"
              >
                <div className="mb-auto flex flex-col gap-10">
                  {current.map((asked) => (
                    <Exchange
                      key={asked.id}
                      asked={asked}
                      highlights={highlights.data ?? []}
                      plain={first.about !== null}
                    />
                  ))}
                </div>
              </div>
              {/* Once the last answer is in, the conversation can be carried on. */}
              {last.status !== 'pending' && (
                <FollowUp
                  // Emptied when another conversation is opened.
                  key={first.id}
                  about={first.about?.title ?? first.question}
                  onAsk={(question) => ask(question, undefined, undefined, last)}
                />
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
