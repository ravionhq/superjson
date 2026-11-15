import { parsePath, escapeKey } from './pathstringifier.js';

import { test, describe, it, expect } from 'vitest';

describe('parsePath', () => {
  it.each([
    ['test.a.b', ['test', 'a', 'b']],
    ['test\\.a.b', ['test.a', 'b']],
    ['test\\\\.a.b', ['test\\.a', 'b']],
    ['test\\a.b', ['test\\a', 'b']],
    ['test\\\\a.b', ['test\\\\a', 'b']],
  ])('legacy parsePath(%p) === %p', (input, expectedOutput) => {
    expect(parsePath(input, true)).toEqual(expectedOutput);
  });

  it.each([
    ['test.a.b', ['test', 'a', 'b']],
    ['test\\.a.b', ['test.a', 'b']],
    ['test\\\\.a.b', ['test\\', 'a', 'b']],
    ['test\\\\a.b', ['test\\a', 'b']],
  ])('parsePath(%p) === %p', (input, expectedOutput) => {
    expect(parsePath(input, false)).toEqual(expectedOutput);
  });

  it.each(['test\\a.b', 'foo.bar.baz\\'])(
    'parsePath(%p) is rejected',
    input => {
      expect(() => parsePath(input, false)).toThrowError();
    }
  );
});

describe('escapeKey', () => {
  test.each([
    ['dontescape', 'dontescape'],
    ['escape.me', 'escape\\.me'],
  ])('escapeKey(%s) === %s', (input, expectedOutput) => {
    expect(escapeKey(input)).toEqual(expectedOutput);
  });
});
