/**
 * Server-side price resolution for order items.
 *
 * Order pricing previously summed the `price` supplied in the request, and item
 * validation only checked that the ids existed on the menu. Nothing compared the
 * two, so a client could send any price it liked. Prices are resolved here from
 * the menu instead, and the same resolution handles variants, where the selected
 * option carries its own price.
 */

/**
 * Find the variant a customer selected. Variants are matched by id, falling back
 * to name so a client sending "Full" rather than an id still resolves.
 */
export const findVariant = (variations, selection) => {
  const list = Array.isArray(variations) ? variations : [];
  if (list.length === 0) return null;

  const wanted = String(
    (selection && typeof selection === 'object' ? selection.id ?? selection.name : selection) ?? '',
  ).trim();
  if (!wanted) return null;

  const byId = list.find((v) => String(v?.id ?? '').trim() === wanted);
  if (byId) return byId;

  const lowered = wanted.toLowerCase();
  return list.find((v) => String(v?.name ?? '').trim().toLowerCase() === lowered) || null;
};

/**
 * The authoritative price for one line.
 *
 * `menuPrice` is what the menu says the item costs, already discounted by the
 * caller. A selected variant overrides it, because each option is priced
 * separately. A variant priced at 0 is treated as deliberate rather than falsy.
 */
export const resolveLinePrice = ({ menuPrice, variations, selection }) => {
  const variant = findVariant(variations, selection);
  if (variant && Number.isFinite(Number(variant.price))) {
    return {
      price: Number(variant.price),
      variant: {
        id: String(variant.id ?? '').trim(),
        name: String(variant.name ?? '').trim(),
        price: Number(variant.price),
      },
    };
  }
  return { price: Number(menuPrice || 0), variant: null };
};

/**
 * True when the request named a variant that the menu does not offer. Such a
 * line is rejected rather than quietly charged at the base price, since the
 * customer expected the option they picked.
 */
export const hasUnknownVariantSelection = (variations, selection) => {
  const wanted = String(
    (selection && typeof selection === 'object' ? selection.id ?? selection.name : selection) ?? '',
  ).trim();
  if (!wanted) return false;
  return !findVariant(variations, selection);
};

/**
 * Rebuild order lines using menu prices, ignoring whatever the request claimed.
 *
 * `menuItemsMap` maps itemId to the menu's own record, including its variations.
 * Unknown ids are reported rather than dropped, so the caller can fail the order
 * instead of silently shipping a shorter cart.
 */
export const repriceItems = (items, menuItemsMap) => {
  const priced = [];
  const unknownItemIds = [];
  const unknownVariants = [];

  for (const item of Array.isArray(items) ? items : []) {
    const itemId = String(item?.itemId ?? '').trim();
    const menuItem = itemId ? menuItemsMap.get(itemId) : null;

    if (!menuItem) {
      unknownItemIds.push(itemId || '(missing id)');
      continue;
    }

    const selection = item?.variant ?? item?.variation ?? null;
    if (hasUnknownVariantSelection(menuItem.variations, selection)) {
      unknownVariants.push(`${menuItem.name || itemId}`);
      continue;
    }

    const { price, variant } = resolveLinePrice({
      menuPrice: menuItem.price,
      variations: menuItem.variations,
      selection,
    });

    const quantity = Math.max(1, Math.floor(Number(item?.quantity) || 1));

    priced.push({
      itemId: menuItem.itemId,
      name: menuItem.name,
      price,
      quantity,
      image: menuItem.image || '',
      description: menuItem.description || '',
      isVeg: menuItem.isVeg !== false,
      ...(variant ? { variant } : {}),
    });
  }

  return { items: priced, unknownItemIds, unknownVariants };
};
