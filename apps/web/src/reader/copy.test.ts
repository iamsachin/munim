import { expect, test } from 'vitest';
import { removalOf } from './copy';

test('removing a feed says what is deleted and what is kept, in plain numbers', () => {
  expect(removalOf({ articles: 0, kept: 0 })).toBe('It has no articles.');
  expect(removalOf({ articles: 12, kept: 0 })).toBe('Its 12 articles are deleted.');
  expect(removalOf({ articles: 1, kept: 0 })).toBe('Its 1 article is deleted.');
  expect(removalOf({ articles: 12, kept: 2 })).toBe(
    '10 articles are deleted. The 2 you saved, queued or highlighted are kept.',
  );
  expect(removalOf({ articles: 2, kept: 1 })).toBe(
    '1 article is deleted. The 1 you saved, queued or highlighted is kept.',
  );
  expect(removalOf({ articles: 2, kept: 2 })).toBe(
    'Its 2 articles you saved, queued or highlighted are kept. Nothing is deleted.',
  );
});
