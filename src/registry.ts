import { DoubleIndexedKV } from './double-indexed-kv.js';

export class Registry<T> {
  private kv = new DoubleIndexedKV<string, T>();

  constructor(private readonly generateIdentifier: (v: T) => string) {}

  register(value: T, identifier?: string): void {
    if (this.kv.getByValue(value)) {
      return;
    }

    if (!identifier) {
      identifier = this.generateIdentifier(value);
    }

    this.kv.set(identifier, value);
  }

  clear(): void {
    this.kv.clear();
  }

  get size(): number {
    return this.kv.valueToKey.size;
  }

  getIdentifier(value: T) {
    return this.kv.getByValue(value);
  }

  getValue(identifier: string) {
    return this.kv.getByKey(identifier);
  }
}
