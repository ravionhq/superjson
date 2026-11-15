import { Class, JSONValue, SuperJSONResult, SuperJSONValue } from './types.js';
import { ClassRegistry, RegisterOptions } from './class-registry.js';
import { Registry } from './registry.js';
import {
  CustomTransfomer,
  CustomTransformerRegistry,
} from './custom-transformer-registry.js';
import {
  applyReferentialEqualityAnnotations,
  applyValueAnnotations,
  generateReferentialEqualityAnnotations,
  walker,
} from './plainer.js';
import { copy } from 'copy-anything';

export default class SuperJSON {
  /**
   * If true, SuperJSON will make sure only one instance of referentially equal objects are serialized and the rest are replaced with `null`.
   */
  private readonly dedupe: boolean;

  /**
   * @param dedupeReferentialEqualities  If true, SuperJSON will make sure only one instance of referentially equal objects are serialized and the rest are replaced with `null`.
   */
  constructor({
    dedupe = false,
  }: {
    dedupe?: boolean;
  } = {}) {
    this.dedupe = dedupe;
  }

  serialize(object: SuperJSONValue): SuperJSONResult {
    const identities = new Map<any, any[][]>();
    const output = walker(object, identities, this, this.dedupe);
    const res: SuperJSONResult = {
      json: output.transformedValue,
    };

    if (output.annotations) {
      res.meta = {
        ...res.meta,
        values: output.annotations,
      };
    }

    const equalityAnnotations = generateReferentialEqualityAnnotations(
      identities,
      this.dedupe
    );
    if (equalityAnnotations) {
      res.meta = {
        ...res.meta,
        referentialEqualities: equalityAnnotations,
      };
    }

    if (res.meta) res.meta.v = 1;

    return res;
  }

  deserialize<T = unknown>(
    payload: SuperJSONResult,
    options?: { inPlace?: boolean }
  ): T {
    const { json, meta } = payload;

    let result: T = options?.inPlace ? json : (copy(json) as any);

    if (meta?.values) {
      result = applyValueAnnotations(result, meta.values, meta.v ?? 0, this);
    }

    if (meta?.referentialEqualities) {
      result = applyReferentialEqualityAnnotations(
        result,
        meta.referentialEqualities,
        meta.v ?? 0
      );
    }

    return result;
  }

  stringify(object: SuperJSONValue): string {
    return JSON.stringify(this.serialize(object));
  }

  parse<T = unknown>(string: string): T {
    return this.deserialize(JSON.parse(string), { inPlace: true });
  }

  readonly classRegistry = new ClassRegistry();
  registerClass(v: Class, options?: RegisterOptions | string) {
    this.classRegistry.register(v, options);
  }

  readonly symbolRegistry = new Registry<Symbol>(s => s.description ?? '');
  registerSymbol(v: Symbol, identifier?: string) {
    this.symbolRegistry.register(v, identifier);
  }

  readonly customTransformerRegistry = new CustomTransformerRegistry();
  registerCustom<I, O extends JSONValue>(
    transformer: Omit<CustomTransfomer<I, O>, 'name'>,
    name: string
  ) {
    this.customTransformerRegistry.register({
      name,
      ...transformer,
    });
  }

  readonly allowedErrorProps: string[] = [];
  allowErrorProps(...props: string[]) {
    this.allowedErrorProps.push(...props);
  }

  private static defaultInstance = new SuperJSON();
  static serialize = SuperJSON.defaultInstance.serialize.bind(
    SuperJSON.defaultInstance
  );
  static deserialize = SuperJSON.defaultInstance.deserialize.bind(
    SuperJSON.defaultInstance
  );
  static stringify = SuperJSON.defaultInstance.stringify.bind(
    SuperJSON.defaultInstance
  );
  static parse = SuperJSON.defaultInstance.parse.bind(
    SuperJSON.defaultInstance
  );
  static registerClass = SuperJSON.defaultInstance.registerClass.bind(
    SuperJSON.defaultInstance
  );
  static registerSymbol = SuperJSON.defaultInstance.registerSymbol.bind(
    SuperJSON.defaultInstance
  );
  static registerCustom = SuperJSON.defaultInstance.registerCustom.bind(
    SuperJSON.defaultInstance
  );
  static allowErrorProps = SuperJSON.defaultInstance.allowErrorProps.bind(
    SuperJSON.defaultInstance
  );
}

export { SuperJSON, SuperJSONResult, SuperJSONValue };

export const serialize = SuperJSON.serialize;
export const deserialize = SuperJSON.deserialize;

export const stringify = SuperJSON.stringify;
export const parse = SuperJSON.parse;

export const registerClass = SuperJSON.registerClass;
export const registerCustom = SuperJSON.registerCustom;
export const registerSymbol = SuperJSON.registerSymbol;
export const allowErrorProps = SuperJSON.allowErrorProps;
