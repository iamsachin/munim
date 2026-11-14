import { expect, test } from 'vitest';
import { GO, HELP, matchCommands } from './shortcuts';

const commands = [{ label: 'Go to Saved' }, { label: 'Go to Stream' }, { label: 'Lock now' }];

test('commands are matched anywhere in the label, ignoring case and outer spaces', () => {
  expect(matchCommands(commands, 'saved')).toEqual([{ label: 'Go to Saved' }]);
  expect(matchCommands(commands, '  GO TO ')).toHaveLength(2);
  expect(matchCommands(commands, 'ock')).toEqual([{ label: 'Lock now' }]);
  expect(matchCommands(commands, 'nothing like this')).toEqual([]);
});

test('a blank query lists every command', () => {
  expect(matchCommands(commands, '')).toEqual(commands);
  expect(matchCommands(commands, '   ')).toEqual(commands);
});

test('every go-to key is one character and appears in the help list', () => {
  const listed = HELP.flatMap((s) => s.rows).filter((r) => r.keys[0] === 'g');
  expect(listed.map((r) => r.keys[1])).toEqual(Object.keys(GO));
  expect(Object.keys(GO).every((k) => k.length === 1)).toBe(true);
  // "g" itself starts the sequence, so it cannot also be a destination.
  expect(Object.keys(GO)).not.toContain('g');
});
