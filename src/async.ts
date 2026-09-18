export interface AsyncOptions {
  yieldRate?: number;
}

export interface AsyncDeserializeOptions extends AsyncOptions {
  inPlace?: boolean;
}

const defaultYieldRate = 1024;

type GlobalWithTimers = typeof globalThis & {
  setImmediate?: (callback: () => void) => void;
  setTimeout: (callback: () => void, delay: number) => unknown;
};

const yieldToEventLoop = () =>
  new Promise<void>(resolve => {
    const globalObject = globalThis as GlobalWithTimers;
    if (globalObject.setImmediate) {
      globalObject.setImmediate(resolve);
    } else {
      globalObject.setTimeout(resolve, 0);
    }
  });

export class AsyncYieldController {
  private count = 0;
  private readonly yieldRate: number;

  constructor(options?: AsyncOptions) {
    const yieldRate = options?.yieldRate ?? defaultYieldRate;
    if (!Number.isFinite(yieldRate) || yieldRate < 1) {
      throw new RangeError('yieldRate must be a finite number greater than 0');
    }

    this.yieldRate = Math.floor(yieldRate);
  }

  async tick(): Promise<void> {
    this.count++;
    if (this.count < this.yieldRate) {
      return;
    }

    this.count = 0;
    await yieldToEventLoop();
  }
}

const isCopyablePlainObject = (value: any): boolean =>
  Object.getPrototypeOf(value) === Object.prototype &&
  Object.prototype.toString.call(value) === '[object Object]';

const assignProp = (
  target: any,
  key: string | symbol,
  value: any,
  source: any
) => {
  if (Object.prototype.propertyIsEnumerable.call(source, key)) {
    target[key] = value;
    return;
  }

  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    writable: true,
    configurable: true,
  });
};

const cloneRef = (
  value: any,
  clones: Map<any, any>,
  sources: any[],
  destinations: any[]
) => {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const array = Array.isArray(value);
  if (!array && !isCopyablePlainObject(value)) {
    return value;
  }

  const existing = clones.get(value);
  if (existing !== undefined) {
    return existing;
  }

  const clone = array ? new Array(value.length) : {};
  clones.set(value, clone);
  sources.push(value);
  destinations.push(clone);
  return clone;
};

export async function copyAsync<T>(
  target: T,
  scheduler: AsyncYieldController
): Promise<T> {
  if (typeof target !== 'object' || target === null) {
    return target;
  }

  const clones = new Map<any, any>();
  const sources: any[] = [];
  const destinations: any[] = [];
  const result = cloneRef(target, clones, sources, destinations);

  while (sources.length) {
    await scheduler.tick();
    const source = sources.pop();
    const destination = destinations.pop();

    if (Array.isArray(source)) {
      for (let index = 0; index < source.length; index++) {
        await scheduler.tick();
        if (index in source) {
          destination[index] = cloneRef(
            source[index],
            clones,
            sources,
            destinations
          );
        }
      }
      continue;
    }

    for (const key in source) {
      await scheduler.tick();
      if (
        !Object.prototype.hasOwnProperty.call(source, key) ||
        key === '__proto__'
      ) {
        continue;
      }

      assignProp(
        destination,
        key,
        cloneRef(source[key], clones, sources, destinations),
        source
      );
    }

    for (const key of Object.getOwnPropertySymbols(source)) {
      await scheduler.tick();
      if (!Object.prototype.propertyIsEnumerable.call(source, key)) {
        continue;
      }

      assignProp(
        destination,
        key,
        cloneRef(source[key], clones, sources, destinations),
        source
      );
    }
  }

  return result;
}