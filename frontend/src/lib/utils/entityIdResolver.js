/**
 * Utility to reliably extract an ID string from various object structures.
 * Supports MongoDB objects, nested store/restaurant references, and direct strings.
 */
export const resolveEntityId = (value) => {
    if (!value) return "";

    // If it's already a string, trim and return
    if (typeof value === "string") return value.trim();

    // If it's an object, check for common ID fields
    if (typeof value === "object") {
        const idValue =
            value?._id ||
            value?.id ||
            value?.restaurantId ||
            value?.storeId ||
            "";

        // If we found an ID field, it might be nested (rare but possible)
        if (idValue && typeof idValue === "object") {
            return resolveEntityId(idValue);
        }

        return String(idValue).trim();
    }

    // Fallback for other types
    return String(value).trim();
};
