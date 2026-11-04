import { describe, expect, it } from 'vitest';
import SuperJSON from './index.js';

describe('references within registered classes', () => {
  for (const dedupe of [false, true]) {
    it(`restores shared properties with dedupe=${dedupe}`, () => {
      class Box {
        constructor(public first: object, public second: object) {}
      }
      const serializer = new SuperJSON({ dedupe });
      serializer.registerClass(Box);
      const shared = { value: 1 };
      const result = serializer.parse<Box>(
        serializer.stringify(new Box(shared, shared))
      );
      expect(result).toBeInstanceOf(Box);
      expect(result.first).toEqual(shared);
      expect(result.second).toBe(result.first);
    });

    it(`traverses registered classes in reference paths with dedupe=${dedupe}`, () => {
      class Box {
        constructor(public nested: { first: object; second: object }) {}
      }
      const serializer = new SuperJSON({ dedupe });
      serializer.registerClass(Box);
      const shared = { value: 1 };
      const result = serializer.parse<{ box: Box }>(
        serializer.stringify({
          box: new Box({ first: shared, second: shared }),
        })
      );
      expect(result.box).toBeInstanceOf(Box);
      expect(result.box.nested.first).toEqual(shared);
      expect(result.box.nested.second).toBe(result.box.nested.first);
    });
  }
});
