import { isArray } from './is.js';

export function forEach<T>(
  record: Record<string, T>,
  run: (v: T, key: string) => void
) {
  const keys = Object.keys(record);
  for (let i = 0; i < keys.length; i++) {
    run(record[keys[i]], keys[i]);
  }
}

export function includes<T>(arr: T[], value: T) {
  return arr.indexOf(value) !== -1;
}

const getType = (payload: any): string =>
  Object.prototype.toString.call(payload).slice(8, -1);

// Same result as `copy` from copy-anything 4: clones arrays and plain objects (enumerable own keys
// and symbols, `__proto__` skipped) and returns everything else by reference. An object without
// @@toStringTag skips the Object.prototype.toString check, because its tag can only be "Array" or
// "Object" here.
export function copy(target: any): any {
  if (typeof target !== 'object' || target === null) {
    return target;
  }

  if (Symbol.toStringTag in target) {
    const type = getType(target);
    if (type === 'Array') {
      return target.map(copy);
    }

    return type === 'Object' ? copyObject(target) : target;
  }

  if (isArray(target)) {
    return target.map(copy);
  }

  return copyObject(target);
}

function copyObject(target: any): any {
  const prototype = Object.getPrototypeOf(target);
  if (prototype !== Object.prototype || prototype.constructor !== Object) {
    return target;
  }

  const result: any = {};
  const keys = Object.keys(target);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key !== '__proto__') {
      result[key] = copy(target[key]);
    }
  }

  const symbols = Object.getOwnPropertySymbols(target);
  for (let i = 0; i < symbols.length; i++) {
    if (Object.prototype.propertyIsEnumerable.call(target, symbols[i])) {
      result[symbols[i]] = copy(target[symbols[i]]);
    }
  }

  return result;
}
