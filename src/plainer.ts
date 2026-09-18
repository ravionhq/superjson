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
  transformValue,
  TypeAnnotation,
  untransformValue,
} from './transformer.js';
import { includes } from './util.js';
import { parsePath } from './pathstringifier.js';
import { getDeep, setDeep } from './accessDeep.js';
import { getDeepAsync, setDeepAsync } from './accessDeep.js';
import { AsyncYieldController } from './async.js';
import SuperJSON from './index.js';

type Tree<T> = InnerNode<T> | Leaf<T>;
type Leaf<T> = [T];
type InnerNode<T> = [T, Record<string, Tree<T>>];

export type MinimisedTree<T> = Tree<T> | Record<string, Tree<T>> | undefined;

const enableLegacyPaths = (version: number) => version < 1;

function* traverseGenerator<T>(
  tree: MinimisedTree<T>,
  version: number,
  origin: string[] = []
): Generator<readonly [T, string[]], void, void> {
  if (!tree) {
    return;
  }

  const legacyPaths = enableLegacyPaths(version);
  if (!isArray(tree)) {
    for (const [key, subtree] of Object.entries(tree)) {
      yield* traverseGenerator(subtree, version, [
        ...origin,
        ...parsePath(key, legacyPaths),
      ]);
    }
    return;
  }

  const [nodeValue, children] = tree;
  if (children) {
    for (const [key, child] of Object.entries(children)) {
      yield* traverseGenerator(child, version, [
        ...origin,
        ...parsePath(key, legacyPaths),
      ]);
    }
  }

  yield [nodeValue, origin];
}

function traverse<T>(
  tree: MinimisedTree<T>,
  walker: (v: T, path: string[]) => void,
  version: number,
  origin: string[] = []
): void {
  for (const [value, path] of traverseGenerator(tree, version, origin)) {
    walker(value, path);
  }
}

async function traverseAsync<T>(
  tree: MinimisedTree<T>,
  walker: (v: T, path: string[]) => Promise<void>,
  version: number,
  scheduler: AsyncYieldController,
  origin: string[] = []
): Promise<void> {
  for (const [value, path] of traverseGenerator(tree, version, origin)) {
    await scheduler.tick();
    await walker(value, path);
  }
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

export async function applyValueAnnotationsAsync(
  plain: any,
  annotations: MinimisedTree<TypeAnnotation>,
  version: number,
  superJson: SuperJSON,
  scheduler: AsyncYieldController
) {
  await traverseAsync(
    annotations,
    async (type, path) => {
      plain = await setDeepAsync(
        plain,
        path,
        v => untransformValue(v, type, superJson),
        scheduler
      );
    },
    version,
    scheduler
  );

  return plain;
}

interface ReferentialEqualityGroup {
  sourcePath?: string;
  targetPaths: string[];
}

function* referentialEqualityGroups(
  annotations: ReferentialEqualityAnnotations
): Generator<ReferentialEqualityGroup, void, void> {
  if (isArray(annotations)) {
    const [root, other] = annotations;
    for (const targetPath of root) {
      yield { targetPaths: [targetPath] };
    }

    if (other) {
      for (const [sourcePath, targetPaths] of Object.entries(other)) {
        yield { sourcePath, targetPaths };
      }
    }
  } else {
    for (const [sourcePath, targetPaths] of Object.entries(annotations)) {
      yield { sourcePath, targetPaths };
    }
  }
}

export function applyReferentialEqualityAnnotations(
  plain: any,
  annotations: ReferentialEqualityAnnotations,
  version: number
) {
  const legacyPaths = enableLegacyPaths(version);
  for (const { sourcePath, targetPaths } of referentialEqualityGroups(
    annotations
  )) {
    const object = sourcePath
      ? getDeep(plain, parsePath(sourcePath, legacyPaths))
      : undefined;

    for (const targetPath of targetPaths) {
      plain = setDeep(
        plain,
        parsePath(targetPath, legacyPaths),
        () => (sourcePath ? object : plain)
      );
    }
  }

  return plain;
}

export async function applyReferentialEqualityAnnotationsAsync(
  plain: any,
  annotations: ReferentialEqualityAnnotations,
  version: number,
  scheduler: AsyncYieldController
) {
  const legacyPaths = enableLegacyPaths(version);
  for (const { sourcePath, targetPaths } of referentialEqualityGroups(
    annotations
  )) {
    await scheduler.tick();
    const object = sourcePath
      ? await getDeepAsync(
          plain,
          parsePath(sourcePath, legacyPaths),
          scheduler
        )
      : undefined;

    for (const targetPath of targetPaths) {
      await scheduler.tick();
      plain = await setDeepAsync(
        plain,
        parsePath(targetPath, legacyPaths),
        () => (sourcePath ? object : plain),
        scheduler
      );
    }
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

function addIdentity(object: any, path: any[], identities: Map<any, any[][]>) {
  const existingSet = identities.get(object);

  if (existingSet) {
    existingSet.push(path);
  } else {
    identities.set(object, [path]);
  }
}

interface Result {
  transformedValue: any;
  annotations?: MinimisedTree<TypeAnnotation>;
}

export type ReferentialEqualityAnnotations =
  | Record<string, string[]>
  | [string[]]
  | [string[], Record<string, string[]>];

function* generateReferentialEqualityAnnotationsGenerator(
  identitites: Map<any, any[][]>,
  dedupe: boolean
): Generator<void, ReferentialEqualityAnnotations | undefined, void> {
  const result: Record<string, string[]> = {};
  let rootEqualityPaths: string[] | undefined = undefined;

  for (const pathsInMap of identitites.values()) {
    yield;
    let paths = pathsInMap;
    if (paths.length <= 1) {
      continue;
    }

    // if we're not deduping, all of these objects continue existing.
    // putting the shortest path first makes it easier to parse for humans
    // if we're deduping though, only the first entry will still exist, so we can't do this optimisation.
    if (!dedupe) {
      const stringifiedPaths: string[][] = [];
      for (const path of paths) {
        yield;
        stringifiedPaths.push(path.map(String));
      }
      paths = stringifiedPaths.sort((a, b) => a.length - b.length);
    }

    const [representativePath, ...identicalPaths] = paths;

    if (representativePath.length === 0) {
      rootEqualityPaths = [];
      for (const path of identicalPaths) {
        yield;
        rootEqualityPaths.push(stringifyPath(path.map(String)));
      }
    } else {
      const stringifiedIdenticalPaths: string[] = [];
      for (const path of identicalPaths) {
        yield;
        stringifiedIdenticalPaths.push(stringifyPath(path.map(String)));
      }
      result[stringifyPath(representativePath.map(String))] =
        stringifiedIdenticalPaths;
    }
  }

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

export function generateReferentialEqualityAnnotations(
  identitites: Map<any, any[][]>,
  dedupe: boolean
): ReferentialEqualityAnnotations | undefined {
  const iterator = generateReferentialEqualityAnnotationsGenerator(
    identitites,
    dedupe
  );
  let result = iterator.next();
  while (!result.done) {
    result = iterator.next();
  }
  return result.value;
}

export async function generateReferentialEqualityAnnotationsAsync(
  identitites: Map<any, any[][]>,
  dedupe: boolean,
  scheduler: AsyncYieldController
): Promise<ReferentialEqualityAnnotations | undefined> {
  const iterator = generateReferentialEqualityAnnotationsGenerator(
    identitites,
    dedupe
  );
  let result = iterator.next();
  while (!result.done) {
    await scheduler.tick();
    result = iterator.next();
  }
  return result.value;
}

function* walkerGenerator(
  object: any,
  identities: Map<any, any[][]>,
  superJson: SuperJSON,
  dedupe: boolean,
  path: any[] = [],
  objectsInThisPath: any[] = [],
  seenObjects = new Map<unknown, Result>()
): Generator<void, Result, void> {
  yield;
  const primitive = isPrimitive(object);

  if (!primitive) {
    addIdentity(object, path, identities);

    const seen = seenObjects.get(object);
    if (seen) {
      // short-circuit result if we've seen this object before
      return dedupe
        ? {
            transformedValue: null,
          }
        : seen;
    }
  }

  if (!isDeep(object, superJson)) {
    const transformed = transformValue(object, superJson);

    const result: Result = transformed
      ? {
          transformedValue: transformed.value,
          annotations: [transformed.type],
        }
      : {
          transformedValue: object,
        };
    if (!primitive) {
      seenObjects.set(object, result);
    }
    return result;
  }

  if (includes(objectsInThisPath, object)) {
    // prevent circular references
    return {
      transformedValue: null,
    };
  }

  const transformationResult = transformValue(object, superJson);
  const transformed = transformationResult?.value ?? object;

  const transformedValue: any = isArray(transformed) ? [] : {};
  const innerAnnotations: Record<string, Tree<TypeAnnotation>> = {};

  for (const [index, value] of Object.entries(transformed)) {
    if (
      index === '__proto__' ||
      index === 'constructor' ||
      index === 'prototype'
    ) {
      throw new Error(
        `Detected property ${index}. This is a prototype pollution risk, please remove it from your object.`
      );
    }

    const recursiveResult = yield* walkerGenerator(
      value,
      identities,
      superJson,
      dedupe,
      [...path, index],
      [...objectsInThisPath, object],
      seenObjects
    );

    transformedValue[index] = recursiveResult.transformedValue;

    if (isArray(recursiveResult.annotations)) {
      innerAnnotations[escapeKey(index)] = recursiveResult.annotations;
    } else if (isPlainObject(recursiveResult.annotations)) {
      for (const [key, tree] of Object.entries(recursiveResult.annotations)) {
        innerAnnotations[escapeKey(index) + '.' + key] = tree;
      }
    }
  }

  const result: Result = isEmptyObject(innerAnnotations)
    ? {
        transformedValue,
        annotations: !!transformationResult
          ? [transformationResult.type]
          : undefined,
      }
    : {
        transformedValue,
        annotations: !!transformationResult
          ? [transformationResult.type, innerAnnotations]
          : innerAnnotations,
      };
  if (!primitive) {
    seenObjects.set(object, result);
  }

  return result;
}

export const walker = (
  object: any,
  identities: Map<any, any[][]>,
  superJson: SuperJSON,
  dedupe: boolean,
  path: any[] = [],
  objectsInThisPath: any[] = [],
  seenObjects = new Map<unknown, Result>()
): Result => {
  const iterator = walkerGenerator(
    object,
    identities,
    superJson,
    dedupe,
    path,
    objectsInThisPath,
    seenObjects
  );
  let result = iterator.next();
  while (!result.done) {
    result = iterator.next();
  }
  return result.value;
};

export const asyncWalker = async (
  object: any,
  identities: Map<any, any[][]>,
  superJson: SuperJSON,
  dedupe: boolean,
  scheduler: AsyncYieldController,
  path: any[] = [],
  objectsInThisPath: any[] = [],
  seenObjects = new Map<unknown, Result>()
): Promise<Result> => {
  const iterator = walkerGenerator(
    object,
    identities,
    superJson,
    dedupe,
    path,
    objectsInThisPath,
    seenObjects
  );
  let result = iterator.next();
  while (!result.done) {
    await scheduler.tick();
    result = iterator.next();
  }
  return result.value;
};
