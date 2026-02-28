export const getDefaultPendingCartEdit = () => ({
  items: [],
  subtotal: 0,
  total: 0,
  additionalAmount: 0,
  razorpayOrderId: '',
  createdAt: null
});

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const sanitizePendingCartEdit = (value) => {
  if (value === undefined || value === null || !isPlainObject(value)) {
    return getDefaultPendingCartEdit();
  }

  const createdAtDate = value.createdAt ? new Date(value.createdAt) : null;
  const createdAt =
    createdAtDate && !Number.isNaN(createdAtDate.getTime()) ? createdAtDate : null;

  return {
    items: Array.isArray(value.items) ? value.items : [],
    subtotal: Number.isFinite(Number(value.subtotal)) ? Number(value.subtotal) : 0,
    total: Number.isFinite(Number(value.total)) ? Number(value.total) : 0,
    additionalAmount: Number.isFinite(Number(value.additionalAmount)) ? Number(value.additionalAmount) : 0,
    razorpayOrderId: typeof value.razorpayOrderId === 'string' ? value.razorpayOrderId : '',
    createdAt,
    ...(Object.prototype.hasOwnProperty.call(value, 'requiresAdminReapproval')
      ? { requiresAdminReapproval: Boolean(value.requiresAdminReapproval) }
      : {})
  };
};

export const sanitizePostOrderActions = (value) => {
  const base = isPlainObject(value) ? { ...value } : {};
  return {
    ...base,
    pendingCartEdit: sanitizePendingCartEdit(base.pendingCartEdit)
  };
};
