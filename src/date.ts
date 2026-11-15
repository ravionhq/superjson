const pad2 = (n: number) => (n < 10 ? '0' + n : '' + n);
const pad3 = (n: number) => (n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n);

// Same output as Date#toISOString, which is several times slower in V8.
export function toISOString(date: Date): string {
  const year = date.getUTCFullYear();
  if (year < 1000 || year > 9999) {
    return date.toISOString();
  }

  return (
    year +
    '-' +
    pad2(date.getUTCMonth() + 1) +
    '-' +
    pad2(date.getUTCDate()) +
    'T' +
    pad2(date.getUTCHours()) +
    ':' +
    pad2(date.getUTCMinutes()) +
    ':' +
    pad2(date.getUTCSeconds()) +
    '.' +
    pad3(date.getUTCMilliseconds()) +
    'Z'
  );
}

const digits = (s: string, from: number, count: number): number => {
  let n = 0;
  for (let i = from; i < from + count; i++) {
    const d = s.charCodeAt(i) - 48;
    if (d < 0 || d > 9) {
      return -1;
    }

    n = n * 10 + d;
  }

  return n;
};

// Same result as `new Date(value)`. Only the exact toISOString shape with in-range fields takes the
// fast path; everything else goes to the native parser.
export function parseISOString(value: string): Date {
  if (
    typeof value === 'string' &&
    value.length === 24 &&
    value.charCodeAt(4) === 45 &&
    value.charCodeAt(7) === 45 &&
    value.charCodeAt(10) === 84 &&
    value.charCodeAt(13) === 58 &&
    value.charCodeAt(16) === 58 &&
    value.charCodeAt(19) === 46 &&
    value.charCodeAt(23) === 90
  ) {
    const year = digits(value, 0, 4);
    const month = digits(value, 5, 2);
    const day = digits(value, 8, 2);
    const hours = digits(value, 11, 2);
    const minutes = digits(value, 14, 2);
    const seconds = digits(value, 17, 2);
    const ms = digits(value, 20, 3);
    if (
      year >= 1000 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59 &&
      seconds >= 0 &&
      seconds <= 59 &&
      ms >= 0
    ) {
      const date = new Date(
        Date.UTC(year, month - 1, day, hours, minutes, seconds, ms)
      );
      if (date.getUTCDate() === day) {
        return date;
      }
    }
  }

  return new Date(value);
}
