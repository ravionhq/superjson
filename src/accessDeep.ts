import { isMap, isArray, isPlainObject, isSet } from './is.js';
import { includes } from './util.js';

type Collection = Set<any> | Map<any, any>;

// A custom transformer may write a Set or Map in any shape, so its JSON counts only when it lists
// the members themselves.
const listsMembers = (collection: Collection, json: any[]) =>
  json.every(
    isSet(collection)
      ? element => collection.has(element)
      : entry => isArray(entry) && collection.has(entry[0])
  );

export class IndexedCollections {
  private elements?: Map<Collection, any[]>;
  private written?: Set<Collection>;

  // Equal elements collapse when the Set or Map is built, so only the JSON array still has every
  // index.
  register(collection: Collection, json: unknown, custom: boolean) {
    if (
      isArray(json) &&
      json.length > collection.size &&
      (!custom || listsMembers(collection, json))
    ) {
      (this.elements ??= new Map()).set(collection, json);
    }
  }

  // Without this, every Set or Map that a later annotation replaces stays referenced until
  // `rebuild`.
  flush(collection: Collection) {
    const elements = this.elements?.get(collection);
    if (elements) {
      if (this.written?.delete(collection)) {
        fill(collection, elements);
      }

      this.elements!.delete(collection);
    }
  }

  elementsOf(collection: Collection): any[] {
    const known = (this.elements ??= new Map());
    let elements = known.get(collection);
    if (!elements) {
      elements = isSet(collection)
        ? [...collection.values()]
        : [...collection.entries()];
      known.set(collection, elements);
    }

    return elements;
  }

  // Replacing one element of a Set or Map in place costs a pass over all of them, so a write
  // stays in the element array until `rebuild`.
  markWritten(collection: Collection) {
    (this.written ??= new Set()).add(collection);
  }

  isWritten(collection: Collection): boolean {
    return !!this.written?.has(collection);
  }

  rebuild() {
    this.written?.forEach(collection =>
      fill(collection, this.elements!.get(collection)!)
    );
  }
}

const fill = (collection: Collection, elements: any[]) => {
  collection.clear();
  if (isSet(collection)) {
    elements.forEach(value => collection.add(value));
  } else {
    elements.forEach(entry => collection.set(entry[0], entry[1]));
  }
};

// Lands where stepping an iterator `n` times did: NaN and negatives on the first element, a
// fraction on the next whole index, the size itself on nothing.
const getNth = (elements: any[], n: number): any => {
  if (n > elements.length) throw new Error('index out of bounds');
  return elements[n > 0 ? Math.ceil(n) : 0];
};

function validatePath(path: (string | number)[]) {
  let suspicious = false;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      suspicious = true;
      break;
    }
  }

  if (!suspicious) {
    return;
  }

  if (includes(path, '__proto__')) {
    throw new Error('__proto__ is not allowed as a property');
  }
  if (includes(path, 'prototype')) {
    throw new Error('prototype is not allowed as a property');
  }
  if (includes(path, 'constructor')) {
    throw new Error('constructor is not allowed as a property');
  }
}

export const getDeep = (
  object: object,
  path: (string | number)[],
  collections: IndexedCollections
): object => {
  validatePath(path);

  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (isSet(object)) {
      object = getNth(collections.elementsOf(object), +key);
    } else if (isMap(object)) {
      const row = +key;
      const type = +path[++i] === 0 ? 'key' : 'value';

      const entry = getNth(collections.elementsOf(object), row);
      switch (type) {
        case 'key':
          object = entry?.[0];
          break;
        case 'value':
          object = entry?.[1];
          break;
      }
    } else {
      object = (object as any)[key];
    }
  }

  return object;
};

export const setDeep = (
  object: any,
  path: (string | number)[],
  mapper: (v: any) => any,
  collections: IndexedCollections
): any => {
  validatePath(path);

  if (path.length === 0) {
    return mapper(object);
  }

  let parent = object;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];

    if (isArray(parent)) {
      const index = +key;
      parent = parent[index];
    } else if (isPlainObject(parent)) {
      parent = parent[key];
    } else if (isSet(parent)) {
      const row = +key;
      parent = getNth(collections.elementsOf(parent), row);
    } else if (isMap(parent)) {
      const isEnd = i === path.length - 2;
      if (isEnd) {
        break;
      }

      const row = +key;
      const type = +path[++i] === 0 ? 'key' : 'value';

      const entry = getNth(collections.elementsOf(parent), row);
      switch (type) {
        case 'key':
          parent = entry?.[0];
          break;
        case 'value':
          parent = entry?.[1];
          break;
      }
    }
  }

  const lastKey = path[path.length - 1];

  if (isArray(parent)) {
    parent[+lastKey] = mapper(parent[+lastKey]);
  } else if (isPlainObject(parent)) {
    parent[lastKey] = mapper(parent[lastKey]);
  }

  if (isSet(parent)) {
    const index = +lastKey;
    const values = collections.elementsOf(parent);
    const oldValue = getNth(values, index);
    const newValue = mapper(oldValue);
    if (oldValue !== newValue) {
      values[index] = newValue;
      collections.markWritten(parent);
    }
  }

  if (isMap(parent)) {
    const row = +path[path.length - 2];
    const entries = collections.elementsOf(parent);
    const entry = getNth(entries, row);
    const keyToRow = entry?.[0];

    const type = +lastKey === 0 ? 'key' : 'value';
    switch (type) {
      case 'key': {
        const newKey = mapper(keyToRow);
        if (newKey !== keyToRow && entry) {
          entry[0] = newKey;
          collections.markWritten(parent);
        }
        break;
      }

      case 'value': {
        const value = mapper(entry?.[1]);
        if (entry) {
          entry[1] = value;
        } else {
          entries.push([keyToRow, value]);
        }

        // A Map with no rebuild pending still matches its entries, so the value goes straight in.
        if (!collections.isWritten(parent)) {
          parent.set(keyToRow, value);
        }
        break;
      }
    }
  }

  return object;
};
