import { describe, it, expect } from 'vitest';
import {
  findVariant,
  resolveLinePrice,
  hasUnknownVariantSelection,
  repriceItems,
} from '../modules/order/utils/itemPricing.js';

const VARIATIONS = [
  { id: 'v-half', name: 'Half', price: 150 },
  { id: 'v-full', name: 'Full', price: 280 },
];

const menuMap = () =>
  new Map([
    ['item-1', { itemId: 'item-1', name: 'Chicken Tandoori', price: 200, variations: VARIATIONS, isVeg: false }],
    ['item-2', { itemId: 'item-2', name: 'Choco Lawa', price: 200, variations: [], isVeg: true }],
  ]);

describe('findVariant', () => {
  it('matches by id', () => {
    expect(findVariant(VARIATIONS, 'v-full').name).toBe('Full');
  });

  it('falls back to matching by name, case-insensitively', () => {
    expect(findVariant(VARIATIONS, 'full').id).toBe('v-full');
    expect(findVariant(VARIATIONS, 'HALF').id).toBe('v-half');
  });

  it('accepts an object selection', () => {
    expect(findVariant(VARIATIONS, { id: 'v-half' }).name).toBe('Half');
    expect(findVariant(VARIATIONS, { name: 'Full' }).id).toBe('v-full');
  });

  it('returns null for no selection, no variations, or an unknown one', () => {
    expect(findVariant(VARIATIONS, '')).toBeNull();
    expect(findVariant([], 'Full')).toBeNull();
    expect(findVariant(VARIATIONS, 'Family Pack')).toBeNull();
  });
});

describe('resolveLinePrice', () => {
  it('uses the base price when nothing is selected', () => {
    expect(resolveLinePrice({ menuPrice: 200, variations: VARIATIONS, selection: null }).price).toBe(200);
  });

  it('uses the selected variant price, not the base price', () => {
    const full = resolveLinePrice({ menuPrice: 200, variations: VARIATIONS, selection: 'v-full' });
    expect(full.price).toBe(280);
    expect(full.variant).toEqual({ id: 'v-full', name: 'Full', price: 280 });
  });

  it('records which option was chosen so the order shows Half or Full', () => {
    expect(resolveLinePrice({ menuPrice: 200, variations: VARIATIONS, selection: 'Half' }).variant.name).toBe('Half');
  });

  it('honours a variant priced at zero rather than treating it as unset', () => {
    const free = [{ id: 'v-free', name: 'Free side', price: 0 }];
    expect(resolveLinePrice({ menuPrice: 200, variations: free, selection: 'v-free' }).price).toBe(0);
  });
});

describe('hasUnknownVariantSelection', () => {
  it('is false when nothing was selected', () => {
    expect(hasUnknownVariantSelection(VARIATIONS, null)).toBe(false);
  });

  it('is false for a real option and true for one the menu does not offer', () => {
    expect(hasUnknownVariantSelection(VARIATIONS, 'Full')).toBe(false);
    expect(hasUnknownVariantSelection(VARIATIONS, 'Family Pack')).toBe(true);
  });
});

describe('repriceItems', () => {
  it('ignores the price supplied in the request and uses the menu price', () => {
    const { items } = repriceItems([{ itemId: 'item-2', price: 1, quantity: 1 }], menuMap());
    expect(items[0].price).toBe(200);
  });

  it('is unchanged for an honest request, so legitimate orders keep the same total', () => {
    const { items } = repriceItems([{ itemId: 'item-2', price: 200, quantity: 2 }], menuMap());
    expect(items[0].price).toBe(200);
    expect(items[0].quantity).toBe(2);
  });

  it('prices a selected variant from the menu even when the request lies about it', () => {
    const { items } = repriceItems([{ itemId: 'item-1', price: 5, quantity: 1, variant: 'v-full' }], menuMap());
    expect(items[0].price).toBe(280);
    expect(items[0].variant.name).toBe('Full');
  });

  it('reports unknown items rather than dropping them from the cart', () => {
    const res = repriceItems([{ itemId: 'nope', price: 10, quantity: 1 }], menuMap());
    expect(res.items).toHaveLength(0);
    expect(res.unknownItemIds).toEqual(['nope']);
  });

  it('reports an option the menu no longer offers instead of billing the base price', () => {
    const res = repriceItems([{ itemId: 'item-1', price: 200, quantity: 1, variant: 'Family Pack' }], menuMap());
    expect(res.items).toHaveLength(0);
    expect(res.unknownVariants).toEqual(['Chicken Tandoori']);
  });

  it('normalises quantity to a whole number of at least one', () => {
    const { items } = repriceItems(
      [
        { itemId: 'item-2', price: 200, quantity: 0 },
        { itemId: 'item-2', price: 200, quantity: 2.7 },
        { itemId: 'item-2', price: 200, quantity: -5 },
      ],
      menuMap(),
    );
    expect(items.map((i) => i.quantity)).toEqual([1, 2, 1]);
  });

  it('handles an empty or malformed cart', () => {
    expect(repriceItems([], menuMap()).items).toEqual([]);
    expect(repriceItems(null, menuMap()).items).toEqual([]);
  });
});
