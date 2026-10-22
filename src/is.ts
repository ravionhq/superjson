export const isUndefined = (payload: any): payload is undefined =>
  typeof payload === 'undefined';

export const isNull = (payload: any): payload is null => payload === null;

export const isPlainObject = (
  payload: any
): payload is { [key: string]: any } => {
  if (typeof payload !== 'object' || payload === null) return false;
  if (payload === Object.prototype) return false;
  const prototype = Object.getPrototypeOf(payload);

  return prototype === null || prototype === Object.prototype;
};

export const isEmptyObject = (payload: any): payload is {} =>
  isPlainObject(payload) && Object.keys(payload).length === 0;

export const isArray = (payload: any): payload is any[] =>
  Array.isArray(payload);

export const isString = (payload: any): payload is string =>
  typeof payload === 'string';

export const isNumber = (payload: any): payload is number =>
  typeof payload === 'number' && !isNaN(payload);

export const isBoolean = (payload: any): payload is boolean =>
  typeof payload === 'boolean';

export const isRegExp = (payload: any): payload is RegExp =>
  payload instanceof RegExp;

export const isMap = (payload: any): payload is Map<any, any> =>
  payload instanceof Map;

export const isSet = (payload: any): payload is Set<any> =>
  payload instanceof Set;

// Object.prototype.toString reports an object as "Symbol" only through its @@toStringTag.
const hasSymbolTag = (payload: any): boolean =>
  ((typeof payload === 'object' && payload !== null) ||
    typeof payload === 'function') &&
  payload[Symbol.toStringTag] === 'Symbol';

export const isSymbol = (payload: any): payload is symbol =>
  typeof payload === 'symbol' || hasSymbolTag(payload);

export const isDate = (payload: any): payload is Date =>
  payload instanceof Date && !isNaN(payload.valueOf());

export const isError = (payload: any): payload is Error =>
  payload instanceof Error;

export const isNaNValue = (payload: any): payload is typeof NaN =>
  typeof payload === 'number' && isNaN(payload);

export const isPrimitive = (
  payload: any
): payload is boolean | null | undefined | number | string | symbol => {
  switch (typeof payload) {
    case 'boolean':
    case 'string':
    case 'undefined':
    case 'symbol':
      return true;
    case 'number':
      return !isNaN(payload);
    case 'object':
      return payload === null || hasSymbolTag(payload);
    case 'function':
      return hasSymbolTag(payload);
    default:
      return false;
  }
};

export const isBigint = (payload: any): payload is bigint =>
  typeof payload === 'bigint';

export const isInfinite = (payload: any): payload is number =>
  payload === Infinity || payload === -Infinity;

export type TypedArrayConstructor =
  | Int8ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor;

export type BigIntTypedArrayConstructor =
  | BigInt64ArrayConstructor
  | BigUint64ArrayConstructor;

export type TypedArray = InstanceType<
  TypedArrayConstructor | BigIntTypedArrayConstructor
>;

export const isTypedArray = (payload: any): payload is TypedArray =>
  ArrayBuffer.isView(payload) && !(payload instanceof DataView);

export const isURL = (payload: any): payload is URL => payload instanceof URL;
