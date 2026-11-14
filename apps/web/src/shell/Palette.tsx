import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ask, useReader } from '../reader/store';
import { useTheme } from '../settings';
import { SOURCES, type Source } from '../ui/atoms';
import { cx } from '../ui/cx';
import { Modal } from '../ui/Modal';
import { GO, matchCommands } from './shortcuts';

interface Command {
  label: string;
  hint?: string;
  run: () => void;
}

/**
 * The command palette: go anywhere, run an action, or ask the typed text as a question.
 * Focus stays in the field; arrow keys move through the list and Enter runs the marked command.
 */
export function Palette({ onClose, onHelp }: { onClose: () => void; onHelp: () => void }) {
  const { update } = useReader();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [marked, setMarked] = useState(0);

  const go = (to: string) => () => {
    void navigate(to);
  };
  const other = theme.theme === 'Dark' ? 'Light' : 'Dark';
  const commands: Command[] = [
    ...Object.entries(GO).map(([key, { name, to }]) => ({
      label: `Go to ${name}`,
      hint: `g ${key}`,
      run: go(to),
    })),
    ...(Object.keys(SOURCES) as Source[]).map((s) => ({
      label: `Go to ${SOURCES[s].name} stream`,
      run: go(`/stream/${s.toLowerCase()}`),
    })),
    {
      label: `Switch to ${other.toLowerCase()} theme`,
      run: () => {
        setTheme({ theme: other });
      },
    },
    {
      label: 'Lock now',
      run: () => {
        update({ locked: true });
      },
    },
    { label: 'Keyboard shortcuts', hint: '?', run: onHelp },
  ];

  const question = query.trim();
  const shown: Command[] = [
    ...matchCommands(commands, query),
    // Whatever was typed can always be asked.
    ...(question
      ? [
          {
            label: `Ask: ${question}`,
            run: () => {
              ask(update, question);
              void navigate('/ask');
            },
          },
        ]
      : []),
  ];
  const index = Math.min(marked, shown.length - 1);

  const run = (command: Command) => {
    onClose();
    command.run();
  };

  useEffect(() => {
    document.getElementById(`palette-${String(index)}`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  return (
    <Modal label="Commands" onClose={onClose} align="top">
      <div className="flex max-h-full w-full max-w-560 flex-col rounded-8 border border-line bg-panel">
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={shown.length ? `palette-${String(index)}` : undefined}
          aria-label="Type a command or a question"
          placeholder="Type a command or a question"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setMarked(0);
          }}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
            if (step && shown.length) {
              e.preventDefault();
              setMarked((index + step + shown.length) % shown.length);
            }
            const command = shown[index];
            if (e.key === 'Enter' && command) {
              e.preventDefault();
              run(command);
            }
          }}
          className="border-b border-line bg-transparent px-14 py-10 text-input outline-none placeholder:text-mute"
        />
        <ul
          id="palette-list"
          role="listbox"
          aria-label="Commands"
          className="min-h-0 overflow-y-auto p-6"
        >
          {shown.map((command, i) => (
            // Options are reached with the arrow keys from the field, which keeps the focus.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={command.label}
              id={`palette-${String(i)}`}
              role="option"
              aria-selected={i === index}
              onClick={() => {
                run(command);
              }}
              onMouseMove={() => {
                setMarked(i);
              }}
              className={cx(
                'flex cursor-pointer items-center justify-between gap-12 rounded-5 px-8 py-dn-3',
                i === index ? 'bg-card text-ink' : 'text-mute',
              )}
            >
              <span className="truncate">{command.label}</span>
              {command.hint && (
                <span className="font-mono text-meta text-mute">{command.hint}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
