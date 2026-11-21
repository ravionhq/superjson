/* eslint-disable es5/no-for-of */
/* eslint-disable es5/no-es6-methods */

import * as fs from 'fs';

import SuperJSON from './index.js';
import { JSONValue, SuperJSONResult, SuperJSONValue } from './types.js';
import {
  isArray,
  isMap,
  isPlainObject,
  isPrimitive,
  isSet,
  isTypedArray,
} from './is.js';

import { ObjectID } from 'mongodb';
import { Decimal } from 'decimal.js';

import { describe, it, expect, test } from 'vitest';

const isNode10 = process.version.indexOf('v10') === 0;

describe('stringify & parse', () => {
  const cases: Record<
    string,
    {
      input: (() => SuperJSONValue) | SuperJSONValue;
      output: JSONValue | ((v: JSONValue) => void);
      outputAnnotations?: SuperJSONResult['meta'];
      customExpectations?: (value: any) => void;
      skipOnNode10?: boolean;
      dontExpectEquality?: boolean;
      only?: boolean;
    }
  > = {
    'works for objects': {
      input: {
        a: { 1: 5, 2: { 3: 'c' } },
        b: null,
      },
      output: {
        a: { 1: 5, 2: { 3: 'c' } },
        b: null,
      },
    },

    'special case: objects with array-like keys': {
      input: {
        a: { 0: 3, 1: 5, 2: { 3: 'c' } },
        b: null,
      },
      output: {
        a: { 0: 3, 1: 5, 2: { 3: 'c' } },
        b: null,
      },
    },

    'works for arrays': {
      input: {
        a: [1, undefined, 2],
      },
      output: {
        a: [1, null, 2],
      },
      outputAnnotations: {
        values: {
          'a.1': ['undefined'],
        },
      },
    },

    'works for Sets': {
      input: {
        a: new Set([1, undefined, 2]),
      },
      output: {
        a: [1, null, 2],
      },
      outputAnnotations: {
        values: {
          a: ['set', { 1: ['undefined'] }],
        },
      },
    },

    'works for top-level Sets': {
      input: new Set([1, undefined, 2]),
      output: [1, null, 2],
      outputAnnotations: {
        values: ['set', { 1: ['undefined'] }],
      },
    },

    'works for Maps': {
      input: {
        a: new Map([
          [1, 'a'],
          [NaN, 'b'],
        ]),
        b: new Map([['2', 'b']]),
        d: new Map([[true, 'true key']]),
      },

      output: {
        a: [
          [1, 'a'],
          ['NaN', 'b'],
        ],
        b: [['2', 'b']],
        d: [[true, 'true key']],
      },

      outputAnnotations: {
        values: {
          a: ['map', { '1.0': ['number'] }],
          b: ['map'],
          d: ['map'],
        },
      },
    },

    'preserves object identity': {
      input: () => {
        const a = { id: 'a' };
        const b = { id: 'b' };
        return {
          options: [a, b],
          selected: a,
        };
      },
      output: {
        options: [{ id: 'a' }, { id: 'b' }],
        selected: { id: 'a' },
      },
      outputAnnotations: {
        referentialEqualities: {
          selected: ['options.0'],
        },
      },
      customExpectations: output => {
        expect(output.selected).toBe(output.options[0]);
      },
    },

    'works for paths containing dots': {
      input: {
        'a.1': {
          b: new Set([1, 2]),
        },
      },
      output: {
        'a.1': {
          b: [1, 2],
        },
      },
      outputAnnotations: {
        values: {
          'a\\.1.b': ['set'],
        },
      },
    },

    'works for paths containing backslashes': {
      input: {
        'a\\.1': {
          b: new Set([1, 2]),
        },
      },
      output: {
        'a\\.1': {
          b: [1, 2],
        },
      },
      outputAnnotations: {
        values: {
          'a\\\\\\.1.b': ['set'],
        },
      },
    },

    'works for dates': {
      input: {
        meeting: {
          date: new Date(2020, 1, 1),
        },
      },
      output: {
        meeting: {
          date: new Date(2020, 1, 1).toISOString(),
        },
      },
      outputAnnotations: {
        values: {
          'meeting.date': ['Date'],
        },
      },
    },

    'works for Errors': {
      input: {
        e: new Error('epic fail'),
      },
      output: ({ e }: any) => {
        expect(e.name).toBe('Error');
        expect(e.message).toBe('epic fail');
      },
      outputAnnotations: {
        values: {
          e: ['Error'],
        },
      },
    },

    'works for Error causes': {
      input: {
        e: new Error('subtle fail', {
          cause: new Error('catastrophic failure'),
        }),
      },
      output: ({ e }: any) => {
        expect(e.name).toBe('Error');
        expect(e.message).toBe('subtle fail');
        expect(e.cause?.name).toBe('Error');
        expect(e.cause?.message).toBe('catastrophic failure');
      },
      outputAnnotations: {
        values: {
          e: [
            'Error',
            {
              cause: ['Error'],
            },
          ],
        },
      },
    },

    'works for regex': {
      input: {
        a: /hello/g,
      },
      output: {
        a: '/hello/g',
      },
      outputAnnotations: {
        values: {
          a: ['regexp'],
        },
      },
    },

    'works for Infinity': {
      input: {
        a: Number.POSITIVE_INFINITY,
      },
      output: {
        a: 'Infinity',
      },
      outputAnnotations: {
        values: {
          a: ['number'],
        },
      },
    },

    'works for -Infinity': {
      input: {
        a: Number.NEGATIVE_INFINITY,
      },
      output: {
        a: '-Infinity',
      },
      outputAnnotations: {
        values: {
          a: ['number'],
        },
      },
    },

    'works for NaN': {
      input: {
        a: NaN,
      },
      output: {
        a: 'NaN',
      },
      outputAnnotations: {
        values: {
          a: ['number'],
        },
      },
    },

    'works for bigint': {
      input: {
        a: BigInt('1021312312412312312313'),
      },
      output: {
        a: '1021312312412312312313',
      },
      outputAnnotations: {
        values: {
          a: ['bigint'],
        },
      },
    },

    'works for unknown': {
      input: () => {
        type Freak = {
          name: string;
          age: unknown;
        };

        const person: Freak = {
          name: '@ftonato',
          age: 1,
        };

        return person;
      },
      output: {
        name: '@ftonato',
        age: 1,
      },
      outputAnnotations: undefined,
    },

    'works for self-referencing objects': {
      input: () => {
        const a = { role: 'parent', children: [] as any[] };
        const b = { role: 'child', parents: [a] };
        a.children.push(b);
        return a;
      },
      output: {
        role: 'parent',
        children: [
          {
            role: 'child',
            parents: [null],
          },
        ],
      },
      outputAnnotations: {
        referentialEqualities: [['children.0.parents.0']],
      },
    },

    'works for Maps with two keys that serialize to the same string but have a different reference': {
      input: new Map([
        [/a/g, 'foo'],
        [/a/g, 'bar'],
      ]),
      output: [
        ['/a/g', 'foo'],
        ['/a/g', 'bar'],
      ],
      outputAnnotations: {
        values: [
          'map',
          {
            '0.0': ['regexp'],
            '1.0': ['regexp'],
          },
        ],
      },
    },

    "works for Maps with a key that's referentially equal to another field": {
      input: () => {
        const robbyBubble = { id: 5 };
        const highscores = new Map([[robbyBubble, 5000]]);
        return {
          highscores,
          topScorer: robbyBubble,
        } as any;
      },
      output: {
        highscores: [[{ id: 5 }, 5000]],
        topScorer: { id: 5 },
      },
      outputAnnotations: {
        values: {
          highscores: ['map'],
        },
        referentialEqualities: {
          topScorer: ['highscores.0.0'],
        },
      },
    },

    'works for referentially equal maps': {
      input: () => {
        const map = new Map([[1, 1]]);
        return {
          a: map,
          b: map,
        };
      },
      output: {
        a: [[1, 1]],
        b: [[1, 1]],
      },
      outputAnnotations: {
        values: {
          a: ['map'],
          b: ['map'],
        },
        referentialEqualities: {
          a: ['b'],
        },
      },
      customExpectations: value => {
        expect(value.a).toBe(value.b);
      },
    },

    'works for maps with non-uniform keys': {
      input: {
        map: new Map<string | number, number>([
          [1, 1],
          ['1', 1],
        ]),
      },
      output: {
        map: [
          [1, 1],
          ['1', 1],
        ],
      },
      outputAnnotations: {
        values: {
          map: ['map'],
        },
      },
    },

    'works for referentially equal values inside a set': {
      input: () => {
        const user = { id: 2 };
        return {
          users: new Set([user]),
          userOfTheMonth: user,
        };
      },
      output: {
        users: [{ id: 2 }],
        userOfTheMonth: { id: 2 },
      },
      outputAnnotations: {
        values: {
          users: ['set'],
        },
        referentialEqualities: {
          userOfTheMonth: ['users.0'],
        },
      },
      customExpectations: value => {
        expect(value.users.values().next().value).toBe(value.userOfTheMonth);
      },
    },

    'works for referentially equal values in different maps and sets': {
      input: () => {
        const user = { id: 2 };

        return {
          workspaces: new Map([
            [1, { users: new Set([user]) }],
            [2, { users: new Set([user]) }],
          ]),
        };
      },
      output: {
        workspaces: [
          [1, { users: [{ id: 2 }] }],
          [2, { users: [{ id: 2 }] }],
        ],
      },
      outputAnnotations: {
        values: {
          workspaces: [
            'map',
            {
              '0.1.users': ['set'],
              '1.1.users': ['set'],
            },
          ],
        },
        referentialEqualities: {
          'workspaces.0.1.users.0': ['workspaces.1.1.users.0'],
        },
      },
    },

    'works for symbols': {
      skipOnNode10: true,
      input: () => {
        const parent = Symbol('Parent');
        const child = Symbol('Child');
        SuperJSON.registerSymbol(parent, '1');
        SuperJSON.registerSymbol(child, '2');

        const a = { role: parent };
        const b = { role: child };

        return { a, b };
      },
      output: {
        a: { role: 'Parent' },
        b: { role: 'Child' },
      },
      outputAnnotations: {
        values: {
          'a.role': [['symbol', '1']],
          'b.role': [['symbol', '2']],
        },
      },
    },

    'works for custom transformers': {
      input: () => {
        SuperJSON.registerCustom<ObjectID, string>(
          {
            isApplicable: (v): v is ObjectID => v instanceof ObjectID,
            serialize: v => v.toHexString(),
            deserialize: v => new ObjectID(v),
          },
          'objectid'
        );

        return {
          a: new ObjectID('5f7887f4f0b172093e89f126'),
        };
      },
      output: {
        a: '5f7887f4f0b172093e89f126',
      },
      outputAnnotations: {
        values: {
          a: [['custom', 'objectid']],
        },
      },
    },

    'works for Decimal.js': {
      input: () => {
        SuperJSON.registerCustom<Decimal, string>(
          {
            isApplicable: (v): v is Decimal => Decimal.isDecimal(v),
            serialize: v => v.toJSON(),
            deserialize: v => new Decimal(v),
          },
          'decimal.js'
        );

        return {
          a: new Decimal('100.1'),
        };
      },
      output: {
        a: '100.1',
      },
      outputAnnotations: {
        values: {
          a: [['custom', 'decimal.js']],
        },
      },
    },

    'issue #58': {
      skipOnNode10: true,
      input: () => {
        const cool = Symbol('cool');
        SuperJSON.registerSymbol(cool);
        return {
          q: [
            9,
            {
              henlo: undefined,
              yee: new Date(2020, 1, 1),
              yee2: new Date(2020, 1, 1),
              foo1: new Date(2020, 1, 1),
              z: cool,
            },
          ],
        };
      },
      output: {
        q: [
          9,
          {
            henlo: null,
            yee: new Date(2020, 1, 1).toISOString(),
            yee2: new Date(2020, 1, 1).toISOString(),
            foo1: new Date(2020, 1, 1).toISOString(),
            z: 'cool',
          },
        ],
      },
      outputAnnotations: {
        values: {
          'q.1.henlo': ['undefined'],
          'q.1.yee': ['Date'],
          'q.1.yee2': ['Date'],
          'q.1.foo1': ['Date'],
          'q.1.z': [['symbol', 'cool']],
        },
      },
    },

    'works with custom allowedProps': {
      input: () => {
        class User {
          constructor(public username: string, public password: string) {}
        }
        SuperJSON.registerClass(User, { allowProps: ['username'] });
        return new User('bongocat', 'supersecurepassword');
      },
      output: {
        username: 'bongocat',
      },
      outputAnnotations: {
        values: [['class', 'User']],
      },
      customExpectations(value) {
        expect(value.password).toBeUndefined();
        expect(value.username).toBe('bongocat');
      },
      dontExpectEquality: true,
    },

    'works with typed arrays': {
      input: {
        a: new Int8Array([1, 2]),
        b: new Uint8ClampedArray(3),
      },
      output: {
        a: [1, 2],
        b: [0, 0, 0],
      },
      outputAnnotations: {
        values: {
          a: [['typed-array', 'Int8Array']],
          b: [['typed-array', 'Uint8ClampedArray']],
        },
      },
    },

    'works with NaN and Infinity in Float64Array, issue #292': {
      input: {
        a: new Float64Array([NaN, 0, NaN, 1]),
        b: new Float64Array([Infinity, -Infinity, NaN, 0]),
        c: new Float32Array([NaN, Infinity, -Infinity]),
      },
      output: {
        a: ['NaN', 0, 'NaN', 1],
        b: ['Infinity', '-Infinity', 'NaN', 0],
        c: ['NaN', 'Infinity', '-Infinity'],
      },
      outputAnnotations: {
        values: {
          a: [['typed-array', 'Float64Array']],
          b: [['typed-array', 'Float64Array']],
          c: [['typed-array', 'Float32Array']],
        },
      },
      customExpectations: (value: any) => {
        expect(Number.isNaN(value.a[0])).toBe(true);
        expect(Number.isNaN(value.a[2])).toBe(true);
        expect(value.b[0]).toBe(Infinity);
        expect(value.b[1]).toBe(-Infinity);
        expect(Number.isNaN(value.b[2])).toBe(true);
      },
    },

    'preserves negative zero in Float64Array and Float32Array': {
      input: {
        a: new Float64Array([-0, 0, -0, 1]),
        b: new Float32Array([-0, 2]),
      },
      output: {
        a: ['-0', 0, '-0', 1],
        b: ['-0', 2],
      },
      outputAnnotations: {
        values: {
          a: [['typed-array', 'Float64Array']],
          b: [['typed-array', 'Float32Array']],
        },
      },
      customExpectations: (value: any) => {
        expect(Object.is(value.a[0], -0)).toBe(true);
        expect(Object.is(value.a[1], 0)).toBe(true);
        expect(Object.is(value.a[2], -0)).toBe(true);
        expect(value.a[3]).toBe(1);
        expect(Object.is(value.b[0], -0)).toBe(true);
        expect(value.b[1]).toBe(2);
      },
    },

    'works with BigInt typed arrays': {
      input: {
        a: new BigInt64Array([1n, 2n, -3n, 9007199254740993n]),
        b: new BigUint64Array([0n, 18446744073709551615n]),
      },
      output: {
        // bigint isn't valid JSON, so values are stored as strings
        a: ['1', '2', '-3', '9007199254740993'],
        b: ['0', '18446744073709551615'],
      },
      outputAnnotations: {
        values: {
          a: [['typed-array', 'BigInt64Array']],
          b: [['typed-array', 'BigUint64Array']],
        },
      },
      customExpectations: (value: any) => {
        expect(value.a).toBeInstanceOf(BigInt64Array);
        expect([...value.a]).toEqual([1n, 2n, -3n, 9007199254740993n]);
        expect(value.b).toBeInstanceOf(BigUint64Array);
        expect([...value.b]).toEqual([0n, 18446744073709551615n]);
      },
    },

    'works for undefined, issue #48': {
      input: undefined,
      output: null,
      outputAnnotations: { values: ['undefined'] },
    },

    'regression #109: nested classes': {
      input: () => {
        class Pet {
          constructor(private name: string) {}

          woof() {
            return this.name;
          }
        }

        class User {
          constructor(public pet: Pet) {}
        }

        SuperJSON.registerClass(Pet);
        SuperJSON.registerClass(User);

        const pet = new Pet('Rover');
        const user = new User(pet);

        return user;
      },
      output: {
        pet: {
          name: 'Rover',
        },
      },
      outputAnnotations: {
        values: [
          ['class', 'User'],
          {
            pet: [['class', 'Pet']],
          },
        ],
      },
      customExpectations(value) {
        expect(value.pet.woof()).toEqual('Rover');
      },
    },
    'works with URL': {
      input: {
        a: new URL('https://example.com/'),
        b: new URL('https://github.com/blitz-js/superjson'),
      },
      output: {
        a: 'https://example.com/',
        b: 'https://github.com/blitz-js/superjson',
      },
      outputAnnotations: {
        values: {
          a: ['URL'],
          b: ['URL'],
        },
      },
    },
    'repro #310: meta path escape bug': {
      input: {
        a: ["/'a'[0]: string that becomes a regex/"],
        'a.0': /'a.0': regex that becomes a string/,
        'b.0': "/'b.0': string that becomes a regex/",
        'b\\': [/'b\\'[0]: regex that becomes a string/],
      },
      output: {
        a: ["/'a'[0]: string that becomes a regex/"],
        'a.0': "/'a.0': regex that becomes a string/",
        'b.0': "/'b.0': string that becomes a regex/",
        'b\\': ["/'b\\\\'[0]: regex that becomes a string/"],
      },
      outputAnnotations: {
        values: {
          'a\\.0': ['regexp'],
          'b\\\\.0': ['regexp'],
        },
      },
    },
    'regression #347: shared regex': {
      input: () => {
        const regex = /shared-regex/g;
        return {
          a: regex,
          b: regex,
        };
      },
      output: {
        a: '/shared-regex/g',
        b: '/shared-regex/g',
      },
      outputAnnotations: {
        values: {
          a: ['regexp'],
          b: ['regexp'],
        },
        referentialEqualities: {
          a: ['b'],
        },
      },
      customExpectations: output => {
        expect(output.a).toBe(output.b);
      },
    },
    'regression #347: circular set and map': {
      input: () => {
        const set = new Set<any>();
        set.add(set);

        const map = new Map<any, any>();
        map.set(map, map);
        return {
          a: set,
          b: map,
        };
      },
      output: {
        a: [null],
        b: [[null, null]],
      },
      outputAnnotations: {
        values: {
          a: ['set'],
          b: ['map'],
        },
        referentialEqualities: {
          a: ['a.0'],
          b: ['b.0.0', 'b.0.1'],
        },
      },
      customExpectations: output => {
        expect(output.a.values().next().value).toBe(output.a);
        expect(output.b.values().next().value).toBe(output.b);
      },
    },
    'regression #347: circular set in root': {
      input: () => {
        const set = new Set<any>();
        set.add(set);
        return set;
      },
      output: [null],
      outputAnnotations: {
        values: ['set'],
        referentialEqualities: [['0']],
      },
      customExpectations: output => {
        expect(output.values().next().value).toBe(output);
      },
    },
    'regression #347: circular map in root': {
      input: () => {
        const map = new Map<any, any>();
        map.set(map, map);
        return map;
      },
      output: [[null, null]],
      outputAnnotations: {
        values: ['map'],
        referentialEqualities: [['0.0', '0.1']],
      },
      customExpectations: output => {
        expect(output.values().next().value).toBe(output);
        expect(output.keys().next().value).toBe(output);
      },
    },
    'regression #347: only referential equalities': {
      input: () => {
        const a = {};
        a['a'] = a;
        return {
          a: a,
        };
      },
      output: {
        a: { a: null },
      },
      outputAnnotations: {
        referentialEqualities: {
          a: ['a.a'],
        },
      },
      customExpectations: output => {
        expect(output.a).toBe(output.a.a);
      },
    },
  };

  function deepFreeze(object: any, alreadySeenObjects = new Set()) {
    if (isPrimitive(object)) {
      return;
    }

    if (isTypedArray(object)) {
      return;
    }

    if (alreadySeenObjects.has(object)) {
      return;
    } else {
      alreadySeenObjects.add(object);
    }

    if (isPlainObject(object)) {
      Object.values(object).forEach(o => deepFreeze(o, alreadySeenObjects));
    }

    if (isSet(object)) {
      object.forEach(o => deepFreeze(o, alreadySeenObjects));
    }

    if (isArray(object)) {
      object.forEach(o => deepFreeze(o, alreadySeenObjects));
    }

    if (isMap(object)) {
      object.forEach((value, key) => {
        deepFreeze(key, alreadySeenObjects);
        deepFreeze(value, alreadySeenObjects);
      });
    }

    Object.freeze(object);
  }

  for (const [
    testName,
    {
      input,
      output: expectedOutput,
      outputAnnotations: expectedOutputAnnotations,
      customExpectations,
      skipOnNode10,
      dontExpectEquality,
      only,
    },
  ] of Object.entries(cases)) {
    let testFunc = test;

    if (skipOnNode10 && isNode10) {
      testFunc = test.skip;
    }

    if (only) {
      testFunc = test.only;
    }

    testFunc(testName, () => {
      const inputValue = typeof input === 'function' ? input() : input;

      // let's make sure SuperJSON doesn't mutate our input!
      deepFreeze(inputValue);
      const { json, meta } = SuperJSON.serialize(inputValue);

      if (typeof expectedOutput === 'function') {
        expectedOutput(json);
      } else {
        expect(json).toEqual(expectedOutput);
      }
      if (meta) {
        const { v, ...rest } = meta;
        expect(v).toBe(1);
        expect(rest).toEqual(expectedOutputAnnotations);
      } else {
        expect(meta).toEqual(expectedOutputAnnotations);
      }

      const untransformed = SuperJSON.deserialize(
        JSON.parse(JSON.stringify({ json, meta }))
      );
      if (!dontExpectEquality) {
        expect(untransformed).toEqual(inputValue);
      }
      customExpectations?.(untransformed);
    });
  }

  describe('when serializing custom class instances', () => {
    it('revives them to their original class', () => {
      class Carriage {
        constructor(public name: string) {}
      }
      SuperJSON.registerClass(Carriage);

      class Train {
        constructor(
          private topSpeed: number,
          private color: 'red' | 'blue' | 'yellow',
          private brand: string,
          public carriages: Set<Carriage>,
        ) {}

        public brag() {
          return `I'm a ${this.brand} in freakin' ${this.color} and I go ${this.topSpeed} km/h, isn't that bonkers?`;
        }
      }

      SuperJSON.registerClass(Train);

      const { json, meta } = SuperJSON.serialize({
        s7: new Train(100, 'yellow', 'Bombardier', new Set([new Carriage('front'), new Carriage('back')])) as any,
      });
      
      expect(json).toEqual({
        s7: {
          topSpeed: 100,
          color: 'yellow',
          brand: 'Bombardier',
          carriages: [
            { name: 'front' },
            { name: 'back' },
          ],
        },
      });

      expect(meta).toEqual({
        v: 1,
        values: {
          s7: [['class', 'Train'], { carriages: ["set", { 0: [['class', 'Carriage']], 1: [['class', 'Carriage']] }] }],
        },
      });

      const deserialized: any = SuperJSON.deserialize(
        JSON.parse(JSON.stringify({ json, meta }))
      );
      expect(deserialized.s7).toBeInstanceOf(Train);
      expect(deserialized.s7.carriages).toBeInstanceOf(Set);
      expect([...deserialized.s7.carriages][0]).toBeInstanceOf(Carriage);
      expect([...deserialized.s7.carriages][1]).toBeInstanceOf(Carriage);
      expect(typeof deserialized.s7.brag()).toBe('string');
    });

    describe('with accessor attributes', () => {
      it('works', () => {
        class Currency {
          constructor(private valueInUsd: number) {}

          // @ts-ignore
          get inUSD() {
            return this.valueInUsd;
          }
        }

        SuperJSON.registerClass(Currency);

        const { json, meta } = SuperJSON.serialize({
          price: new Currency(100) as any,
        });

        expect(json).toEqual({
          price: {
            valueInUsd: 100,
          },
        });

        const result: any = SuperJSON.parse(JSON.stringify({ json, meta }));

        const price: Currency = result.price;

        expect(price.inUSD).toBe(100);
      });
    });
  });

  describe('when given a non-SuperJSON object', () => {
    it.todo('has undefined behaviour');
  });

  test('regression #65: BigInt on Safari v13', () => {
    const oldBigInt = global.BigInt;
    // @ts-ignore
    delete global.BigInt;

    const input = {
      a: oldBigInt('1000'),
    };

    const superJSONed = SuperJSON.serialize(input);
    expect(superJSONed).toEqual({
      json: {
        a: '1000',
      },
      meta: {
        v: 1,
        values: {
          a: ['bigint'],
        },
      },
    });

    const deserialised = SuperJSON.deserialize(
      JSON.parse(JSON.stringify(superJSONed))
    );
    expect(deserialised).toEqual({
      a: '1000',
    });

    global.BigInt = oldBigInt;
  });

  test('regression #80: Custom error serialisation isnt overriden', () => {
    class CustomError extends Error {
      constructor(public readonly customProperty: number) {
        super("I'm a custom error");
        // eslint-disable-next-line es5/no-es6-static-methods
        Object.setPrototypeOf(this, CustomError.prototype);
      }
    }

    expect(new CustomError(10)).toBeInstanceOf(CustomError);

    SuperJSON.registerClass(CustomError);

    const { error } = SuperJSON.deserialize(
      SuperJSON.serialize({
        error: new CustomError(10),
      })
    ) as any;

    expect(error).toBeInstanceOf(CustomError);
    expect(error.customProperty).toEqual(10);
  });
});

describe('allowErrorProps(...) (#91)', () => {
  it('works with simple prop values', () => {
    const errorWithAdditionalProps: Error & any = new Error(
      'I have additional props 😄'
    );
    errorWithAdditionalProps.code = 'P2002';
    errorWithAdditionalProps.meta = '👾';

    // same as allowErrorProps("code", "meta")
    SuperJSON.allowErrorProps('code');
    SuperJSON.allowErrorProps('meta');

    const errorAfterTransition: any = SuperJSON.parse(
      SuperJSON.stringify(errorWithAdditionalProps)
    );

    expect(errorAfterTransition).toBeInstanceOf(Error);
    expect(errorAfterTransition.message).toEqual('I have additional props 😄');
    expect(errorAfterTransition.code).toEqual('P2002');
    expect(errorAfterTransition.meta).toEqual('👾');
  });

  it.skip('works with complex prop values', () => {
    const errorWithAdditionalProps: any = new Error();
    errorWithAdditionalProps.map = new Map();

    SuperJSON.allowErrorProps('map');

    const errorAfterTransition: any = SuperJSON.parse(
      SuperJSON.stringify(errorWithAdditionalProps)
    );

    expect(errorAfterTransition.map).toEqual(undefined);

    expect(errorAfterTransition.map).toBeInstanceOf(Map);
  });
});

describe('Error without a cause', () => {
  it('does not synthesize an own cause property on the round-trip', () => {
    const original = new Error('no cause here');
    expect(Object.hasOwn(original, 'cause')).toBe(false);

    const roundTripped: any = SuperJSON.parse(SuperJSON.stringify(original));

    expect(roundTripped).toBeInstanceOf(Error);
    expect(roundTripped.message).toBe('no cause here');
    expect(Object.hasOwn(roundTripped, 'cause')).toBe(false);
  });

  it('preserves an explicit cause', () => {
    const original = new Error('outer', { cause: 'inner reason' });
    expect(Object.hasOwn(original, 'cause')).toBe(true);

    const roundTripped: any = SuperJSON.parse(SuperJSON.stringify(original));

    expect(Object.hasOwn(roundTripped, 'cause')).toBe(true);
    expect(roundTripped.cause).toBe('inner reason');
  });
});

test('regression #83: negative zero', () => {
  const input = -0;

  const stringified = SuperJSON.stringify(input);
  expect(stringified).toMatchInlineSnapshot(
    `"{\\"json\\":\\"-0\\",\\"meta\\":{\\"values\\":[\\"number\\"],\\"v\\":1}}"`
  );

  const parsed: number = SuperJSON.parse(stringified);

  expect(1 / parsed).toBe(-Infinity);
});

test('regression https://github.com/blitz-js/babel-plugin-superjson-next/issues/63: Nested BigInt', () => {
  const serialized = SuperJSON.serialize({
    topics: [
      {
        post_count: BigInt('22'),
      },
    ],
  });

  expect(() => JSON.stringify(serialized)).not.toThrow();

  expect(typeof (serialized.json as any).topics[0].post_count).toBe('string');
  expect(serialized.json).toEqual({
    topics: [
      {
        post_count: '22',
      },
    ],
  });

  SuperJSON.deserialize(serialized);
  expect(typeof (serialized.json as any).topics[0].post_count).toBe('string');
});

test('performance regression', () => {
  const data: any[] = [];
  for (let i = 0; i < 100; i++) {
    let nested1 = [];
    let nested2 = [];
    for (let j = 0; j < 10; j++) {
      nested1[j] = {
        createdAt: new Date(),
        updatedAt: new Date(),
        innerNested: {
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      nested2[j] = {
        createdAt: new Date(),
        updatedAt: new Date(),
        innerNested: {
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
    }
    const object = {
      createdAt: new Date(),
      updatedAt: new Date(),
      nested1,
      nested2,
    };
    data.push(object);
  }

  const t1 = Date.now();
  SuperJSON.serialize(data);
  const t2 = Date.now();
  const duration = t2 - t1;
  expect(duration).toBeLessThan(700);
});

test('regression #95: no undefined', () => {
  const input: unknown[] = [];

  const out = SuperJSON.serialize(input);
  expect(out).not.toHaveProperty('meta');

  const parsed: number = SuperJSON.deserialize(out);

  expect(parsed).toEqual(input);
});

test('regression #108: Error#stack should not be included by default', () => {
  const input = new Error("Beep boop, you don't wanna see me. I'm an error!");
  expect(input).toHaveProperty('stack');

  const { stack: thatShouldBeUndefined } = SuperJSON.parse(
    SuperJSON.stringify(input)
  ) as any;
  expect(thatShouldBeUndefined).toBeUndefined();

  SuperJSON.allowErrorProps('stack');
  const { stack: thatShouldExist } = SuperJSON.parse(
    SuperJSON.stringify(input)
  ) as any;
  expect(thatShouldExist).toEqual(input.stack);
});

test('regression: `Object.create(null)` / object without prototype', () => {
  const input: Record<string, unknown> = Object.create(null);
  input.date = new Date();

  const stringified = SuperJSON.stringify(input);
  const parsed: any = SuperJSON.parse(stringified);

  expect(parsed.date).toBeInstanceOf(Date);
});

test.each(['__proto__', 'prototype', 'constructor'])(
  'serialize prototype pollution: %s',
  forbidden => {
    expect(() => {
      SuperJSON.serialize({
        [forbidden]: 1,
      });
    }).toThrowError(/This is a prototype pollution risk/);
  }
);

test('prototype pollution - __proto__', () => {
  expect(() => {
    SuperJSON.parse(
      JSON.stringify({
        json: {
          myValue: 1337,
        },
        meta: {
          referentialEqualities: {
            myValue: ['__proto__.x'],
          },
        },
      })
    );
  }).toThrowErrorMatchingInlineSnapshot(
    `"__proto__ is not allowed as a property"`
  );
  expect((Object.prototype as any).x).toBeUndefined();
});

test('prototype pollution - prototype', () => {
  expect(() => {
    SuperJSON.parse(
      JSON.stringify({
        json: {
          myValue: 1337,
        },
        meta: {
          referentialEqualities: {
            myValue: ['prototype.x'],
          },
        },
      })
    );
  }).toThrowErrorMatchingInlineSnapshot(
    `"prototype is not allowed as a property"`
  );
});

test('prototype pollution - constructor', () => {
  expect(() => {
    SuperJSON.parse(
      JSON.stringify({
        json: {
          myValue: 1337,
        },
        meta: {
          referentialEqualities: {
            myValue: ['constructor.prototype.x'],
          },
        },
      })
    );
  }).toThrowErrorMatchingInlineSnapshot(
    `"prototype is not allowed as a property"`
  );

  expect((Object.prototype as any).x).toBeUndefined();
});

test('applies a custom transformer that is registered during serialize', () => {
  const s = new SuperJSON();
  const value = {
    get a() {
      s.registerCustom<string, string>(
        {
          isApplicable: (v): v is string =>
            typeof v === 'string' && v.startsWith('x'),
          serialize: v => v.slice(1),
          deserialize: v => 'x' + v,
        },
        'x-string'
      );
      return 1;
    },
    b: 'xyz',
  };

  const res = s.serialize(value);
  expect(res.json).toEqual({ a: 1, b: 'yz' });
  expect(res.meta?.values).toEqual({ b: [['custom', 'x-string']] });
});

test('superjson instances are independent of one another', () => {
  class Car {}
  const s1 = new SuperJSON();
  s1.registerClass(Car);

  const s2 = new SuperJSON();

  const value = {
    car: new Car(),
  };

  const res1 = s1.serialize(value);
  expect(res1.meta?.values).toEqual({ car: [['class', 'Car']] });
  const res2 = s2.serialize(value);
  expect(res2.json).toEqual(value);
});

test('regression #245: superjson referential equalities only use the top-most parent node', () => {
  type Node = {
    children: Node[];
  };
  const root: Node = {
    children: [],
  };
  const input = {
    a: root,
    b: root,
  };
  const res = SuperJSON.serialize(input);

  expect(res.meta?.referentialEqualities).toHaveProperty(['a']);

  // saying that a.children is equal to b.children is redundant since its already know that a === b
  expect(res.meta?.referentialEqualities).not.toHaveProperty(['a.children']);
  expect(res.meta).toMatchInlineSnapshot(`
    {
      "referentialEqualities": {
        "a": [
          "b",
        ],
      },
      "v": 1,
    }
  `);

  const parsed = SuperJSON.deserialize(res);
  expect(parsed).toEqual(input);
});

test('restores multiple referentially equal values inside the same Set', () => {
  const a = { tag: 'a' };
  const b = { tag: 'b' };
  const input = {
    set: new Set([a, b]),
    a,
    b,
  };

  const output: any = SuperJSON.deserialize(SuperJSON.serialize(input));

  expect([...output.set]).toEqual([a, b]);
  expect(output.set.has(output.a)).toBe(true);
  expect(output.set.has(output.b)).toBe(true);
  expect([...output.set][0]).toBe(output.a);
  expect([...output.set][1]).toBe(output.b);
});

test('restores multiple referentially equal keys inside the same Map', () => {
  const a = { tag: 'a' };
  const b = { tag: 'b' };
  const input = {
    map: new Map<any, any>([
      [a, 1],
      [b, 2],
    ]),
    a,
    b,
  };

  const output: any = SuperJSON.deserialize(SuperJSON.serialize(input));

  expect([...output.map.keys()]).toEqual([a, b]);
  expect(output.map.get(output.a)).toBe(1);
  expect(output.map.get(output.b)).toBe(2);
});

test('regression #346: referential equalities inside a large Set take linear time', () => {
  const size = 166000;
  const equalities = 55000;
  const paths: string[] = [];
  for (let i = 1; i <= equalities; i++) {
    paths.push(String(size - i));
  }

  const start = Date.now();
  const output = SuperJSON.deserialize<Set<unknown>>({
    json: Array.from({ length: size }, () => []),
    meta: {
      values: ['set'],
      referentialEqualities: { '0': paths },
      v: 1,
    },
  });

  expect(Date.now() - start).toBeLessThan(1000);
  expect(output.size).toBe(size - equalities);
});

test('dedupe=true restores deduped values inside a Set at their own index', () => {
  const instance = new SuperJSON({ dedupe: true });
  const a = { tag: 'a' };
  const b = { tag: 'b' };
  const input = { b, a, set: new Set([a, 'x', b, 'y']) };

  const output: any = instance.deserialize(instance.serialize(input));

  expect([...output.set]).toEqual([a, 'x', b, 'y']);
  expect([...output.set][0]).toBe(output.a);
  expect([...output.set][2]).toBe(output.b);
});

test('dedupe=true restores multiple deduped keys inside the same Map', () => {
  const instance = new SuperJSON({ dedupe: true });
  const a = { tag: 'a' };
  const b = { tag: 'b' };
  const input = {
    a,
    b,
    map: new Map<any, any>([
      [a, 1],
      [b, 2],
    ]),
  };

  const output: any = instance.deserialize(instance.serialize(input));

  expect([...output.map.keys()]).toEqual([a, b]);
  expect(output.map.get(output.a)).toBe(1);
  expect(output.map.get(output.b)).toBe(2);
});

test('dedupe=true restores deduped values inside a custom Set subclass', () => {
  class Tags extends Set<unknown> {}
  const instance = new SuperJSON({ dedupe: true });
  instance.registerCustom<Tags, any[]>(
    {
      isApplicable: (v): v is Tags => v instanceof Tags,
      serialize: v => [...v],
      deserialize: v => new Tags(v),
    },
    'Tags'
  );
  const a = { tag: 'a' };
  const b = { tag: 'b' };

  const output: any = instance.deserialize(
    instance.serialize({ a, b, tags: new Tags([a, b]) })
  );

  expect([...output.tags]).toEqual([a, b]);
  expect(output.tags.has(output.a)).toBe(true);
  expect(output.tags.has(output.b)).toBe(true);
});

test('a custom Map subclass written as a plain object still deserializes', () => {
  class UserList extends Map<string, unknown> {}
  const instance = new SuperJSON();
  instance.registerCustom<UserList, any>(
    {
      isApplicable: (v): v is UserList => v instanceof UserList,
      serialize: v => Object.fromEntries(v),
      deserialize: v => new UserList(Object.entries(v)),
    },
    'UserList'
  );
  const ann = { name: 'Ann' };
  const bob = { name: 'Bob' };
  const team = { name: 'core' };

  const output: any = instance.parse(
    instance.stringify({
      me: ann,
      users: new UserList([
        ['u1', ann],
        ['u2', bob],
      ]),
    })
  );
  expect(output.users.get('u1')).toBe(output.me);
  expect(output.users.get('u2')).toEqual(bob);

  const shared: any = instance.parse(
    instance.stringify({
      users: new UserList([
        ['u1', { team }],
        ['u2', { team }],
      ]),
    })
  );
  expect([...shared.users]).toEqual([
    ['u1', { team }],
    ['u2', { team }],
  ]);
});

test('a custom Map subclass written as a flat list still deserializes', () => {
  class FlatMap extends Map<string, unknown> {}
  const instance = new SuperJSON();
  instance.registerCustom<FlatMap, any[]>(
    {
      isApplicable: (v): v is FlatMap => v instanceof FlatMap,
      serialize: v => [...v].flat(),
      deserialize: v => {
        const map = new FlatMap();
        for (let i = 0; i < v.length; i += 2) {
          map.set(v[i], v[i + 1]);
        }
        return map;
      },
    },
    'FlatMap'
  );
  const x = { name: 'x' };
  const y = { name: 'y' };

  const output: any = instance.parse(
    instance.stringify({
      x,
      map: new FlatMap([
        ['a', x],
        ['b', y],
      ]),
    })
  );

  expect([...output.map]).toEqual([
    ['a', x],
    ['b', y],
  ]);
  expect(output.map.get('a')).toBe(output.x);
});

test('a custom Set subclass that adds a member keeps its own positions', () => {
  class WithDefault extends Set<unknown> {}
  const instance = new SuperJSON();
  instance.registerCustom<WithDefault, any[]>(
    {
      isApplicable: (v): v is WithDefault => v instanceof WithDefault,
      serialize: v => [...v],
      deserialize: v => new WithDefault([...v, 'default']),
    },
    'WithDefault'
  );

  const output: any = instance.deserialize({
    json: { set: ['a'], last: null },
    meta: {
      values: { set: [['custom', 'WithDefault']] },
      referentialEqualities: { 'set.1': ['last'] },
      v: 1,
    },
  } as any);

  expect(output.last).toBe('default');
});

test('dedupe=true restores a custom Set subclass whose values were all seen before', () => {
  class Tags extends Set<unknown> {}
  const instance = new SuperJSON({ dedupe: true });
  instance.registerCustom<Tags, any[]>(
    {
      isApplicable: (v): v is Tags => v instanceof Tags,
      serialize: v => [...v],
      deserialize: v => new Tags(v),
    },
    'Tags'
  );
  const a = { tag: 'a' };
  const b = { tag: 'b' };
  const c = { tag: 'c' };

  const top: any = instance.parse(
    instance.stringify({ a, b, c, tags: new Tags([c, b, a]) })
  );
  expect([...top.tags]).toEqual([c, b, a]);
  expect([...top.tags][2]).toBe(top.a);

  const nested: any = instance.parse(
    instance.stringify({ a, b, c, set: new Set([a, b, new Tags([c, b, a])]) })
  );
  const [first, second, tags] = [...nested.set];
  expect(first).toBe(nested.a);
  expect(second).toBe(nested.b);
  expect(tags).toBeInstanceOf(Tags);
  expect([...tags]).toEqual([c, b, a]);
});

test('a value written into a Set is kept when the Set is annotated again', () => {
  const output = SuperJSON.deserialize({
    json: { o: { s: ['2020-01-01T00:00:00.000Z', 'x'] } },
    meta: {
      values: { 'o.s': ['set'], 'o.s.0': ['Date'], o: { s: ['set'] } },
      v: 1,
    },
  } as any);

  expect(output).toEqual({
    o: { s: new Set([new Date('2020-01-01T00:00:00.000Z'), 'x']) },
  });
});

test('a custom Map subclass with its own get() shares the value that get() returns', () => {
  class RecordMap extends Map<string, any> {
    set(key: string, value: unknown) {
      return super.set(key, { stored: value });
    }
    get(key: string) {
      return super.get(key)?.stored;
    }
  }
  const instance = new SuperJSON();
  instance.registerCustom<RecordMap, any[]>(
    {
      isApplicable: (v): v is RecordMap => v instanceof RecordMap,
      serialize: v => [...v.keys()].map(key => [key, v.get(key)]),
      deserialize: v => {
        const map = new RecordMap();
        v.forEach(([key, value]) => map.set(key, value));
        return map;
      },
    },
    'RecordMap'
  );
  const shared = { id: 1 };
  const map = new RecordMap();
  map.set('a', shared);

  const output: any = instance.parse(
    instance.stringify({ map, a: { b: { c: { copy: shared } } } })
  );

  expect(output.a.b.c.copy).toEqual(shared);
  expect(output.a.b.c.copy).toBe(output.map.get('a'));
});

test('a custom Map subclass shares a key without get() being called for the other keys', () => {
  class Strict extends Map<unknown, number> {
    get(key: unknown) {
      if (key === 'locked') throw new Error('locked');
      return super.get(key);
    }
  }
  const instance = new SuperJSON();
  instance.registerCustom<Strict, any[]>(
    {
      isApplicable: (v): v is Strict => v instanceof Strict,
      serialize: v => [...v.entries()],
      deserialize: v => new Strict(v),
    },
    'Strict'
  );
  const key = { id: 1 };

  const output: any = instance.parse(
    instance.stringify({ key, map: new Strict([[key, 1], ['locked', 2]]) })
  );

  expect([...output.map.keys()]).toEqual([key, 'locked']);
  expect([...output.map.keys()][0]).toBe(output.key);
});

test('a custom Map subclass with its own get() keeps its stored values when a key is shared', () => {
  class Doubled extends Map<unknown, number> {
    get(key: unknown) {
      return super.get(key)! * 2;
    }
  }
  const instance = new SuperJSON();
  instance.registerCustom<Doubled, any[]>(
    {
      isApplicable: (v): v is Doubled => v instanceof Doubled,
      serialize: v => [...v.entries()],
      deserialize: v => new Doubled(v),
    },
    'Doubled'
  );
  const key = { id: 1 };

  const output: any = instance.parse(
    instance.stringify({ key, map: new Doubled([[key, 1], ['b', 2]]) })
  );

  expect([...output.map.entries()]).toEqual([
    [key, 1],
    ['b', 2],
  ]);
  expect([...output.map.keys()][0]).toBe(output.key);
});

test('a custom Set subclass with its own keys() order keeps every member when one is shared', () => {
  class NewestFirst extends Set<unknown> {
    *keys() {
      yield* [...super.values()].reverse();
    }
  }
  const instance = new SuperJSON();
  instance.registerCustom<NewestFirst, any[]>(
    {
      isApplicable: (v): v is NewestFirst => v instanceof NewestFirst,
      serialize: v => [...v],
      deserialize: v => new NewestFirst(v),
    },
    'NewestFirst'
  );
  const a = { id: 'a' };
  const b = { id: 'b' };
  const c = { id: 'c' };

  const output: any = instance.parse(
    instance.stringify({ a, set: new NewestFirst([a, b, c]) })
  );

  expect([...output.set]).toEqual([a, b, c]);
  expect([...output.set][0]).toBe(output.a);
});

test('a custom Set subclass with a sorted keys() order is read again after a member is restored', () => {
  class ByRank extends Set<any> {
    *keys() {
      yield* [...super.values()].sort(
        (a, b) => (a?.rank ?? 0) - (b?.rank ?? 0)
      );
    }
  }
  const instance = new SuperJSON({ dedupe: true });
  instance.registerCustom<ByRank, any[]>(
    {
      isApplicable: (v): v is ByRank => v instanceof ByRank,
      serialize: v => [...v],
      deserialize: v => new ByRank(v),
    },
    'ByRank'
  );
  const detail = { text: 'd' };
  const first = { rank: 1, detail };
  const second = { rank: 2 };
  const third = { rank: 3 };

  const output: any = instance.parse(
    instance.stringify({ second, set: new ByRank([first, second, third]), detail })
  );

  expect([...output.set]).toEqual([first, second, third]);
  expect([...output.set][1]).toBe(output.second);
  expect(output.detail).toBe([...output.set][0].detail);
});

test('a NaN Map key stays when another NaN was seen first', () => {
  class Rec extends Map<string, unknown> {}
  const instance = new SuperJSON();
  instance.registerCustom<Rec, any>(
    {
      isApplicable: (v): v is Rec => v instanceof Rec,
      serialize: v => Object.fromEntries(v),
      deserialize: v => new Rec(Object.entries(v)),
    },
    'Rec'
  );

  const output: any = instance.parse(
    instance.stringify({
      rec: new Rec([['k0', [NaN]]]),
      map: new Map([[NaN, 1]]),
    })
  );

  expect([...output.map]).toEqual([[NaN, 1]]);
});

test('dedupe=true', () => {
  const instance = new SuperJSON({
    dedupe: true,
  });

  type Node = {
    children: Node[];
  };
  const root: Node = {
    children: [],
  };
  const input = {
    a: root,
    b: root,
  };
  const output = instance.serialize(input);

  const json = output.json as any;

  expect(json.a);

  // This has already been seen and should be deduped
  expect(json.b).toBeNull();

  expect(json).toMatchInlineSnapshot(`
    {
      "a": {
        "children": [],
      },
      "b": null,
    }
  `);

  expect(instance.deserialize(output)).toEqual(input);
});

test('dedupe=true on a large complicated schema', () => {
  const content = fs.readFileSync(__dirname + '/non-deduped-cal.json', 'utf-8');
  const parsed = JSON.parse(content);

  const deserialized = SuperJSON.deserialize(parsed);

  const nondeduped = new SuperJSON({});

  const deduped = new SuperJSON({
    dedupe: true,
  });

  const nondedupedOut = nondeduped.deserialize(
    nondeduped.serialize(deserialized)
  );
  const dedupedOut = deduped.deserialize(deduped.serialize(deserialized));

  expect(nondedupedOut).toEqual(deserialized);
  expect(dedupedOut).toEqual(deserialized);
});

test('doesnt iterate to keys that dont exist', () => {
  const robbyBubble = { id: 5 };
  const highscores = new Map([[robbyBubble, 5000]]);
  const objectWithReferentialEquality = { highscores, topScorer: robbyBubble };
  const res = SuperJSON.serialize(objectWithReferentialEquality);

  expect(res.meta.referentialEqualities.topScorer).toEqual(['highscores.0.0']);
  res.meta.referentialEqualities.topScorer = ['highscores.99999.0'];

  expect(() => SuperJSON.deserialize(res)).toThrowError('index out of bounds');
});

// https://github.com/flightcontrolhq/superjson/issues/319
test('deserialize in place', () => {
  const serialized = SuperJSON.serialize({ a: new Date() });
  const deserializedCopy = SuperJSON.deserialize(serialized);
  const deserializedInPlace = SuperJSON.deserialize(serialized, {
    inPlace: true,
  });
  expect(deserializedInPlace).toBe(serialized.json);
  expect(deserializedCopy).not.toBe(serialized.json);
  expect(deserializedCopy).toEqual(deserializedInPlace);
});

test('rejects typed-array values that are not arrays', () => {
  // Constructors treat a number, or an object with `length`, as a length and
  // allocate that many elements. SuperJSON only emits a real array, so any
  // other value must be rejected. Lengths stay tiny so a regression fails
  // this assertion instead of allocating.
  const constructors = [
    'Int8Array',
    'Uint8Array',
    'Uint8ClampedArray',
    'Int16Array',
    'Uint16Array',
    'Int32Array',
    'Uint32Array',
    'Float32Array',
    'Float64Array',
    'BigInt64Array',
    'BigUint64Array',
  ];

  const arrayLikes = [
    { length: 4 },
    { length: '4' },
    { length: 4.9 },
    { length: '4e0' },
    4,
    '4',
  ];

  for (const constructor of constructors) {
    for (const json of arrayLikes) {
      expect(() =>
        SuperJSON.deserialize({
          json,
          meta: {
            values: [['typed-array', constructor]],
          },
        })
      ).toThrow();

      expect(() =>
        SuperJSON.parse(
          JSON.stringify({
            json: { a: json },
            meta: {
              values: { a: [['typed-array', constructor]] },
            },
          })
        )
      ).toThrow();
    }
  }

  const restored = SuperJSON.deserialize<Uint8Array>({
    json: [1, 2, 3],
    meta: {
      values: [['typed-array', 'Uint8Array']],
    },
  });
  expect(restored).toBeInstanceOf(Uint8Array);
  expect([...restored]).toEqual([1, 2, 3]);
});

test('#310 fixes backwards compat', () => {
  expect(
    SuperJSON.deserialize({
      json: {
        'a\\.1': {
          b: [1, 2],
        },
      },
      meta: {
        values: {
          'a\\\\.1.b': ['set'],
        },
      },
    })
  ).toEqual({
    'a\\.1': {
      b: new Set([1, 2]),
    },
  });

  expect(
    SuperJSON.deserialize({
      json: {
        'a.1': {
          b: [1, 2],
        },
      },
      meta: {
        values: {
          'a\\.1.b': ['set'],
        },
      },
    })
  ).toEqual({
    'a.1': {
      b: new Set([1, 2]),
    },
  });
});

test('deserialize is linear in path depth times child count', () => {
  const depth = 50_000;
  const childCount = 10_000;
  const children: Record<string, [string]> = {};
  for (let i = 0; i < childCount; i++) {
    children[i] = ['Date'];
  }

  const start = performance.now();
  SuperJSON.deserialize({
    json: 0,
    meta: {
      values: { [Array(depth).fill('a').join('.')]: ['Date', children] },
      v: 1,
    },
  } as any);

  expect(performance.now() - start).toBeLessThan(500);
});

test('value annotations on missing paths add no keys', () => {
  const result = SuperJSON.deserialize({
    json: { c: 5 },
    meta: { values: { zz: { x: ['Date'] } }, v: 1 },
  } as any);

  expect(Object.keys(result as any)).toEqual(['c']);
});

test('value annotations can address a Map that is already converted', () => {
  const [map] = SuperJSON.deserialize<[Map<Date, unknown>]>({
    json: [[[5, { b: [1, 2] }]]] as any,
    meta: {
      values: { '0': ['map'], '0.0': { '0': ['Date'], '1.b': ['set'] } },
      v: 1,
    },
  });

  expect([...map]).toEqual([[new Date(5), { b: new Set([1, 2]) }]]);
});

test('prototype pollution - nested value annotations', () => {
  expect(() =>
    SuperJSON.deserialize(
      JSON.parse(
        '{"json":{"a":{}},"meta":{"values":{"a.__proto__":{"polluted":["undefined"]}},"v":1}}'
      )
    )
  ).toThrowError('__proto__ is not allowed as a property');
  expect(({} as any).polluted).toBeUndefined();
});

test('unwalkable paths without a value annotation are ignored', () => {
  const deserialize = (values: unknown) =>
    SuperJSON.deserialize({
      json: { s: [1, 2] },
      meta: { values, v: 1 },
    } as any);
  const expected = { s: new Set([1, 2]) };

  expect(deserialize({ s: ['set'], constructor: {} })).toEqual(expected);
  expect(deserialize({ s: ['set'], 's.7': { a: {} } })).toEqual(expected);
  expect(() =>
    deserialize({ s: ['set'], 's.7': { a: ['Date'] } })
  ).toThrowError('index out of bounds');
});
