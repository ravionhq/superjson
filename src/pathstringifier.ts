export type StringifiedPath = string;
type Path = string[];

export const escapeKey = (key: string) =>
  key.indexOf('\\') === -1 && key.indexOf('.') === -1
    ? key
    : key.replace(/\\/g, '\\\\').replace(/\./g, '\\.');

export const stringifyPath = (path: Path): StringifiedPath =>
  path
    .map(String)
    .map(escapeKey)
    .join('.');

// V8's String.prototype.split is several times slower than this on short keys.
const splitOnDots = (string: string): string[] => {
  const result: string[] = [];
  let start = 0;
  for (;;) {
    const dot = string.indexOf('.', start);
    if (dot === -1) {
      result.push(start === 0 ? string : string.slice(start));
      return result;
    }

    result.push(string.slice(start, dot));
    start = dot + 1;
  }
};

export const parsePath = (string: StringifiedPath, legacyPaths: boolean) => {
  if (typeof string === 'string' && string.indexOf('\\') === -1) {
    return splitOnDots(string);
  }

  const result: string[] = [];

  let segment = '';
  for (let i = 0; i < string.length; i++) {
    let char = string.charAt(i);

    if (!legacyPaths && char === '\\') {
      const escaped = string.charAt(i + 1);
      if (escaped === '\\') {
        segment += '\\';
        i++;
        continue;
      } else if (escaped !== '.') {
        throw Error('invalid path');
      }
    }

    const isEscapedDot = char === '\\' && string.charAt(i + 1) === '.';
    if (isEscapedDot) {
      segment += '.';
      i++;
      continue;
    }

    const isEndOfSegment = char === '.';
    if (isEndOfSegment) {
      result.push(segment);
      segment = '';
      continue;
    }

    segment += char;
  }

  const lastSegment = segment;
  result.push(lastSegment);

  return result;
};
