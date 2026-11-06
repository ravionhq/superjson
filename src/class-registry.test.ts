import { expect, test } from 'vitest';
import SuperJSON from './index.js';

test('clears property filters when clearing and re-registering classes', () => {
  class Record {
    first = 'one';
    second = 'two';
  }
  const superjson = new SuperJSON();
  superjson.registerClass(Record, { allowProps: ['first'] });
  expect(superjson.serialize(new Record()).json).toEqual({ first: 'one' });

  superjson.classRegistry.clear();
  expect(superjson.classRegistry.getIdentifier(Record)).toBeUndefined();
  expect(superjson.classRegistry.getAllowedProps(Record)).toBeUndefined();
  superjson.registerClass(Record);
  const restored = superjson.parse(superjson.stringify(new Record()));
  expect(restored).toBeInstanceOf(Record);
  expect(restored).toEqual(new Record());
});

test('clears empty allowlists and leaves unrelated SuperJSON instances intact', () => {
  class Record {
    value = 'hello';
  }
  const first = new SuperJSON();
  const second = new SuperJSON();
  first.registerClass(Record, { allowProps: [] });
  second.registerClass(Record, { allowProps: [] });
  first.classRegistry.clear();
  first.classRegistry.clear();
  first.registerClass(Record, 'record');
  expect(first.serialize(new Record()).json).toEqual({ value: 'hello' });
  expect(second.serialize(new Record()).json).toEqual({});
});
