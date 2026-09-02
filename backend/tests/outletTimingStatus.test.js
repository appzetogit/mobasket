import { describe, it, expect } from 'vitest';
import {
  isOpenFromOutletTimings,
  parseTimeToMinutes,
} from '../modules/restaurant/utils/outletTimingStatus.js';

// Business time zone is Asia/Kolkata (UTC+5:30), so UTC instants are chosen to
// land on known IST wall-clock times. 2026-01-05 is a Monday.
const IST_MON_1200 = new Date('2026-01-05T06:30:00Z');
const IST_MON_1500 = new Date('2026-01-05T09:30:00Z');
const IST_MON_2300 = new Date('2026-01-05T17:30:00Z');

const daySlots = (day, slots) => [{ day, isOpen: true, slots }];

describe('parseTimeToMinutes', () => {
  it('parses 24-hour values', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('13:45')).toBe(825);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
  });

  it('handles the 12 AM/PM boundaries', () => {
    expect(parseTimeToMinutes('12:00 AM')).toBe(0);
    expect(parseTimeToMinutes('12:00 PM')).toBe(720);
    expect(parseTimeToMinutes('12:30 AM')).toBe(30);
  });

  it('rejects malformed input rather than guessing', () => {
    expect(parseTimeToMinutes('')).toBeNull();
    expect(parseTimeToMinutes('25:00')).toBeNull();
    expect(parseTimeToMinutes('10:75')).toBeNull();
    expect(parseTimeToMinutes('13:00 PM')).toBeNull();
    expect(parseTimeToMinutes(null)).toBeNull();
  });
});

describe('isOpenFromOutletTimings', () => {
  it('defaults to open when no schedule is configured', () => {
    expect(isOpenFromOutletTimings([], IST_MON_1200)).toBe(true);
    expect(isOpenFromOutletTimings(null, IST_MON_1200)).toBe(true);
  });

  it('defaults to open when the current day has no entry', () => {
    const timings = daySlots('Sunday', [
      { start: '10:00', startPeriod: 'AM', end: '08:00', endPeriod: 'PM' },
    ]);
    expect(isOpenFromOutletTimings(timings, IST_MON_1200)).toBe(true);
  });

  it('is closed when the day is explicitly marked closed', () => {
    const timings = [{ day: 'Monday', isOpen: false, slots: [] }];
    expect(isOpenFromOutletTimings(timings, IST_MON_1200)).toBe(false);
  });

  it('is open inside a slot and closed outside it', () => {
    const timings = daySlots('Monday', [
      { start: '10:00', startPeriod: 'AM', end: '02:00', endPeriod: 'PM' },
    ]);
    expect(isOpenFromOutletTimings(timings, IST_MON_1200)).toBe(true);
    expect(isOpenFromOutletTimings(timings, IST_MON_1500)).toBe(false);
  });

  it('handles a window that wraps past midnight', () => {
    const timings = daySlots('Monday', [
      { start: '10:00', startPeriod: 'PM', end: '02:00', endPeriod: 'AM' },
    ]);
    expect(isOpenFromOutletTimings(timings, IST_MON_2300)).toBe(true);
    expect(isOpenFromOutletTimings(timings, IST_MON_1500)).toBe(false);
  });

  it('is open when any one of several slots matches', () => {
    const timings = daySlots('Monday', [
      { start: '08:00', startPeriod: 'AM', end: '11:00', endPeriod: 'AM' },
      { start: '02:00', startPeriod: 'PM', end: '10:00', endPeriod: 'PM' },
    ]);
    expect(isOpenFromOutletTimings(timings, IST_MON_1500)).toBe(true);
    expect(isOpenFromOutletTimings(timings, IST_MON_1200)).toBe(false);
  });

  it('falls back to openingTime/closingTime when no slots exist', () => {
    const timings = [
      { day: 'Monday', isOpen: true, slots: [], openingTime: '09:00', closingTime: '14:00' },
    ];
    expect(isOpenFromOutletTimings(timings, IST_MON_1200)).toBe(true);
    expect(isOpenFromOutletTimings(timings, IST_MON_1500)).toBe(false);
  });

  it('stays open when the configured times are unparseable', () => {
    const timings = [
      { day: 'Monday', isOpen: true, slots: [], openingTime: 'garbage', closingTime: '???' },
    ];
    expect(isOpenFromOutletTimings(timings, IST_MON_1200)).toBe(true);
  });
});
