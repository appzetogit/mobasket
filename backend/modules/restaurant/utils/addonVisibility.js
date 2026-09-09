/**
 * Visibility rules for menu add-ons.
 *
 * Kept in one place because the same rules have to hold in two very different
 * paths: the public endpoint that offers add-ons to a customer, and order
 * validation that decides what may actually be bought. If those drift, a
 * customer can be shown an add-on they cannot order, or order one that was
 * never approved.
 */

/**
 * An add-on is orderable when it is available and admin has approved it.
 * A missing approvalStatus is treated as approved so add-ons created before the
 * approval workflow existed keep working.
 */
export const isAddonOrderable = (addon) => {
  if (!addon || typeof addon !== 'object') return false;
  if (addon.isAvailable === false) return false;
  const status = addon.approvalStatus;
  return !status || status === 'approved';
};

/**
 * applicableCategoryIds scopes an add-on to particular menu categories.
 * An empty list means it applies everywhere, which is how every add-on
 * currently in the database behaves.
 */
export const addonAppliesToCategory = (addon, categoryId) => {
  const scoped = Array.isArray(addon?.applicableCategoryIds)
    ? addon.applicableCategoryIds.filter(Boolean).map(String)
    : [];
  if (scoped.length === 0) return true;
  if (!categoryId) return false;
  return scoped.includes(String(categoryId));
};

/**
 * Add-ons a customer may be offered, optionally narrowed to one category.
 */
export const filterPublicAddons = (addons, { categoryId } = {}) =>
  (Array.isArray(addons) ? addons : [])
    .filter(isAddonOrderable)
    .filter((addon) => (categoryId ? addonAppliesToCategory(addon, categoryId) : true));
