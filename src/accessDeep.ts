import { isMap, isArray, isPlainObject, isSet } from './is.js';
import { includes } from './util.js';

type Collection = Set<any> | Map<any, any>;

interface Index {
  rows: any[];
  order: any[];
  valuesInRows: boolean;
}

// A position counts along `keys()` and a rebuild follows the iterator, so a subclass that orders
// `keys()` its own way gets a list for each.
const toIndex = (collection: Collection): Index => {
  const order: any[] = [...collection];
  const keys = [...collection.keys()];
  const set = isSet(collection);
  if (
    keys.length === order.length &&
    keys.every((key, i) => Object.is(key, set ? order[i] : order[i]?.[0]))
  ) {
    return { rows: order, order, valuesInRows: false };
  }

  if (set) {
    return { rows: keys, order, valuesInRows: false };
  }

  const entries = new Map(order.map(entry => [entry?.[0], entry]));
  return {
    rows: keys.map(key => entries.get(key) ?? [key]),
    order,
    valuesInRows: false,
  };
};

// A custom transformer may write a Set or Map in any shape, so its JSON counts only when it lists
// the members themselves.
const listsMembers = (collection: Collection, json: any[]) =>
  json.every(
    isSet(collection)
      ? element => collection.has(element)
      : entry => isArray(entry) && collection.has(entry[0])
  );

export class IndexedCollections {
  private indexes?: Map<Collection, Index>;
  private written?: Set<Collection>;

  // Equal elements collapse when the Set or Map is built, so only the JSON array still has every
  // index.
  register(collection: Collection, json: unknown, custom: boolean) {
    if (
      isArray(json) &&
      json.length > collection.size &&
      (!custom || listsMembers(collection, json))
    ) {
      (this.indexes ??= new Map()).set(collection, {
        rows: json,
        order: json,
        valuesInRows: true,
      });
    }
  }

  // Without this, every Set or Map that a later annotation replaces stays referenced until
  // `rebuild`.
  flush(collection: Collection) {
    const index = this.indexes?.get(collection);
    if (index) {
      if (this.written?.delete(collection)) {
        fill(collection, index.order);
      }

      this.indexes!.delete(collection);
    }
  }

  indexFor(collection: Collection): Index {
    const known = (this.indexes ??= new Map());
    let index = known.get(collection);
    if (!index) {
      index = toIndex(collection);
      known.set(collection, index);
    }

    return index;
  }

  // Replacing one element of a Set or Map in place costs a pass over all of them, so a write
  // stays in the index until `rebuild`.
  markWritten(collection: Collection, index: Index) {
    if (index.rows !== index.order) {
      // Only the subclass knows its `keys()` order after a write, so this rebuilds at once, at the
      // cost of a pass per write.
      fill(collection, index.order);
      this.indexes!.delete(collection);
      return;
    }

    // A flush inside the mapper drops this index, so it is registered again.
    this.indexes!.set(collection, index);
    index.valuesInRows = true;
    (this.written ??= new Set()).add(collection);
  }

  isWritten(collection: Collection): boolean {
    return !!this.written?.has(collection);
  }

  rebuild() {
    this.written?.forEach(collection =>
      fill(collection, this.indexes!.get(collection)!.order)
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

// A subclass may answer `get` with something other than what it stores, so a Map that still
// matches its rows is asked directly.
const valueAt = (map: Map<any, any>, index: Index, entry: any) =>
  index.valuesInRows ? entry?.[1] : map.get(entry?.[0]);

// Lands where stepping an iterator `n` times did: NaN and negatives on the first element, a
// fraction on the next whole index, the size itself on nothing.
const getNth = ({ rows, order }: Index, n: number): any => {
  if (n > Math.max(rows.length, order.length)) {
    throw new Error('index out of bounds');
  }

  return rows[n > 0 ? Math.ceil(n) : 0];
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
      object = getNth(collections.indexFor(object), +key);
    } else if (isMap(object)) {
      const row = +key;
      const type = +path[++i] === 0 ? 'key' : 'value';

      const index = collections.indexFor(object);
      const entry = getNth(index, row);
      switch (type) {
        case 'key':
          object = entry?.[0];
          break;
        case 'value':
          object = valueAt(object, index, entry);
          break;
      }
    } else {
      object = (object as any)[key];
    }
  }

  return object;
};

type Path = (string | number)[];

// Leaves the segments a write needs: the last key, or a Map's row and selector.
const walk = (
  parent: any,
  path: Path,
  collections: IndexedCollections
): [any, number] => {
  let i = 0;
  for (; i < path.length - 1; i++) {
    const key = path[i];

    if (isArray(parent)) {
      const index = +key;
      parent = parent[index];
    } else if (isPlainObject(parent)) {
      parent = parent[key];
    } else if (isSet(parent)) {
      const row = +key;
      parent = getNth(collections.indexFor(parent), row);
    } else if (isMap(parent)) {
      const isEnd = i === path.length - 2;
      if (isEnd) {
        break;
      }

      const row = +key;
      const type = +path[++i] === 0 ? 'key' : 'value';

      const index = collections.indexFor(parent);
      const entry = getNth(index, row);
      switch (type) {
        case 'key':
          parent = entry?.[0];
          break;
        case 'value':
          parent = valueAt(parent, index, entry);
          break;
      }
    }
  }

  return [parent, i];
};

export const walkDeep = (
  object: any,
  path: Path,
  collections: IndexedCollections
): [any, Path] => {
  validatePath(path);

  const [parent, rest] = walk(object, path, collections);
  return [parent, path.slice(rest)];
};

export const setDeep = (
  object: any,
  path: Path,
  mapper: (v: any) => any,
  collections: IndexedCollections
): any => {
  validatePath(path);

  if (path.length === 0) {
    return mapper(object);
  }

  const [parent] = walk(object, path, collections);

  const lastKey = path[path.length - 1];

  if (isArray(parent)) {
    parent[+lastKey] = mapper(parent[+lastKey]);
  } else if (isPlainObject(parent)) {
    parent[lastKey] = mapper(parent[lastKey]);
  }

  if (isSet(parent)) {
    const position = +lastKey;
    const index = collections.indexFor(parent);
    const oldValue = getNth(index, position);
    const newValue = mapper(oldValue);
    if (oldValue !== newValue) {
      index.order[position] = newValue;
      collections.markWritten(parent, index);
    }
  }

  if (isMap(parent)) {
    const row = +path[path.length - 2];
    const index = collections.indexFor(parent);
    const entry = getNth(index, row);
    const keyToRow = entry?.[0];

    const type = +lastKey === 0 ? 'key' : 'value';
    switch (type) {
      case 'key': {
        const newKey = mapper(keyToRow);
        if (newKey !== keyToRow && entry) {
          // `serialize` lists every NaN as one shared value, so a NaN key keeps its place.
          if (keyToRow === keyToRow) {
            entry[0] = newKey;
          }

          collections.markWritten(parent, index);
        }
        break;
      }

      case 'value': {
        const value = mapper(valueAt(parent, index, entry));
        if (entry) {
          entry[1] = value;
        } else {
          index.order.push([keyToRow, value]);
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
