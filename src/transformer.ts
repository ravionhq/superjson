import {
  isBigint,
  isDate,
  isInfinite,
  isMap,
  isNaNValue,
  isRegExp,
  isSet,
  isUndefined,
  isSymbol,
  isArray,
  isError,
  isTypedArray,
  TypedArrayConstructor,
  BigIntTypedArrayConstructor,
  isURL,
} from './is.js';
import SuperJSON from './index.js';
import { parseISOString, toISOString } from './date.js';

export type PrimitiveTypeAnnotation = 'number' | 'undefined' | 'bigint';

type LeafTypeAnnotation = PrimitiveTypeAnnotation | 'regexp' | 'Date' | 'URL';

type TypedArrayAnnotation = ['typed-array', string];
type ClassTypeAnnotation = ['class', string];
type SymbolTypeAnnotation = ['symbol', string];
type CustomTypeAnnotation = ['custom', string];

type SimpleTypeAnnotation = LeafTypeAnnotation | 'map' | 'set' | 'Error';

type CompositeTypeAnnotation =
  | TypedArrayAnnotation
  | ClassTypeAnnotation
  | SymbolTypeAnnotation
  | CustomTypeAnnotation;

export type TypeAnnotation = SimpleTypeAnnotation | CompositeTypeAnnotation;

function simpleTransformation<I, O, A extends SimpleTypeAnnotation>(
  isApplicable: (v: any, superJson: SuperJSON) => v is I,
  annotation: A,
  transform: (v: I, superJson: SuperJSON) => O,
  untransform: (v: O, superJson: SuperJSON) => I
) {
  return {
    isApplicable,
    annotation,
    transform,
    untransform,
  };
}

const simpleRules = [
  simpleTransformation(
    isUndefined,
    'undefined',
    () => null,
    () => undefined
  ),
  simpleTransformation(
    isBigint,
    'bigint',
    v => v.toString(),
    v => {
      if (typeof BigInt !== 'undefined') {
        return BigInt(v);
      }

      console.error('Please add a BigInt polyfill.');

      return v as any;
    }
  ),
  simpleTransformation(
    isDate,
    'Date',
    toISOString,
    parseISOString
  ),

  simpleTransformation(
    isError,
    'Error',
    (v, superJson) => {
      const baseError: any = {
        name: v.name,
        message: v.message,
      };

      if ('cause' in v) {
        baseError.cause = v.cause;
      }

      superJson.allowedErrorProps.forEach(prop => {
        baseError[prop] = (v as any)[prop];
      });

      return baseError;
    },
    (v, superJson) => {
      const e =
        'cause' in v
          ? new Error(v.message, { cause: v.cause })
          : new Error(v.message);
      e.name = v.name;
      e.stack = v.stack;

      superJson.allowedErrorProps.forEach(prop => {
        (e as any)[prop] = v[prop];
      });

      return e;
    }
  ),

  simpleTransformation(
    isRegExp,
    'regexp',
    v => '' + v,
    regex => {
      const body = regex.slice(1, regex.lastIndexOf('/'));
      const flags = regex.slice(regex.lastIndexOf('/') + 1);
      return new RegExp(body, flags);
    }
  ),

  simpleTransformation(
    isSet,
    'set',
    // (sets only exist in es6+)
    // eslint-disable-next-line es5/no-es6-methods
    v => [...v.values()],
    v => new Set(v)
  ),
  simpleTransformation(
    isMap,
    'map',
    v => [...v.entries()],
    v => new Map(v)
  ),

  simpleTransformation<number, 'NaN' | 'Infinity' | '-Infinity', 'number'>(
    (v): v is number => isNaNValue(v) || isInfinite(v),
    'number',
    v => {
      if (isNaNValue(v)) {
        return 'NaN';
      }

      if (v > 0) {
        return 'Infinity';
      } else {
        return '-Infinity';
      }
    },
    Number
  ),

  simpleTransformation<number, '-0', 'number'>(
    (v): v is number => v === 0 && 1 / v === -Infinity,
    'number',
    () => {
      return '-0';
    },
    Number
  ),

  simpleTransformation(
    isURL,
    'URL',
    v => v.toString(),
    v => new URL(v)
  ),
];

function compositeTransformation<I, O, A extends CompositeTypeAnnotation>(
  isApplicable: (v: any, superJson: SuperJSON) => v is I,
  annotation: (v: I, superJson: SuperJSON) => A,
  transform: (v: I, superJson: SuperJSON) => O,
  untransform: (v: O, a: A, superJson: SuperJSON) => I
) {
  return {
    isApplicable,
    annotation,
    transform,
    untransform,
  };
}

const symbolRule = compositeTransformation(
  (s, superJson): s is Symbol => {
    if (superJson.symbolRegistry.size > 0 && isSymbol(s)) {
      const isRegistered = !!superJson.symbolRegistry.getIdentifier(s);
      return isRegistered;
    }
    return false;
  },
  (s, superJson) => {
    const identifier = superJson.symbolRegistry.getIdentifier(s);
    return ['symbol', identifier!];
  },
  v => v.description,
  (_, a, superJson) => {
    const value = superJson.symbolRegistry.getValue(a[1]);
    if (!value) {
      throw new Error('Trying to deserialize unknown symbol');
    }
    return value;
  }
);

const constructorToName = [
  Int8Array,
  Uint8Array,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  Uint8ClampedArray,
].reduce<Record<string, TypedArrayConstructor>>((obj, ctor) => {
  obj[ctor.name] = ctor;
  return obj;
}, {});

// BigInt-backed typed arrays hold `bigint` elements, which JSON.stringify
// cannot represent. They're serialized/deserialized as strings instead.
const bigIntConstructorToName: Record<string, BigIntTypedArrayConstructor> = {};
if (typeof BigInt64Array !== 'undefined') {
  bigIntConstructorToName[BigInt64Array.name] = BigInt64Array;
}
if (typeof BigUint64Array !== 'undefined') {
  bigIntConstructorToName[BigUint64Array.name] = BigUint64Array;
}

const typedArrayRule = compositeTransformation(
  isTypedArray,
  v => ['typed-array', v.constructor.name],
  v =>
    [...v].map(n => {
      // bigint values (from BigInt64Array / BigUint64Array) are not valid JSON,
      // so they're stored as strings.
      if (typeof n === 'bigint') {
        return n.toString();
      }
      // Handle special float values that JSON.stringify converts to null
      if (typeof n === 'number') {
        if (Number.isNaN(n)) return 'NaN';
        if (n === Infinity) return 'Infinity';
        if (n === -Infinity) return '-Infinity';
      }
      return n;
    }),
  (v, a) => {
    const bigIntCtor = bigIntConstructorToName[a[1]];
    if (bigIntCtor) {
      const values = v.map((n: string | number | bigint): bigint => BigInt(n));
      return new bigIntCtor(values);
    }

    const ctor = constructorToName[a[1]];

    if (!ctor) {
      throw new Error('Trying to deserialize unknown typed array');
    }

    // Convert string representations back to special float values
    const values = v.map((n: number | string): number => {
      if (n === 'NaN') return NaN;
      if (n === 'Infinity') return Infinity;
      if (n === '-Infinity') return -Infinity;
      return n as number;
    });

    return new ctor(values as number[]);
  }
);

export function isInstanceOfRegisteredClass(
  potentialClass: any,
  superJson: SuperJSON
): potentialClass is any {
  if (superJson.classRegistry.size > 0 && potentialClass?.constructor) {
    const isRegistered = !!superJson.classRegistry.getIdentifier(
      potentialClass.constructor
    );
    return isRegistered;
  }
  return false;
}

const classRule = compositeTransformation(
  isInstanceOfRegisteredClass,
  (clazz, superJson) => {
    const identifier = superJson.classRegistry.getIdentifier(clazz.constructor);
    return ['class', identifier!];
  },
  (clazz, superJson) => {
    const allowedProps = superJson.classRegistry.getAllowedProps(
      clazz.constructor
    );
    if (!allowedProps) {
      return { ...clazz };
    }

    const result: any = {};
    allowedProps.forEach(prop => {
      result[prop] = clazz[prop];
    });
    return result;
  },
  (v, a, superJson) => {
    const clazz = superJson.classRegistry.getValue(a[1]);

    if (!clazz) {
      throw new Error(
        `Trying to deserialize unknown class '${a[1]}' - check https://github.com/blitz-js/superjson/issues/116#issuecomment-773996564`
      );
    }

    return Object.assign(Object.create(clazz.prototype), v);
  }
);

const customRule = compositeTransformation(
  (value, superJson): value is any => {
    return !!superJson.customTransformerRegistry.findApplicable(value);
  },
  (value, superJson) => {
    const transformer = superJson.customTransformerRegistry.findApplicable(
      value
    )!;
    return ['custom', transformer.name];
  },
  (value, superJson) => {
    const transformer = superJson.customTransformerRegistry.findApplicable(
      value
    )!;
    return transformer.serialize(value);
  },
  (v, a, superJson) => {
    const transformer = superJson.customTransformerRegistry.findByName(a[1]);
    if (!transformer) {
      throw new Error('Trying to deserialize unknown custom value');
    }
    return transformer.deserialize(v);
  }
);

const [
  undefinedRule,
  bigintRule,
  dateRule,
  errorRule,
  regexpRule,
  setRule,
  mapRule,
  nonFiniteRule,
  negativeZeroRule,
  urlRule,
] = simpleRules;

const objectRules = [dateRule, errorRule, regexpRule, setRule, mapRule, urlRule];

const applySimple = (
  rule: typeof simpleRules[number],
  value: any,
  superJson: SuperJSON
) => ({
  value: rule.transform(value as never, superJson),
  type: rule.annotation,
});

// Same rule order as before: class, symbol, custom, typed array, then the simple rules. The simple
// rules are split by typeof because each one only accepts a single typeof.
/** Class, symbol and custom rules only. */
export const transformRegisteredValue = (
  value: any,
  superJson: SuperJSON
): { value: any; type: TypeAnnotation } | undefined => {
  if (classRule.isApplicable(value, superJson)) {
    return {
      value: classRule.transform(value, superJson),
      type: classRule.annotation(value, superJson),
    };
  }

  if (symbolRule.isApplicable(value, superJson)) {
    return {
      value: symbolRule.transform(value, superJson),
      type: symbolRule.annotation(value, superJson),
    };
  }

  if (superJson.customTransformerRegistry.size > 0) {
    const transformer = superJson.customTransformerRegistry.findApplicable(
      value
    );
    if (transformer) {
      return {
        value: transformer.serialize(value),
        type: ['custom', transformer.name],
      };
    }
  }

  return undefined;
};

export const transformValue = (
  value: any,
  superJson: SuperJSON
): { value: any; type: TypeAnnotation } | undefined => {
  const registered = transformRegisteredValue(value, superJson);
  if (registered) {
    return registered;
  }

  switch (typeof value) {
    case 'undefined':
      return applySimple(undefinedRule, value, superJson);
    case 'bigint':
      return applySimple(bigintRule, value, superJson);
    case 'number':
      if (nonFiniteRule.isApplicable(value, superJson)) {
        return applySimple(nonFiniteRule, value, superJson);
      }

      if (negativeZeroRule.isApplicable(value, superJson)) {
        return applySimple(negativeZeroRule, value, superJson);
      }

      return undefined;
    case 'object':
    case 'function': {
      if (value === null) {
        return undefined;
      }

      if (typedArrayRule.isApplicable(value, superJson)) {
        return {
          value: typedArrayRule.transform(value, superJson),
          type: typedArrayRule.annotation(value, superJson),
        };
      }

      for (let i = 0; i < objectRules.length; i++) {
        if (objectRules[i].isApplicable(value, superJson)) {
          return applySimple(objectRules[i], value, superJson);
        }
      }

      return undefined;
    }
    default:
      return undefined;
  }
};

const simpleRulesByAnnotation: Record<string, typeof simpleRules[0]> = {};
simpleRules.forEach(rule => {
  simpleRulesByAnnotation[rule.annotation] = rule;
});

export const untransformValue = (
  json: any,
  type: TypeAnnotation,
  superJson: SuperJSON
) => {
  if (isArray(type)) {
    switch (type[0]) {
      case 'symbol':
        return symbolRule.untransform(json, type, superJson);
      case 'class':
        return classRule.untransform(json, type, superJson);
      case 'custom':
        return customRule.untransform(json, type, superJson);
      case 'typed-array':
        return typedArrayRule.untransform(json, type, superJson);
      default:
        throw new Error('Unknown transformation: ' + type);
    }
  } else {
    const transformation = simpleRulesByAnnotation[type];
    if (!transformation) {
      throw new Error('Unknown transformation: ' + type);
    }

    return transformation.untransform(json as never, superJson);
  }
};
