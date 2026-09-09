import { describe, it, expect } from 'vitest';
import {
  isAddonOrderable,
  addonAppliesToCategory,
  filterPublicAddons,
} from '../modules/restaurant/utils/addonVisibility.js';

const addon = (over = {}) => ({
  id: 'a1',
  name: 'Extra Cheese',
  price: 30,
  isAvailable: true,
  approvalStatus: 'approved',
  applicableCategoryIds: [],
  ...over,
});

describe('isAddonOrderable', () => {
  it('accepts an available, approved add-on', () => {
    expect(isAddonOrderable(addon())).toBe(true);
  });

  it('rejects add-ons that are not approved', () => {
    expect(isAddonOrderable(addon({ approvalStatus: 'pending' }))).toBe(false);
    expect(isAddonOrderable(addon({ approvalStatus: 'rejected' }))).toBe(false);
  });

  it('rejects unavailable add-ons even when approved', () => {
    expect(isAddonOrderable(addon({ isAvailable: false }))).toBe(false);
  });

  it('treats a missing approvalStatus as approved, for records predating the workflow', () => {
    expect(isAddonOrderable(addon({ approvalStatus: undefined }))).toBe(true);
    expect(isAddonOrderable(addon({ approvalStatus: '' }))).toBe(true);
  });

  it('rejects junk input instead of throwing', () => {
    expect(isAddonOrderable(null)).toBe(false);
    expect(isAddonOrderable(undefined)).toBe(false);
    expect(isAddonOrderable('not an object')).toBe(false);
  });
});

describe('addonAppliesToCategory', () => {
  it('applies everywhere when no categories are set', () => {
    expect(addonAppliesToCategory(addon(), 'cat-1')).toBe(true);
    expect(addonAppliesToCategory(addon(), undefined)).toBe(true);
  });

  it('applies only to a listed category when scoped', () => {
    const scoped = addon({ applicableCategoryIds: ['cat-1', 'cat-2'] });
    expect(addonAppliesToCategory(scoped, 'cat-2')).toBe(true);
    expect(addonAppliesToCategory(scoped, 'cat-9')).toBe(false);
  });

  it('does not apply a scoped add-on when no category is supplied', () => {
    expect(addonAppliesToCategory(addon({ applicableCategoryIds: ['cat-1'] }), null)).toBe(false);
  });

  it('compares ids as strings so ObjectId values still match', () => {
    const scoped = addon({ applicableCategoryIds: [{ toString: () => 'cat-7' }] });
    expect(addonAppliesToCategory(scoped, 'cat-7')).toBe(true);
  });

  it('ignores empty entries in the category list', () => {
    expect(addonAppliesToCategory(addon({ applicableCategoryIds: ['', null] }), 'cat-1')).toBe(true);
  });
});

describe('filterPublicAddons', () => {
  const addons = [
    addon({ id: 'ok' }),
    addon({ id: 'pending', approvalStatus: 'pending' }),
    addon({ id: 'rejected', approvalStatus: 'rejected' }),
    addon({ id: 'unavailable', isAvailable: false }),
    addon({ id: 'scoped', applicableCategoryIds: ['burgers'] }),
  ];

  it('returns only orderable add-ons', () => {
    expect(filterPublicAddons(addons).map((a) => a.id)).toEqual(['ok', 'scoped']);
  });

  it('never leaks pending or rejected add-ons, which is the whole point of approval', () => {
    const ids = filterPublicAddons(addons).map((a) => a.id);
    expect(ids).not.toContain('pending');
    expect(ids).not.toContain('rejected');
  });

  it('narrows to a category when one is given', () => {
    expect(filterPublicAddons(addons, { categoryId: 'burgers' }).map((a) => a.id)).toEqual(['ok', 'scoped']);
    expect(filterPublicAddons(addons, { categoryId: 'drinks' }).map((a) => a.id)).toEqual(['ok']);
  });

  it('handles a missing or malformed list', () => {
    expect(filterPublicAddons(null)).toEqual([]);
    expect(filterPublicAddons(undefined)).toEqual([]);
    expect(filterPublicAddons([null, undefined])).toEqual([]);
  });
});
