import { useState } from 'react';
import { ScreenHeader } from '../shell/ScreenHeader';
import { SourceTag } from '../ui/atoms';
import { Chip } from '../ui/Chip';
import { Cell, Table, TableBody, TableHeader, TableRow, Th } from '../ui/Table';
import { SAVED } from './fixtures';
import type { SavedKind } from './types';

const COLS = 'grid-cols-[56px_34px_minmax(0,1fr)_120px_160px_64px]';
const KINDS: SavedKind[] = ['Video', 'Thread', 'Post', 'Article'];
const META = 'font-mono text-meta text-mute';

export function Saved() {
  const [kind, setKind] = useState<SavedKind | 'All'>('All');
  const rows = SAVED.filter((s) => kind === 'All' || s.kind === kind);

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
        {/* The handoff says "Stored encrypted" here. Content is not encrypted, so only the size is shown. */}
        <span className={`${META} ml-auto`}>2.1 GB</span>
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
          {rows.map((s) => (
            <TableRow key={s.title} className={`${COLS} items-baseline`}>
              <Cell className="text-sm text-mute">{s.kind}</Cell>
              <Cell>
                <SourceTag src={s.src} />
              </Cell>
              <Cell className="truncate font-medium">{s.title}</Cell>
              <Cell className={`${META} truncate`}>{s.from}</Cell>
              <Cell className="text-sm text-mute">{s.parsed}</Cell>
              <Cell className={`${META} text-right`}>{s.when}</Cell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
