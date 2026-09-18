import { Class, JSONValue, SuperJSONResult, SuperJSONValue } from './types.js';
import { ClassRegistry, RegisterOptions } from './class-registry.js';
import { Registry } from './registry.js';
import {
  CustomTransfomer,
  CustomTransformerRegistry,
} from './custom-transformer-registry.js';
import {
  applyReferentialEqualityAnnotations,
  applyReferentialEqualityAnnotationsAsync,
  applyValueAnnotations,
  applyValueAnnotationsAsync,
  asyncWalker,
  generateReferentialEqualityAnnotations,
  generateReferentialEqualityAnnotationsAsync,
  walker,
} from './plainer.js';
import { copy } from 'copy-anything';
import {
  AsyncOptions,
  AsyncDeserializeOptions,
  AsyncYieldController,
  copyAsync,
} from './async.js';

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

  deserialize<T = unknown>(payload: SuperJSONResult, options?: { inPlace?: boolean }): T {
    const { json, meta } = payload;

    let result: T = options?.inPlace ? json : copy(json) as any;

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

  async serializeAsync(
    object: SuperJSONValue,
    options?: AsyncOptions
  ): Promise<SuperJSONResult> {
    const scheduler = new AsyncYieldController(options);
    const identities = new Map<any, any[][]>();
    const output = await asyncWalker(
      object,
      identities,
      this,
      this.dedupe,
      scheduler
    );
    const res: SuperJSONResult = {
      json: output.transformedValue,
    };

    if (output.annotations) {
      res.meta = {
        ...res.meta,
        values: output.annotations,
      };
    }

    const equalityAnnotations =
      await generateReferentialEqualityAnnotationsAsync(
        identities,
        this.dedupe,
        scheduler
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

  async deserializeAsync<T = unknown>(
    payload: SuperJSONResult,
    options?: AsyncDeserializeOptions
  ): Promise<T> {
    const { json, meta } = payload;
    const scheduler = new AsyncYieldController(options);

    let result: T = options?.inPlace
      ? json
      : ((await copyAsync(json, scheduler)) as any);

    if (meta?.values) {
      result = await applyValueAnnotationsAsync(
        result,
        meta.values,
        meta.v ?? 0,
        this,
        scheduler
      );
    }

    if (meta?.referentialEqualities) {
      result = await applyReferentialEqualityAnnotationsAsync(
        result,
        meta.referentialEqualities,
        meta.v ?? 0,
        scheduler
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
  static serializeAsync = SuperJSON.defaultInstance.serializeAsync.bind(
    SuperJSON.defaultInstance
  );
  static deserializeAsync = SuperJSON.defaultInstance.deserializeAsync.bind(
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
export type { AsyncDeserializeOptions, AsyncOptions } from './async.js';

export const serialize = SuperJSON.serialize;
export const deserialize = SuperJSON.deserialize;

export const serializeAsync = SuperJSON.serializeAsync;
export const deserializeAsync = SuperJSON.deserializeAsync;

export const stringify = SuperJSON.stringify;
export const parse = SuperJSON.parse;

export const registerClass = SuperJSON.registerClass;
export const registerCustom = SuperJSON.registerCustom;
export const registerSymbol = SuperJSON.registerSymbol;
export const allowErrorProps = SuperJSON.allowErrorProps;
