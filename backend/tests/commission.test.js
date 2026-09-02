import { describe, it, expect } from 'vitest';
import {
  createCommissionCalculator,
  foodPriceForOrder,
  getWeekEnd,
  getWeekStart,
  isCommissionConfigured,
} from '../modules/restaurant/utils/commission.js';

const rule = (over) => ({
  isActive: true,
  priority: 0,
  minOrderAmount: 0,
  maxOrderAmount: null,
  type: 'percentage',
  value: 10,
  ...over,
});

describe('isCommissionConfigured', () => {
  it('requires an active commission record', () => {
    expect(isCommissionConfigured({ status: true })).toBe(true);
    expect(isCommissionConfigured({ status: false })).toBe(false);
    expect(isCommissionConfigured(null)).toBe(false);
  });
});

describe('createCommissionCalculator', () => {
  it('charges nothing and reports unconfigured when commission is not set up', () => {
    const calc = createCommissionCalculator(null);
    expect(calc(1000)).toEqual({ commission: 0, type: null, value: null, configured: false });
  });

  it('applies a percentage rule', () => {
    const calc = createCommissionCalculator({
      status: true,
      commissionRules: [rule({ value: 15 })],
    });
    expect(calc(200).commission).toBe(30);
  });

  it('applies a fixed rule as a flat amount, not a rate', () => {
    const calc = createCommissionCalculator({
      status: true,
      commissionRules: [rule({ type: 'fixed', value: 25 })],
    });
    expect(calc(200).commission).toBe(25);
    expect(calc(5000).commission).toBe(25);
  });

  it('prefers the higher priority rule when several match', () => {
    const calc = createCommissionCalculator({
      status: true,
      commissionRules: [
        rule({ value: 10, priority: 1 }),
        rule({ value: 20, priority: 5 }),
      ],
    });
    expect(calc(100).commission).toBe(20);
  });

  it('respects the amount band on a rule', () => {
    const calc = createCommissionCalculator({
      status: true,
      commissionRules: [rule({ minOrderAmount: 500, value: 20 })],
      defaultCommission: { type: 'percentage', value: 5 },
    });
    expect(calc(600).commission).toBe(120); // inside the band
    expect(calc(100).commission).toBe(5); // below it, falls to default
  });

  it('treats a null maxOrderAmount as unbounded', () => {
    const calc = createCommissionCalculator({
      status: true,
      commissionRules: [rule({ minOrderAmount: 100, maxOrderAmount: null, value: 10 })],
    });
    expect(calc(999999).commission).toBe(99999.9);
  });

  it('ignores inactive rules', () => {
    const calc = createCommissionCalculator({
      status: true,
      commissionRules: [rule({ isActive: false, value: 50 })],
      defaultCommission: { type: 'percentage', value: 8 },
    });
    expect(calc(100).commission).toBe(8);
  });

  it('falls back to 10% when neither a rule nor a default exists', () => {
    const calc = createCommissionCalculator({ status: true, commissionRules: [] });
    expect(calc(250).commission).toBe(25);
  });

  it('rounds to two decimals', () => {
    const calc = createCommissionCalculator({
      status: true,
      commissionRules: [rule({ value: 7.5 })],
    });
    expect(calc(33.33).commission).toBe(2.5);
  });
});

describe('foodPriceForOrder', () => {
  it('is subtotal minus discount, excluding fees and tax', () => {
    expect(
      foodPriceForOrder({
        pricing: { subtotal: 500, discount: 50, deliveryFee: 40, platformFee: 10, gst: 25 },
      }),
    ).toBe(450);
  });

  it('treats missing pricing as zero rather than NaN', () => {
    expect(foodPriceForOrder({})).toBe(0);
    expect(foodPriceForOrder(null)).toBe(0);
  });
});

describe('week boundaries', () => {
  it('starts the week on Monday at midnight', () => {
    // 2026-01-08 is a Thursday.
    const start = getWeekStart(new Date('2026-01-08T13:45:00'));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(5);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it('puts Sunday in the week that began the previous Monday', () => {
    // 2026-01-11 is a Sunday; its week starts Monday the 5th.
    const start = getWeekStart(new Date('2026-01-11T23:00:00'));
    expect(start.getDate()).toBe(5);
  });

  it('is idempotent', () => {
    const once = getWeekStart(new Date('2026-01-08T13:45:00'));
    expect(getWeekStart(once).getTime()).toBe(once.getTime());
  });

  it('ends the week on Sunday at 23:59:59.999', () => {
    const start = getWeekStart(new Date('2026-01-08T13:45:00'));
    const end = getWeekEnd(start);
    expect(end.getDay()).toBe(0);
    expect(end.getDate()).toBe(11);
    expect(end.getHours()).toBe(23);
    expect(end.getMilliseconds()).toBe(999);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });
});
