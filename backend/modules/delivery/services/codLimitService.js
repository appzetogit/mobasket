import DeliveryWallet from '../models/DeliveryWallet.js';
import Delivery from '../models/Delivery.js';
import Payment from '../../payment/models/Payment.js';
import BusinessSettings from '../../admin/models/BusinessSettings.js';

const normalizePaymentMethod = (value) => {
  const method = String(value || '').trim().toLowerCase();
  if (['cash', 'cod', 'cash on delivery'].includes(method)) return 'cash';
  if (method === 'wallet') return 'wallet';
  return method || 'razorpay';
};

export const resolveGlobalCODLimit = async () => {
  try {
    const settings = await BusinessSettings.getSettings();
    const configuredLimit = Number(settings?.deliveryCashLimit);
    if (Number.isFinite(configuredLimit) && configuredLimit >= 0) {
      return configuredLimit;
    }
  } catch (_) {
    // Fallback below.
  }
  return 750;
};

export const resolveCODLimitForDelivery = async (deliveryId) => {
  if (deliveryId) {
    try {
      const delivery = await Delivery.findById(deliveryId).select('cod.limitOverride').lean();
      const override = Number(delivery?.cod?.limitOverride);
      if (Number.isFinite(override) && override >= 0) {
        return override;
      }
    } catch (_) {
      // Fallback to global limit.
    }
  }
  return resolveGlobalCODLimit();
};

export const getDeliveryCODSummary = async (deliveryId) => {
  const [wallet, codLimit] = await Promise.all([
    DeliveryWallet.findOrCreateByDeliveryId(deliveryId),
    resolveCODLimitForDelivery(deliveryId),
  ]);

  const cashCollected = Math.max(
    0,
    Number(wallet?.codCashCollected ?? wallet?.cashInHand ?? 0) || 0,
  );
  const remainingLimit = Math.max(0, Number(codLimit) - cashCollected);

  return {
    codLimit: Number(codLimit),
    cashCollected,
    remainingLimit,
  };
};

export const resolveOrderCODAmount = async (order) => {
  if (!order) return 0;

  let paymentMethod = normalizePaymentMethod(order?.payment?.method);
  if (paymentMethod !== 'cash' && order?._id) {
    try {
      const paymentRecord = await Payment.findOne({ orderId: order._id }).select('method').lean();
      paymentMethod = normalizePaymentMethod(paymentRecord?.method || paymentMethod);
    } catch (_) {
      // Ignore payment lookup failures and keep fallback method.
    }
  }

  if (paymentMethod !== 'cash') return 0;
  return Math.max(0, Number(order?.pricing?.total) || 0);
};

export const validateCODLimitBeforeAssignment = async ({ deliveryId, order }) => {
  const summary = await getDeliveryCODSummary(deliveryId);
  const orderCODAmount = await resolveOrderCODAmount(order);
  const projectedCashCollected = summary.cashCollected + orderCODAmount;
  const isAllowed = projectedCashCollected <= summary.codLimit;

  return {
    ...summary,
    orderCODAmount,
    projectedCashCollected,
    isAllowed,
  };
};
