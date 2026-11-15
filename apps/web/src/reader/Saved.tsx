import { useState } from 'react';
import { ScreenHeader } from '../shell/ScreenHeader';
import { SourceTag } from '../ui/atoms';
import { Chip } from '../ui/Chip';
import { ErrorState, LoadingRows } from '../ui/States';
import { Cell, Table, TableBody, TableHeader, TableRow, Th } from '../ui/Table';
import { EMPTY } from './copy';
import { age, heldOf, kindOf, KINDS, useItems, type Kind } from './queries';

const COLS = 'grid-cols-[56px_34px_minmax(0,1fr)_120px_160px_64px]';
const META = 'font-mono text-meta text-mute';

export function Saved() {
  const items = useItems({ show: 'saved' });
  const [kind, setKind] = useState<Kind | 'All'>('All');
  const [now] = useState(() => Date.now());
  const rows = (items.data ?? []).filter((item) => kind === 'All' || kindOf(item) === kind);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Saved">
        <Chip
          on={kind === 'All'}
          onClick={() => {
            setKind('All');
          }}
        >
          All
        </Chip>
        {KINDS.map((k) => (
          <Chip
            key={k}
            on={kind === k}
            onClick={() => {
              setKind(k);
            }}
          >
            {k}s
          </Chip>
        ))}
      </ScreenHeader>
      <Table label="Saved" className="flex min-h-0 flex-1 flex-col">
        <TableHeader className={COLS}>
          <Th>Kind</Th>
          <Th>Src</Th>
          <Th>Item</Th>
          <Th>From</Th>
          <Th>Parsed</Th>
          <Th className="text-right">Saved</Th>
        </TableHeader>
        <TableBody className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((item) => (
            <TableRow key={item.id} className={`${COLS} items-baseline`}>
              <Cell className="text-sm text-mute">{kindOf(item)}</Cell>
              <Cell>
                <SourceTag src={item.source} icon={item.icon} />
              </Cell>
              <Cell className="truncate font-medium">{item.title}</Cell>
              <Cell className={`${META} truncate`}>{item.origin}</Cell>
              <Cell className="text-sm text-mute">{heldOf(item)}</Cell>
              <Cell className={`${META} text-right`}>
                {item.saved_at ? age(item.saved_at, now) : ''}
              </Cell>
            </TableRow>
          ))}
          {items.isPending && (
            <div role="row">
              <Cell>
                <LoadingRows what="saved items" />
              </Cell>
            </div>
          )}
          {items.isError && (
            <div role="row">
              <Cell>
                <ErrorState what="your saved items" onRetry={() => void items.refetch()} />
              </Cell>
            </div>
          )}
          {items.isSuccess && rows.length === 0 && (
            <div role="row">
              <Cell className="px-16 py-24 text-mute">
                {kind === 'All' ? EMPTY.saved : EMPTY.filter}
              </Cell>
            </div>
          )}
        </TableBody>
      </Table>
    </main>
  );
}
