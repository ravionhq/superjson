import { setDeep } from './accessDeep.js';

import { describe, it, expect } from 'vitest';

describe('setDeep', () => {
  it('correctly sets values in maps', () => {
    const obj = {
      a: new Map([[new Set(['NaN']), [[1, 'undefined']]]]),
    };

    setDeep(obj, ['a', 0, 0, 0], Number);
    setDeep(obj, ['a', 0, 1], entries => new Map(entries));
    setDeep(obj, ['a', 0, 1, 0, 1], () => undefined);

    expect(obj).toEqual({
      a: new Map([[new Set([NaN]), new Map([[1, undefined]])]]),
    });
  });

  it('correctly sets values in sets', () => {
    const obj = {
      a: new Set([10, new Set(['NaN'])]),
    };

    setDeep(obj, ['a', 1, 0], Number);

    expect(obj).toEqual({
      a: new Set([10, new Set([NaN])]),
    });
  });
});

it.each([
  [NaN, NaN],
  [0, -0],
  [-0, 0],
])(
  'preserves a Map entry when replacing %s with the same key %s',
  (key, replacement) => {
    const map = new Map([[key, 'value']]);
    setDeep(map, [0, 0], () => replacement);
    expect(map.size).toBe(1);
    expect(map.get(key)).toBe('value');
  }
);
