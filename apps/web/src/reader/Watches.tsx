import { useState } from 'react';
import { ScreenHeader } from '../shell/ScreenHeader';
import { SectionLabel, SourceTag } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Cell, Table, TableHeader, TableRow, Th } from '../ui/Table';
import { Toggle } from '../ui/Toggle';
import { MATCHES } from './fixtures';
import { toggled, useReader, watchRows } from './store';

const COLS = 'grid-cols-[minmax(0,1fr)_90px_170px_80px_100px_60px]';
const MATCH_COLS = 'grid-cols-[150px_34px_minmax(0,1fr)_40px]';
const META = 'font-mono text-meta text-mute';

export function Watches() {
  const { state, update } = useReader();
  const [draft, setDraft] = useState('');

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ScreenHeader title="Watches">
        <form
          className="ml-auto flex items-center gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            const name = draft.trim();
            // A second watch with the same name would share its on/off switch.
            if (!name || watchRows(state).some((w) => w.name === name)) return;
            setDraft('');
            update((s) => ({ watchNew: [...s.watchNew, name] }));
          }}
        >
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
      <Table label="Watches">
        <TableHeader className={COLS}>
          <Th>Watch</Th>
          <Th>Kind</Th>
          <Th>In</Th>
          <Th className="text-right">This week</Th>
          <Th>Last match</Th>
          <Th>
            <span className="sr-only">On or off</span>
          </Th>
        </TableHeader>
        {watchRows(state).map((w) => (
          <TableRow key={w.name} hover={false} className={`${COLS} items-center`}>
            {/* The handoff fades an off row to 55% opacity, which makes its text unreadable. Muting the name keeps the "off" look at full contrast. */}
            <Cell className={w.on ? 'font-semibold' : 'font-semibold text-mute'}>{w.name}</Cell>
            <Cell className="text-note text-mute">{w.kind}</Cell>
            <Cell className="text-note text-mute">{w.where}</Cell>
            <Cell className={`${META} text-right`}>{w.count}</Cell>
            <Cell className={META}>{w.last}</Cell>
            <Cell className="justify-self-end">
              <Toggle
                on={w.on}
                label={`Watch ${w.name}`}
                onChange={() => {
                  update((s) => ({ watchOff: toggled(s.watchOff, w.name) }));
                }}
              />
            </Cell>
          </TableRow>
        ))}
      </Table>

      <SectionLabel as="h2" className="px-16 pt-16 pb-6">
        Latest matches
      </SectionLabel>
      <Table label="Latest matches">
        {MATCHES.map((m) => (
          <TableRow
            key={m.watch + m.title}
            pad={4}
            hover={false}
            className={`${MATCH_COLS} items-baseline`}
          >
            <Cell className="text-sm text-accent">{m.watch}</Cell>
            <Cell>
              <SourceTag src={m.src} />
            </Cell>
            <Cell className="truncate">{m.title}</Cell>
            <Cell className={`${META} text-right`}>{m.age}</Cell>
          </TableRow>
        ))}
      </Table>
    </main>
  );
}
