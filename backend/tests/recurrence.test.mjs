import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFirstOccurrenceOnOrAfter as first, getNextOccurrenceAfter as after, RecurrenceInputError } from '../dist/domain/recurrence.js';
import { cairoToday } from '../dist/validators/transaction.js';

const schedule = (frequency, startDate, endDate = null) => ({ frequency, startDate, endDate });
const advance = (definition, count) => {
  const dates = [definition.startDate];
  while (dates.length < count) {
    const next = after(definition, dates.at(-1));
    if (next === null) break;
    dates.push(next);
  }
  return dates;
};

test('daily calendar progression includes leap days and year boundaries', () => {
  assert.deepEqual(advance(schedule('daily', '2024-02-28'), 3), ['2024-02-28', '2024-02-29', '2024-03-01']);
  assert.equal(after(schedule('daily', '2026-12-31'), '2026-12-31'), '2027-01-01');
});

test('weekly uses the start weekday, exact and between-date references', () => {
  const definition = schedule('weekly', '2026-10-08');
  assert.deepEqual(advance(definition, 3), ['2026-10-08', '2026-10-15', '2026-10-22']);
  assert.equal(first(definition, '2026-10-15'), '2026-10-15');
  assert.equal(after(definition, '2026-10-15'), '2026-10-22');
  assert.equal(after(definition, '2026-10-16'), '2026-10-22');
});

test('monthly anchors 1, 28, 29, 30, 31 clamp February and recover in March', () => {
  for (const year of [2024, 2026]) for (const day of [1, 28, 29, 30, 31]) {
    const padded = String(day).padStart(2, '0');
    const february = String(Math.min(day, year === 2024 ? 29 : 28)).padStart(2, '0');
    assert.deepEqual(advance(schedule('monthly', `${year}-01-${padded}`), 3), [`${year}-01-${padded}`, `${year}-02-${february}`, `${year}-03-${padded}`]);
  }
  assert.deepEqual(advance(schedule('monthly', '2026-01-31'), 5), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  assert.equal(first(schedule('monthly', '2026-01-31'), '2026-02-27'), '2026-02-28');
  assert.equal(after(schedule('monthly', '2026-01-31'), '2026-02-28'), '2026-03-31');
});

test('yearly preserves original leap-day anchor and normal month/day', () => {
  assert.deepEqual(advance(schedule('yearly', '2024-02-29'), 5), ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  assert.deepEqual(advance(schedule('yearly', '2026-10-08'), 3), ['2026-10-08', '2027-10-08', '2028-10-08']);
  assert.equal(first(schedule('yearly', '2024-02-29'), '2026-03-01'), '2027-02-28');
});

test('Gregorian century rules distinguish 1900, 2000, 2100 and 2400', () => {
  for (const [year, expected] of [[1900, '03-01'], [2000, '02-29'], [2100, '03-01'], [2400, '02-29']]) {
    assert.equal(after(schedule('daily', `${year}-02-28`), `${year}-02-28`), `${year}-${expected}`);
  }
  const definition = schedule('yearly', '1996-02-29');
  assert.equal(first(definition, '2000-02-01'), '2000-02-29');
  assert.equal(first(definition, '2100-02-01'), '2100-02-28');
  assert.equal(first(definition, '2400-02-01'), '2400-02-29');
});

test('future starts and references before the anchor return the start for every frequency', () => {
  for (const frequency of ['daily', 'weekly', 'monthly', 'yearly']) {
    const definition = schedule(frequency, '2027-10-08');
    assert.equal(first(definition, '2026-10-08'), '2027-10-08');
    assert.equal(after(definition, '2026-10-08'), '2027-10-08');
    assert.equal(first(definition, definition.startDate), definition.startDate);
    assert.ok(after(definition, definition.startDate) > definition.startDate);
  }
});

test('past start and long paused gap choose only the requested eligible date', () => {
  for (const [frequency, start, expected, strict] of [
    ['daily', '2026-01-01', '2026-10-08', '2026-10-09'],
    ['weekly', '2026-01-01', '2026-10-08', '2026-10-15'],
    ['monthly', '2026-01-01', '2026-11-01', '2026-11-01'],
    ['yearly', '2020-10-08', '2026-10-08', '2027-10-08'],
  ]) {
    assert.equal(first(schedule(frequency, start), '2026-10-08'), expected);
    assert.equal(after(schedule(frequency, start), '2026-10-08'), strict);
  }
  assert.equal(first(schedule('monthly', '1900-01-01'), '2026-10-08'), '2026-11-01');
});

test('inclusive ends, between-occurrence ends and exhausted references', () => {
  for (const frequency of ['daily', 'weekly', 'monthly', 'yearly']) {
    const definition = schedule(frequency, '2026-10-08', '2026-10-08');
    assert.equal(first(definition, '2026-10-08'), '2026-10-08');
    assert.equal(after(definition, '2026-10-08'), null);
    assert.equal(first(definition, '2026-10-09'), null);
  }
  assert.deepEqual(advance(schedule('daily', '2026-10-01', '2026-10-03'), 100), ['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.equal(first(schedule('monthly', '2026-01-31', '2026-03-30'), '2026-03-01'), null);
});

test('supported date upper bound exhausts safely for every frequency', () => {
  for (const frequency of ['daily', 'weekly', 'monthly', 'yearly']) {
    const definition = schedule(frequency, '9999-12-31');
    assert.equal(first(definition, '9999-12-31'), '9999-12-31');
    assert.equal(after(definition, '9999-12-31'), null);
  }
  assert.equal(after(schedule('monthly', '1900-01-31'), '9999-12-30'), '9999-12-31');
  assert.equal(after(schedule('yearly', '1900-01-01'), '9999-01-01'), null);
  assert.equal(after(schedule('weekly', '9999-12-29'), '9999-12-29'), null);
});

test('invalid dates, frequencies, schedule fields and end ordering throw typed domain errors', () => {
  for (const value of ['', '2026-2-01', '2026-02-29', '1900-02-29', '2100-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '1899-12-31', '10000-01-01', '2026-10-08T00:00:00Z', null, 20261008]) {
    for (const field of ['startDate', 'referenceDate', 'endDate']) {
      if (field === 'endDate' && value === null) continue; // Nullable end is explicitly valid.
      const definition = schedule('daily', '2026-01-01');
      if (field !== 'referenceDate') definition[field] = value;
      for (const operation of [first, after]) assert.throws(() => operation(definition, field === 'referenceDate' ? value : '2026-10-08'), error => error instanceof RecurrenceInputError && error.field === field);
    }
  }
  for (const value of ['hourly', 'biweekly', 'MONTHLY', '', undefined, null]) assert.throws(() => first(schedule(value, '2026-01-01'), '2026-10-08'), RecurrenceInputError);
  assert.throws(() => first(schedule('daily', '2026-10-08', '2026-10-07'), '2026-10-08'), RecurrenceInputError);
  for (const definition of [null, [], 'daily', { startDate: '2026-01-01', frequency: 'weekly', dayOfWeek: 4 }]) assert.throws(() => first(definition, '2026-10-08'), RecurrenceInputError);
  assert.equal(first({ startDate: '2026-01-01', frequency: 'daily' }, '2026-10-08'), '2026-10-08');
});

test('100-step catch-up sequences are monotonic and retain monthly/yearly anchors', () => {
  for (const frequency of ['daily', 'weekly', 'monthly', 'yearly']) {
    const definition = Object.freeze(schedule(frequency, '2024-02-29'));
    const dates = advance(definition, 100);
    assert.equal(dates.length, 100);
    for (let index = 1; index < dates.length; index++) {
      assert.ok(dates[index] > dates[index - 1]);
      assert.equal(first(definition, dates[index]), dates[index]);
      const [year, month, day] = dates[index].split('-').map(Number);
      if (frequency === 'monthly' || frequency === 'yearly') assert.equal(day, Math.min(29, new Date(Date.UTC(year, month, 0)).getUTCDate()));
      if (frequency === 'yearly') assert.equal(month, 2);
    }
  }
});

test('broad independent UTC calendar oracle checks all frequencies across centuries', () => {
  // Date is used only in the test oracle; production arithmetic has no clock or timezone.
  for (const year of [1900, 1999, 2000, 2099, 2100, 2399, 2400, 9998]) {
    for (const month of [1, 2, 4, 12]) for (const frequency of ['daily', 'weekly', 'monthly', 'yearly']) {
      const start = `${year}-${String(month).padStart(2, '0')}-28`;
      const definition = schedule(frequency, start);
      let previous = start;
      for (let index = 1; index <= 12; index++) {
        const oracle = new Date(Date.UTC(year, month - 1, 28));
        if (frequency === 'daily' || frequency === 'weekly') oracle.setUTCDate(28 + index * (frequency === 'daily' ? 1 : 7));
        if (frequency === 'monthly') oracle.setUTCMonth(month - 1 + index);
        if (frequency === 'yearly') oracle.setUTCFullYear(year + index);
        const expected = oracle.getUTCFullYear() > 9999 ? null : oracle.toISOString().slice(0, 10);
        assert.equal(after(definition, previous), expected);
        if (expected === null) break;
        previous = expected;
      }
    }
  }
});

test('explicit Cairo midnight references work in winter and summer without clock coupling', () => {
  for (const [before, midnight, yesterday, today] of [
    ['2026-01-07T21:59:59Z', '2026-01-07T22:00:00Z', '2026-01-07', '2026-01-08'],
    ['2026-07-07T20:59:59Z', '2026-07-07T21:00:00Z', '2026-07-07', '2026-07-08'],
  ]) {
    const definition = schedule('daily', '2026-01-01');
    assert.equal(first(definition, cairoToday(new Date(before))), yesterday);
    assert.equal(first(definition, cairoToday(new Date(midnight))), today);
  }
  for (const reference of ['2026-04-23', '2026-04-24', '2026-10-29', '2026-10-30']) assert.equal(first(schedule('daily', '2026-01-01'), reference), reference);
});

test('long horizons use bounded calculation and repeated calls do not mutate inputs', () => {
  const definition = Object.freeze(schedule('monthly', '1900-01-31'));
  for (let index = 0; index < 1000; index++) {
    assert.equal(first(definition, '9999-12-01'), '9999-12-31');
    assert.equal(first(schedule('daily', '1900-01-01'), '9999-12-31'), '9999-12-31');
    assert.equal(first(schedule('yearly', '1904-02-29'), '9999-02-01'), '9999-02-28');
  }
  assert.deepEqual(definition, schedule('monthly', '1900-01-31'));
});
