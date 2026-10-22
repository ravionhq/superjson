import { JSONValue } from './types.js';

export interface CustomTransfomer<I, O extends JSONValue> {
  name: string;
  isApplicable: (v: any) => v is I;
  serialize: (v: I) => O;
  deserialize: (v: O) => I;
}

export class CustomTransformerRegistry {
  private transfomers: Record<string, CustomTransfomer<any, any>> = {};
  private ordered: CustomTransfomer<any, any>[] = [];

  register<I, O extends JSONValue>(transformer: CustomTransfomer<I, O>) {
    this.transfomers[transformer.name] = transformer;
    this.ordered = Object.values(this.transfomers);
  }

  get size(): number {
    return this.ordered.length;
  }

  findApplicable<T>(v: T) {
    const transformers = this.ordered;
    for (let i = 0; i < transformers.length; i++) {
      if (transformers[i].isApplicable(v)) {
        return transformers[i] as CustomTransfomer<T, JSONValue>;
      }
    }

    return undefined;
  }

  findByName(name: string) {
    return this.transfomers[name];
  }
}
