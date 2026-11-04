import { describe, expect, it } from 'vitest';
import SuperJSON from './index.js';

describe('sparse arrays', () => {
  it('preserves the length of an array containing only holes', () => {
    const input = new Array(3);
    expect(SuperJSON.serialize(input).json).toHaveLength(3);
    expect(SuperJSON.parse(SuperJSON.stringify(input))).toEqual([
      null,
      null,
      null,
    ]);
    expect(Object.keys(input)).toEqual([]);
  });

  it('preserves trailing holes in a nested array', () => {
    const input = { values: [1, , ,] };
    expect(SuperJSON.parse(SuperJSON.stringify(input))).toEqual({
      values: [1, null, null],
    });
    expect(input.values).toHaveLength(3);
    expect(Object.keys(input.values)).toEqual(['0']);
  });

  it('keeps explicit undefined values distinct from holes', () => {
    const input = [undefined, ,];
    expect(SuperJSON.parse(SuperJSON.stringify(input))).toEqual([
      undefined,
      null,
    ]);
  });
});
