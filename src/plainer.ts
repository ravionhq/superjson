import {
  isArray,
  isEmptyObject,
  isError,
  isMap,
  isPlainObject,
  isPrimitive,
  isSet,
} from './is.js';
import { escapeKey, stringifyPath } from './pathstringifier.js';
import {
  isInstanceOfRegisteredClass,
  transformRegisteredValue,
  transformValue,
  TypeAnnotation,
  untransformValue,
} from './transformer.js';
import { forEach } from './util.js';
import { parsePath } from './pathstringifier.js';
import { getDeep, setDeep } from './accessDeep.js';
import SuperJSON from './index.js';

type Tree<T> = InnerNode<T> | Leaf<T>;
type Leaf<T> = [T];
type InnerNode<T> = [T, Record<string, Tree<T>>];

export type MinimisedTree<T> = Tree<T> | Record<string, Tree<T>> | undefined;

const enableLegacyPaths = (version: number) => version < 1;

function traverse<T>(
  tree: MinimisedTree<T>,
  walker: (v: T, path: string[]) => void,
  version: number,
  origin: string[] = []
): void {
  if (!tree) {
    return;
  }

  const legacyPaths = enableLegacyPaths(version);
  if (!isArray(tree)) {
    forEach(tree, (subtree, key) =>
      traverse(subtree, walker, version, [
        ...origin,
        ...parsePath(key, legacyPaths),
      ])
    );
    return;
  }

  const [nodeValue, children] = tree;
  if (children) {
    forEach(children, (child, key) => {
      traverse(child, walker, version, [
        ...origin,
        ...parsePath(key, legacyPaths),
      ]);
    });
  }

  walker(nodeValue, origin);
}

export function applyValueAnnotations(
  plain: any,
  annotations: MinimisedTree<TypeAnnotation>,
  version: number,
  superJson: SuperJSON
) {
  traverse(
    annotations,
    (type, path) => {
      plain = setDeep(plain, path, v => untransformValue(v, type, superJson));
    },
    version
  );

  return plain;
}

export function applyReferentialEqualityAnnotations(
  plain: any,
  annotations: ReferentialEqualityAnnotations,
  version: number
) {
  const legacyPaths = enableLegacyPaths(version);
  function apply(identicalPaths: string[], path: string) {
    const object = getDeep(plain, parsePath(path, legacyPaths));

    identicalPaths
      .map(path => parsePath(path, legacyPaths))
      .forEach(identicalObjectPath => {
        plain = setDeep(plain, identicalObjectPath, () => object);
      });
  }

  if (isArray(annotations)) {
    const [root, other] = annotations;
    root.forEach(identicalPath => {
      plain = setDeep(
        plain,
        parsePath(identicalPath, legacyPaths),
        () => plain
      );
    });

    if (other) {
      forEach(other, apply);
    }
  } else {
    forEach(annotations, apply);
  }

  return plain;
}

const isDeep = (object: any, superJson: SuperJSON): boolean =>
  isPlainObject(object) ||
  isArray(object) ||
  isMap(object) ||
  isSet(object) ||
  isError(object) ||
  isInstanceOfRegisteredClass(object, superJson);

interface Result {
  transformedValue: any;
  annotations?: MinimisedTree<TypeAnnotation>;
}

export type ReferentialEqualityAnnotations =
  | Record<string, string[]>
  | [string[]]
  | [string[], Record<string, string[]>];

export function generateReferentialEqualityAnnotations(
  identitites: Map<any, any[][]>,
  dedupe: boolean
): ReferentialEqualityAnnotations | undefined {
  const result: Record<string, string[]> = {};
  let rootEqualityPaths: string[] | undefined = undefined;

  identitites.forEach(paths => {
    if (paths.length <= 1) {
      return;
    }

    // if we're not deduping, all of these objects continue existing.
    // putting the shortest path first makes it easier to parse for humans
    // if we're deduping though, only the first entry will still exist, so we can't do this optimisation.
    if (!dedupe) {
      paths = paths
        .map(path => path.map(String))
        .sort((a, b) => a.length - b.length);
    }

    const [representativePath, ...identicalPaths] = paths;

    if (representativePath.length === 0) {
      rootEqualityPaths = identicalPaths.map(stringifyPath);
    } else {
      result[stringifyPath(representativePath)] = identicalPaths.map(
        stringifyPath
      );
    }
  });

  if (rootEqualityPaths) {
    if (isEmptyObject(result)) {
      return [rootEqualityPaths];
    } else {
      return [rootEqualityPaths, result];
    }
  } else {
    return isEmptyObject(result) ? undefined : result;
  }
}

class PathNode {
  /** `key` is null only for the root. */
  constructor(readonly parent: PathNode | null, readonly key: string | null) {}
}

/** The first visit of a non-primitive, which is also the path node of its children. */
class Seen extends PathNode {
  more: PathNode[] | undefined = undefined;
  done = false;
  value: any = undefined;
  annotations: Annotations = undefined;
}

const toPath = (node: PathNode | null): string[] => {
  const path: string[] = [];
  for (; node; node = node.parent) {
    if (node.key !== null) {
      path.push(node.key);
    }
  }

  return path.reverse();
};

const pathsOf = (seen: Seen): string[][] => {
  const paths = [toPath(seen)];
  seen.more?.forEach(node => paths.push(toPath(node)));

  return paths;
};

/**
 * The annotation record of a plain container, built lazily so each flattened key is joined once.
 * Keys are kept as an object would order them: array indices ascending, then insertion order.
 */
class PendingAnnotations {
  /** Pairs: escaped array-index key, tree. */
  readonly indices: any[] = [];
  /** Pairs: escaped key and tree, or `key.` prefix and a nested PendingAnnotations. */
  readonly rest: any[] = [];
}

const isArrayIndex = (key: string): boolean => {
  const length = key.length;
  if (length === 0 || length > 10) {
    return false;
  }

  for (let i = 0; i < length; i++) {
    const code = key.charCodeAt(i);
    if (code < 48 || code > 57) {
      return false;
    }
  }

  if (key.charCodeAt(0) === 48) {
    return length === 1;
  }

  return length < 10 || +key < 4294967295;
};

function materialize(
  pending: PendingAnnotations,
  prefix: string,
  out: Record<string, Tree<TypeAnnotation>>
): Record<string, Tree<TypeAnnotation>> {
  const { indices, rest } = pending;
  for (let i = 0; i < indices.length; i += 2) {
    out[prefix + indices[i]] = indices[i + 1];
  }

  for (let i = 0; i < rest.length; i += 2) {
    const value = rest[i + 1];
    if (value instanceof PendingAnnotations) {
      materialize(value, prefix + rest[i], out);
    } else {
      out[prefix + rest[i]] = value;
    }
  }

  return out;
}

const toRecord = (
  annotations: Annotations
): MinimisedTree<TypeAnnotation> =>
  annotations instanceof PendingAnnotations
    ? materialize(annotations, '', {})
    : annotations;

type Annotations = Tree<TypeAnnotation> | PendingAnnotations | undefined;

interface WalkContext {
  superJson: SuperJSON;
  dedupe: boolean;
  /** Every non-primitive in visiting order. `done` is false while its walk is still running. */
  seen: Map<unknown, Seen>;
  /** Annotations of the value the last `walk` call returned. */
  annotations: Annotations;
}

// No built-in rule (Date, Map, typed array...) can match an object with one of these prototypes.
const isPlainContainer = (object: any): boolean =>
  isPlainObject(object) ||
  (isArray(object) && Object.getPrototypeOf(object) === Array.prototype);

function walk(
  object: any,
  ctx: WalkContext,
  parent: PathNode | null,
  key: string | null
): any {
  const primitive = isPrimitive(object);
  let seen: Seen | undefined;

  if (!primitive) {
    seen = ctx.seen.get(object);
    if (seen) {
      (seen.more ??= []).push(new PathNode(parent, key));
      if (seen.done) {
        if (ctx.dedupe) {
          ctx.annotations = undefined;
          return null;
        }

        ctx.annotations = seen.annotations;
        return seen.value;
      }

      ctx.annotations = undefined;
      return isDeep(object, ctx.superJson)
        ? null
        : leaf(object, ctx, seen);
    }

    seen = new Seen(parent, key);
    ctx.seen.set(object, seen);
    parent = seen;
  }

  const plainContainer = !primitive && isPlainContainer(object);
  if (!plainContainer && !isDeep(object, ctx.superJson)) {
    return leaf(object, ctx, seen);
  }

  if (primitive && key !== null) {
    parent = new PathNode(parent, key);
  }

  const transformationResult = plainContainer
    ? transformRegisteredValue(object, ctx.superJson)
    : transformValue(object, ctx.superJson);
  const transformed = transformationResult?.value ?? object;

  const transformedValue: any = isArray(transformed) ? [] : {};
  let inner: PendingAnnotations | undefined;

  const keys = Object.keys(transformed);
  for (let i = 0; i < keys.length; i++) {
    const index = keys[i];
    if (
      index === '__proto__' ||
      index === 'constructor' ||
      index === 'prototype'
    ) {
      throw new Error(
        `Detected property ${index}. This is a prototype pollution risk, please remove it from your object.`
      );
    }

    transformedValue[index] = walk(transformed[index], ctx, parent, index);

    const childAnnotations = ctx.annotations;
    if (childAnnotations !== undefined) {
      inner ??= new PendingAnnotations();
      const escaped = escapeKey(index);
      if (childAnnotations instanceof PendingAnnotations) {
        inner.rest.push(escaped + '.', childAnnotations);
      } else if (isArrayIndex(escaped)) {
        inner.indices.push(escaped, childAnnotations);
      } else {
        inner.rest.push(escaped, childAnnotations);
      }
    }
  }

  const annotations: Annotations = inner
    ? transformationResult
      ? [transformationResult.type, materialize(inner, '', {})]
      : inner
    : transformationResult
    ? [transformationResult.type]
    : undefined;

  return finish(ctx, seen, transformedValue, annotations);
}

function leaf(object: any, ctx: WalkContext, seen: Seen | undefined) {
  const transformed = transformValue(object, ctx.superJson);

  return transformed
    ? finish(ctx, seen, transformed.value, [transformed.type])
    : finish(ctx, seen, object, undefined);
}

function finish(
  ctx: WalkContext,
  seen: Seen | undefined,
  value: any,
  annotations: Annotations
) {
  if (seen) {
    seen.done = true;
    seen.value = value;
    seen.annotations = annotations;
  }

  ctx.annotations = annotations;
  return value;
}

export function walkRoot(
  object: any,
  superJson: SuperJSON,
  dedupe: boolean
): Result & { identities: Map<any, any[][]> } {
  const ctx: WalkContext = {
    superJson,
    dedupe,
    seen: new Map(),
    annotations: undefined,
  };
  const transformedValue = walk(object, ctx, null, null);

  const identities = new Map<any, any[][]>();
  ctx.seen.forEach((seen, value) => {
    if (seen.more) {
      identities.set(value, pathsOf(seen));
    }
  });

  return {
    transformedValue,
    annotations: toRecord(ctx.annotations),
    identities,
  };
}

export const walker = (
  object: any,
  identities: Map<any, any[][]>,
  superJson: SuperJSON,
  dedupe: boolean
): Result => {
  const result = walkRoot(object, superJson, dedupe);
  result.identities.forEach((paths, value) => identities.set(value, paths));

  return {
    transformedValue: result.transformedValue,
    annotations: result.annotations,
  };
};
