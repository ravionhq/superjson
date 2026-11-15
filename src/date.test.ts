import { parseISOString, toISOString } from './date.js';

import { expect, test } from 'vitest';

const sameTime = (a: Date, b: Date) =>
  Object.is(a.getTime(), b.getTime());

test('toISOString matches Date#toISOString', () => {
  const times = [
    0,
    -1,
    Date.UTC(999, 11, 31, 23, 59, 59, 999),
    Date.UTC(1000, 0, 1),
    Date.UTC(2024, 1, 29, 12, 5, 9, 7),
    Date.UTC(9999, 11, 31, 23, 59, 59, 999),
    Date.UTC(10000, 0, 1),
    -62198755200000,
    8.64e15,
    -8.64e15,
  ];
  for (let i = 0; i < 20000; i++) {
    times.push(Math.floor((Math.random() - 0.4) * 4e14));
  }

  for (const time of times) {
    const date = new Date(time);
    expect(toISOString(date)).toBe(date.toISOString());
  }
});

test('parseISOString matches new Date(string)', () => {
  const inputs = [
    '2024-02-29T12:00:00.000Z',
    '2023-02-29T12:00:00.000Z',
    '2023-04-31T00:00:00.000Z',
    '2023-00-10T00:00:00.000Z',
    '2023-13-10T00:00:00.000Z',
    '2023-01-00T00:00:00.000Z',
    '2023-01-32T00:00:00.000Z',
    '2023-01-01T24:00:00.000Z',
    '2023-01-01T23:60:00.000Z',
    '2023-01-01T23:59:60.000Z',
    '0099-01-01T00:00:00.000Z',
    '0999-12-31T23:59:59.999Z',
    '1000-01-01T00:00:00.000Z',
    '9999-12-31T23:59:59.999Z',
    '+010000-01-01T00:00:00.000Z',
    '-000001-01-01T00:00:00.000Z',
    '2023-01-01T00:00:00.000+01:00',
    '2023-01-01 00:00:00.000Z',
    '2023-01-0aT00:00:00.000Z',
    '2023-01-01T00:00:00.0-0Z',
    'not a date',
    '',
  ];
  for (let i = 0; i < 20000; i++) {
    inputs.push(new Date(Math.floor((Math.random() - 0.4) * 4e14)).toISOString());
  }

  const chars = '0123456789-T:.Z+ x';
  for (let i = 0; i < 20000; i++) {
    const base = inputs[Math.floor(Math.random() * inputs.length)].split('');
    base[Math.floor(Math.random() * base.length)] =
      chars[Math.floor(Math.random() * chars.length)];
    inputs.push(base.join(''));
  }

  for (const input of inputs) {
    expect(sameTime(parseISOString(input), new Date(input))).toBe(true);
  }
});
