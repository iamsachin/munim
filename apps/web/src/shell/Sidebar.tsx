import { HIGHLIGHTS, ITEMS } from '../reader/fixtures';
import {
  articleCount,
  laterRows,
  matchCount,
  savedRows,
  sourceCount,
  useReader,
} from '../reader/store';
import { SectionLabel, SOURCES, type Source } from '../ui/atoms';
import { NavRow } from '../ui/NavRow';
import { Brand } from './Brand';
import { MOD } from './shortcuts';
import type { ReactNode } from 'react';

const SOURCE_ROWS: Source[] = ['RD', 'X', 'IG', 'HN', 'YT'];

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-col">
      <SectionLabel aria-hidden="true" className="px-8 pb-4">
        {label}
      </SectionLabel>
      {children}
    </nav>
  );
}

export function Sidebar({ onCommands }: { onCommands: () => void }) {
  const { state } = useReader();
  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-panel">
      {/* The navigation scrolls on short windows; the commands button below stays in view. */}
      <div className="flex min-h-0 flex-1 flex-col gap-16 overflow-y-auto px-8 pt-14 pb-8">
        <div className="px-8">
          <Brand />
        </div>
        <Group label="Views">
          <NavRow name="Today" to="/today" />
          <NavRow name="Stream" count={ITEMS.length} to="/stream" />
          <NavRow name="Read later" count={laterRows(state).length} to="/later" />
          <NavRow name="Saved" count={savedRows(state).length} to="/saved" />
          <NavRow name="Highlights" count={HIGHLIGHTS.length} to="/highlights" />
          <NavRow name="RSS" count={articleCount()} to="/rss" />
          <NavRow name="Digest" to="/digest" />
          <NavRow name="Watches" count={matchCount(state)} to="/watches" />
          <NavRow name="Ask" dot="accent" to="/ask" />
        </Group>
        <Group label="Sources">
          {SOURCE_ROWS.map((s) => (
            <NavRow
              key={s}
              name={SOURCES[s].name}
              count={sourceCount(s)}
              dot={SOURCES[s].tone}
              to={`/stream/${s.toLowerCase()}`}
            />
          ))}
        </Group>
        <Group label="Account">
          <NavRow name="Connections" to="/connections" />
          <NavRow name="AI" to="/ai" />
          <NavRow name="Security and settings" to="/settings" />
        </Group>
        <Group label="Planned">
          <NavRow name="Calendar" />
          <NavRow name="Mail" />
          <NavRow name="Budget" />
        </Group>
      </div>
      {/* The handoff has an encryption status button here; this slot now opens the commands. */}
      <button
        type="button"
        onClick={onCommands}
        className="mx-8 mt-8 mb-14 flex flex-none cursor-pointer items-center justify-between gap-8 rounded-5 border border-line px-8 py-7 text-left font-mono text-code text-mute hover:border-accent"
      >
        Commands
        <span>
          {MOD}
          {MOD === 'Ctrl' ? ' ' : ''}K
        </span>
      </button>
    </aside>
  );
}
