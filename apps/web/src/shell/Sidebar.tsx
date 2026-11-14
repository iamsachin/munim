import { HIGHLIGHTS, ITEMS } from '../reader/fixtures';
import {
  articleCount,
  laterRows,
  matchCount,
  savedCount,
  sourceCount,
  useReader,
} from '../reader/store';
import { SectionLabel, SOURCES, type Source } from '../ui/atoms';
import { NavRow } from '../ui/NavRow';
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

export function Sidebar() {
  const { state } = useReader();
  return (
    <aside className="flex min-h-0 flex-col gap-16 overflow-y-auto border-r border-line bg-panel px-8 py-14">
      <div className="flex items-center gap-8 px-8">
        <span className="size-16 rounded-4 bg-accent" />
        <span className="text-brand font-semibold">Munim</span>
      </div>
      <Group label="Views">
        <NavRow name="Today" to="/today" />
        <NavRow name="Stream" count={ITEMS.length} to="/stream" />
        <NavRow name="Read later" count={laterRows(state).length} to="/later" />
        <NavRow name="Saved" count={savedCount(state)} to="/saved" />
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
        <NavRow name="Security and settings" to="/settings" />
      </Group>
      <Group label="Planned">
        <NavRow name="Calendar" />
        <NavRow name="Mail" />
        <NavRow name="Budget" />
      </Group>
    </aside>
  );
}
