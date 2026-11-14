import { useState } from 'react';
import { ScreenHeader } from '../shell/ScreenHeader';
import { SourceTag } from '../ui/atoms';
import { Button } from '../ui/Button';
import { ErrorState, LoadingRows } from '../ui/States';
import { Cell, Table, TableBody, TableHeader, TableRow, Th } from '../ui/Table';
import { EMPTY } from './copy';
import { age, readingTotal, useChangeItem, useItems } from './queries';

const COLS = 'grid-cols-[40px_minmax(0,1fr)_160px_70px_90px_70px]';
const META = 'font-mono text-meta text-mute';

export function Later() {
  const items = useItems({ show: 'later' });
  const change = useChangeItem();
  const [now] = useState(() => Date.now());
  const rows = items.data ?? [];

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Read later">
        {items.isSuccess && <span className={META}>{readingTotal(rows)}</span>}
      </ScreenHeader>
      <Table label="Read later" className="flex min-h-0 flex-1 flex-col">
        <TableHeader className={COLS}>
          <Th>Src</Th>
          <Th>Item</Th>
          <Th>From</Th>
          <Th className="text-right">Time</Th>
          <Th>Added</Th>
          <Th>
            <span className="sr-only">Actions</span>
          </Th>
        </TableHeader>
        <TableBody className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((item) => (
            <TableRow key={item.id} className={`${COLS} items-center`}>
              <Cell>
                <SourceTag src={item.source} />
              </Cell>
              <Cell className="truncate font-medium">{item.title}</Cell>
              <Cell className={`${META} truncate`}>{item.origin}</Cell>
              <Cell className={`${META} text-right`}>{item.minutes} min</Cell>
              <Cell className={META}>{item.later_at ? age(item.later_at, now) : ''}</Cell>
              <Cell className="justify-self-end">
                <Button
                  aria-label={`Done: ${item.title}`}
                  onClick={() => {
                    change.mutate({ id: item.id, later: false });
                  }}
                >
                  Done
                </Button>
              </Cell>
            </TableRow>
          ))}
          {items.isPending && (
            <div role="row">
              <Cell>
                <LoadingRows what="the queue" />
              </Cell>
            </div>
          )}
          {items.isError && (
            <div role="row">
              <Cell>
                <ErrorState what="the queue" onRetry={() => void items.refetch()} />
              </Cell>
            </div>
          )}
          {items.isSuccess && rows.length === 0 && (
            <div role="row">
              <Cell className="px-16 py-24 text-mute">{EMPTY.later}</Cell>
            </div>
          )}
        </TableBody>
      </Table>
    </main>
  );
}
