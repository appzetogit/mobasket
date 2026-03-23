export const isDeliveryEligibleForOrders = (delivery) => {
  if (!delivery) return false;

  const status = String(delivery.status || '').trim().toLowerCase();
  const isApprovedStatus = status === 'approved' || status === 'active';

  return Boolean(delivery.isActive && isApprovedStatus);
};

export const getDeliveryEligibilityErrorMessage = (delivery) => {
  const status = String(delivery?.status || '').trim().toLowerCase();

  if (status === 'pending' || status === 'onboarding') {
    return 'Your account is not verified yet. Orders will be available after admin approval.';
  }

  if (status === 'blocked' || status === 'suspended') {
    return 'Your account is not eligible to receive orders.';
  }

  if (!delivery?.isActive) {
    return 'Your account is inactive and cannot receive orders.';
  }

  if (!delivery?.phoneVerified) {
    return 'Phone verification is required before receiving orders.';
  }

  return 'Your account is not eligible to receive orders.';
};
