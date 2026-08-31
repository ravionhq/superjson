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

    'works for invalid dates': {
      input: {
        date: new Date('invalid'),
      },
      output: {
        date: '',
      },
      outputAnnotations: {
        values: {
          date: ['Date'],
        },
      },
      dontExpectEquality: true,
      customExpectations: value => {
        expect(value.date).toBeInstanceOf(Date);
        expect(Number.isNaN(value.date.getTime())).toBe(true);
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
  const deserializedInPlace = SuperJSON.deserialize(serialized, { inPlace: true });
  expect(deserializedInPlace).toBe(serialized.json);
  expect(deserializedCopy).not.toBe(serialized.json);
  expect(deserializedCopy).toEqual(deserializedInPlace);
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
