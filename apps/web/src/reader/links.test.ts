import { expect, test } from 'vitest';
import { isBare, nameOf } from './links';

test('a link is bare when its text is only its address, whole or cut short', () => {
  const href = 'https://www.example.com/posts/a-year-of-feeds?ref=hn';
  expect(isBare(href, href)).toBe(true);
  expect(isBare(' https://www.example.com/posts/a-yea... ', href)).toBe(true);
  expect(isBare('example.com/posts/a-year…', href)).toBe(true);
  expect(isBare('www.example.com', href)).toBe(true);
  // Words of its own, even ones that name the site, are kept as they are.
  expect(isBare('a year of feeds', href)).toBe(false);
  expect(isBare('example.com has the story', href)).toBe(false);
  expect(isBare('other.org/page', href)).toBe(false);
  expect(isBare('here', href)).toBe(false);
  expect(isBare('', href)).toBe(false);
});

test('a card without a title is called by its site and path', () => {
  expect(nameOf('https://www.example.com/posts/a-year/?ref=hn#top')).toBe(
    'example.com/posts/a-year',
  );
  expect(nameOf('http://example.com/')).toBe('example.com');
  expect(nameOf(`https://example.com/${'x'.repeat(80)}`)).toBe(`example.com/${'x'.repeat(36)}…`);
});
