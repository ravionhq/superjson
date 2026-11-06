import { describe, expect, test } from 'vitest';
import SuperJSON from './index.js';

describe('custom transformer names', () => {
  test.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'round-trips a registered transformer named %s',
    name => {
      class Value {
        constructor(readonly value: string) {}
      }
      const superjson = new SuperJSON();
      superjson.registerCustom<Value, string>(
        {
          isApplicable: (value): value is Value => value instanceof Value,
          serialize: value => value.value,
          deserialize: value => new Value(value),
        },
        name
      );
      const original = new Value('hello');
      const payload = superjson.serialize(original);
      expect(payload.json).toBe('hello');
      expect(payload.meta?.values).toEqual([['custom', name]]);
      expect(superjson.parse(superjson.stringify(original))).toEqual(original);
    }
  );

  test.each(['__proto__', 'constructor', 'toString'])(
    'rejects unregistered prototype name %s as an unknown transformer',
    name => {
      const superjson = new SuperJSON();
      expect(() =>
        superjson.deserialize({
          json: 'hello',
          meta: { values: [['custom', name]] },
        })
      ).toThrow('Trying to deserialize unknown custom value');
    }
  );
});

test('finds custom transformers without Object.values', () => {
  const superjson = new SuperJSON();
  superjson.registerCustom<Date, string>(
    {
      isApplicable: (value): value is Date => value instanceof Date,
      serialize: value => value.toISOString(),
      deserialize: value => new Date(value),
    },
    'hasOwnProperty'
  );
  const descriptor = Object.getOwnPropertyDescriptor(Object, 'values')!;
  let result: unknown;
  try {
    Reflect.deleteProperty(Object, 'values');
    result = superjson.parse(superjson.stringify(new Date(0)));
  } finally {
    Object.defineProperty(Object, 'values', descriptor);
  }
  expect(result).toEqual(new Date(0));
});
