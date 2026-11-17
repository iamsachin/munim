import { useState } from 'react';
import { Link } from 'react-router';
import { reason, sessionOver, type Watches as Told } from '../api/client';
import { ScreenHeader } from '../shell/ScreenHeader';
import { AiBadge, SectionLabel, SourceTag } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { EmptyState, ErrorState, LoadingRows } from '../ui/States';
import { Cell, Table, TableHeader, TableRow, Th } from '../ui/Table';
import { Toggle } from '../ui/Toggle';
import { EMPTY } from './copy';
import { age, useAddWatch, useRemoveWatch, useSetWatch, useWatches, useX } from './queries';

type Kind = Told['watches'][number]['kind'];

/** Each kind of watch, and how it is matched, said where the kind is chosen. */
const KINDS: Record<Kind, { name: string; how: string }> = {
  keyword: { name: 'Keyword', how: 'Matched by its words' },
  person: { name: 'Person', how: 'Matched by who published or replied' },
  topic: { name: 'Topic', how: 'Matched by its words, and judged by the Watch model hourly' },
};

const COLS = 'grid-cols-[minmax(0,1fr)_90px_80px_100px_60px_60px_70px]';
const MATCH_COLS = 'grid-cols-[150px_34px_minmax(0,1fr)_40px]';
const META = 'font-mono text-meta text-mute';

/**
 * The owner's watches and the latest items that matched them. A keyword or a person is matched
 * on the server by words; a topic is judged by the model chosen for Watch matching, which is
 * why it is marked as AI's.
 */
export function Watches() {
  const watches = useWatches(true);
  // X is searched for a watch only if the owner has given Munim a token for it.
  const x = useX().data?.connected ?? false;
  const add = useAddWatch();
  const set = useSetWatch();
  const remove = useRemoveWatch();
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<Kind>('keyword');
  // Ages are worked out against one moment, so they do not change while the screen is open.
  const [now] = useState(() => Date.now());
  const failed = [add, set, remove].find((change) => change.isError && !sessionOver(change.error));

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ScreenHeader title="Watches">
        <form
          className="ml-auto flex items-center gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            const name = draft.trim();
            if (!name) return;
            add.mutate(
              { name, kind },
              {
                onSuccess: () => {
                  setDraft('');
                },
              },
            );
          }}
        >
          <Select
            aria-label="Kind of watch"
            title={KINDS[kind].how}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
            }}
          >
            {Object.entries(KINDS).map(([code, { name }]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </Select>
          <Input
            className="w-240"
            aria-label="Keyword, person or topic"
            placeholder="Keyword, person or topic"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
          />
          <Button type="submit" size="lgw">
            Add watch
          </Button>
        </form>
      </ScreenHeader>
      {failed && (
        <div role="alert" className="px-16 pt-10 text-note text-a3">
          {reason(failed.error)}
        </div>
      )}
      <Table label="Watches">
        <TableHeader className={COLS}>
          <Th>Watch</Th>
          <Th>Kind</Th>
          <Th className="text-right">This week</Th>
          <Th>Last match</Th>
          <Th>On X</Th>
          <Th>Watching</Th>
          <Th>
            <span className="sr-only">Remove</span>
          </Th>
        </TableHeader>
        {watches.data?.watches.map((w) => (
          <TableRow key={w.id} hover={false} className={`${COLS} items-center`}>
            {/* The handoff fades an off row to 55% opacity, which makes its text unreadable. Muting the name keeps the "off" look at full contrast. */}
            <Cell className="min-w-0">
              <div className={w.on ? 'font-semibold' : 'font-semibold text-mute'}>{w.name}</div>
              {w.problem && <div className="text-note text-a3">{w.problem}</div>}
            </Cell>
            <Cell className="flex items-center gap-6 text-note text-mute">
              {KINDS[w.kind].name}
              {/* A topic's matches are a model's judgement. */}
              {w.kind === 'topic' && <AiBadge />}
            </Cell>
            <Cell className={`${META} text-right`}>{w.week}</Cell>
            <Cell className={META}>{w.last ? `${age(w.last, now)} ago` : 'No matches'}</Cell>
            <Cell>
              {/* A topic is not looked for on X: only words and accounts can be asked of it. */}
              {w.kind !== 'topic' && (
                <Toggle
                  on={w.on_x}
                  label={`Look on X for ${w.name}`}
                  disabled={!x}
                  title={x ? undefined : 'Set up X under Connections first'}
                  onChange={(on_x) => {
                    set.mutate({ id: w.id, on_x });
                  }}
                />
              )}
            </Cell>
            <Cell className="justify-self-end">
              <Toggle
                on={w.on}
                label={`Watch ${w.name}`}
                onChange={(on) => {
                  set.mutate({ id: w.id, on });
                }}
              />
            </Cell>
            <Cell className="justify-self-end">
              <Button
                aria-label={`Remove watch ${w.name}`}
                onClick={() => {
                  remove.mutate(w.id);
                }}
              >
                Remove
              </Button>
            </Cell>
          </TableRow>
        ))}
      </Table>
      <p className="px-16 pt-8 text-note text-mute">
        A watch that is on for X is searched there once a day, for at most 10 posts, which X charges
        for.{' '}
        {!x && (
          <>
            To use it,{' '}
            <Link to="/connections" className="underline">
              set up X under Connections
            </Link>
            .
          </>
        )}
      </p>
      <div className="px-16">
        {watches.isPending && <LoadingRows what="watches" rows={3} />}
        {watches.isError && (
          <ErrorState what="the watches" onRetry={() => void watches.refetch()} />
        )}
        {watches.data?.watches.length === 0 && <EmptyState compact>{EMPTY.watches}</EmptyState>}
      </div>

      <SectionLabel as="h2" className="px-16 pt-16 pb-6">
        Latest matches
      </SectionLabel>
      <Table label="Latest matches">
        {watches.data?.matches.map((m) => (
          <TableRow
            key={`${m.watch} ${String(m.item_id)}`}
            pad={4}
            hover={false}
            className={`${MATCH_COLS} items-center`}
          >
            <Cell className="flex min-w-0 items-center gap-6 text-sm text-accent">
              <span className="truncate">{m.watch}</span>
              {/* Only a model's judgement is AI's: a topic's words can find an item too. */}
              {m.judged && <AiBadge />}
            </Cell>
            <Cell>
              <SourceTag src={m.source} icon={m.icon} />
            </Cell>
            <Cell className="min-w-0">
              <Link
                to={`/stream?item=${String(m.item_id)}`}
                className="block truncate text-ink hover:underline"
              >
                {m.title}
              </Link>
            </Cell>
            <Cell className={`${META} text-right`}>{age(m.published_at, now)}</Cell>
          </TableRow>
        ))}
      </Table>
      {watches.data?.matches.length === 0 && (
        <div className="px-16">
          <EmptyState compact>{EMPTY.matches}</EmptyState>
        </div>
      )}
    </main>
  );
}
