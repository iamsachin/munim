import { ScreenHeader } from '../shell/ScreenHeader';
import { SourceTag } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Cell, Table, TableBody, TableHeader, TableRow, Th } from '../ui/Table';
import { EMPTY } from './copy';
import { laterRows, laterTotal, useReader, withoutLater } from './store';

const COLS = 'grid-cols-[40px_minmax(0,1fr)_160px_70px_90px_70px]';
const META = 'font-mono text-meta text-mute';

export function Later() {
  const { state, update } = useReader();
  const rows = laterRows(state);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Read later">
        <span className={META}>{laterTotal(rows)}</span>
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
          {rows.map((l) => (
            <TableRow key={l.key} className={`${COLS} items-center`}>
              <Cell>
                <SourceTag src={l.src} />
              </Cell>
              <Cell className="truncate font-medium">{l.title}</Cell>
              <Cell className={`${META} truncate`}>{l.from}</Cell>
              <Cell className={`${META} text-right`}>{l.mins ? `${String(l.mins)} min` : ''}</Cell>
              <Cell className={META}>{l.added}</Cell>
              <Cell className="justify-self-end">
                <Button
                  aria-label={`Done: ${l.title}`}
                  onClick={() => {
                    update((s) => withoutLater(s, l));
                  }}
                >
                  Done
                </Button>
              </Cell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <div role="row">
              <Cell className="px-16 py-24 text-mute">{EMPTY.later}</Cell>
            </div>
          )}
        </TableBody>
      </Table>
    </main>
  );
}
