import { getDeep, IndexedCollections, setDeep } from './accessDeep.js';

import { describe, it, expect } from 'vitest';

describe('setDeep', () => {
  it('correctly sets values in maps', () => {
    const obj = {
      a: new Map([[new Set(['NaN']), [[1, 'undefined']]]]),
    };

    const collections = new IndexedCollections();
    setDeep(obj, ['a', 0, 0, 0], Number, collections);
    setDeep(obj, ['a', 0, 1], entries => new Map(entries), collections);
    setDeep(obj, ['a', 0, 1, 0, 1], () => undefined, collections);
    collections.rebuild();

    expect(obj).toEqual({
      a: new Map([[new Set([NaN]), new Map([[1, undefined]])]]),
    });
  });

  it('correctly sets values in sets', () => {
    const obj = {
      a: new Set([10, new Set(['NaN'])]),
    };

    const collections = new IndexedCollections();
    setDeep(obj, ['a', 1, 0], Number, collections);
    collections.rebuild();

    expect(obj).toEqual({
      a: new Set([10, new Set([NaN])]),
    });
  });
});

describe('positions inside a Set or Map', () => {
  it('are read by getDeep', () => {
    const collections = new IndexedCollections();
    const set = new Set(['a', 'b', 'c']);
    const map = new Map([
      ['k0', 'v0'],
      ['k1', 'v1'],
    ]);

    expect(getDeep(set, [1], collections)).toBe('b');
    expect(getDeep(set, [0.5], collections)).toBe('b');
    expect(getDeep(set, ['x'], collections)).toBe('a');
    expect(getDeep(map, [1, 0], collections)).toBe('k1');
    expect(getDeep(map, [1, 1], collections)).toBe('v1');
    expect(() => getDeep(set, [4], collections)).toThrow('index out of bounds');
  });

  it('are walked by setDeep', () => {
    const collections = new IndexedCollections();
    const obj = {
      map: new Map([
        ['k0', { n: 0 }],
        ['k1', { n: 1 }],
      ]),
    };

    setDeep(obj, ['map', 1, 1, 'n'], () => 5, collections);
    collections.rebuild();

    expect([...obj.map.values()]).toEqual([{ n: 0 }, { n: 5 }]);
  });

  it('take a Map value one row past the end, and no key there', () => {
    const collections = new IndexedCollections();
    const map = new Map<unknown, unknown>([['k0', 'v0']]);

    setDeep(map, [1, 0], () => 'ignored', collections);
    setDeep(map, [1, 1], () => 'v', collections);
    setDeep(map, [0, 0], () => 'renamed', collections);
    collections.rebuild();

    expect([...map]).toEqual([
      ['renamed', 'v0'],
      [undefined, 'v'],
    ]);
  });
});
