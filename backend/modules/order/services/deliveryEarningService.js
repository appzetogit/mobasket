import FeeSettings from '../../admin/models/FeeSettings.js';
import DeliveryBoyCommission from '../../admin/models/DeliveryBoyCommission.js';

const normalizePlatform = (platform) => (platform === 'mogrocery' ? 'mogrocery' : 'mofood');

const getPlatformFilter = (platform) => {
  if (normalizePlatform(platform) === 'mogrocery') {
    return { platform: 'mogrocery' };
  }
  return { $or: [{ platform: 'mofood' }, { platform: { $exists: false } }] };
};

const getActiveFeeSettings = async (platform = 'mofood') => {
  const feeSettings = await FeeSettings.findOne({
    ...getPlatformFilter(platform),
    isActive: true
  })
    .sort({ createdAt: -1 })
    .lean();

  if (feeSettings) return feeSettings;

  return {
    driverEarningRangeStartKm: 0,
    driverEarningRangeEndKm: 2,
    driverEarningBaseAmount: 20,
    driverEarningExtraPerKm: 5,
  };
};

export const calculateDriverEarning = async (distanceKm = 0, platform = 'mofood') => {
  const normalizedDistanceKm = Math.max(0, Number(distanceKm) || 0);

  try {
    const feeSettings = await getActiveFeeSettings(platform);
    const rangeStartKm = Math.max(0, Number(feeSettings?.driverEarningRangeStartKm ?? 0));
    const rangeEndKmCandidate = Number(feeSettings?.driverEarningRangeEndKm ?? 2);
    const rangeEndKm = rangeEndKmCandidate > rangeStartKm ? rangeEndKmCandidate : rangeStartKm + 0.01;
    const baseAmount = Math.max(0, Number(feeSettings?.driverEarningBaseAmount ?? 20));
    const extraPerKmFee = Math.max(0, Number(feeSettings?.driverEarningExtraPerKm ?? 5));

    const extraDistanceKm = Math.max(0, normalizedDistanceKm - rangeEndKm);
    const totalEarning = Math.round((baseAmount + extraDistanceKm * extraPerKmFee) * 100) / 100;

    return {
      source: 'fee_settings',
      distanceKm: Math.round(normalizedDistanceKm * 100) / 100,
      rangeStartKm: Math.round(rangeStartKm * 100) / 100,
      rangeEndKm: Math.round(rangeEndKm * 100) / 100,
      baseAmount: Math.round(baseAmount * 100) / 100,
      extraPerKmFee: Math.round(extraPerKmFee * 100) / 100,
      extraDistanceKm: Math.round(extraDistanceKm * 100) / 100,
      totalEarning,
      breakdownText: `Rs${baseAmount.toFixed(2)} + (${extraDistanceKm.toFixed(2)} km x Rs${extraPerKmFee.toFixed(2)}) = Rs${totalEarning.toFixed(2)}`
    };
  } catch (error) {
    // Backward-compatible fallback to legacy commission rules
    const commissionResult = await DeliveryBoyCommission.calculateCommission(normalizedDistanceKm);
    const totalEarning = Math.round((Number(commissionResult?.commission || 0)) * 100) / 100;
    const basePayout = Math.round((Number(commissionResult?.breakdown?.basePayout || 0)) * 100) / 100;
    const commissionPerKm = Math.round((Number(commissionResult?.breakdown?.commissionPerKm || 0)) * 100) / 100;
    const minDistance = Math.max(0, Number(commissionResult?.rule?.minDistance || 0));

    return {
      source: 'legacy_commission',
      distanceKm: Math.round(normalizedDistanceKm * 100) / 100,
      rangeStartKm: 0,
      rangeEndKm: minDistance,
      baseAmount: basePayout,
      extraPerKmFee: commissionPerKm,
      extraDistanceKm: Math.max(0, normalizedDistanceKm - minDistance),
      totalEarning,
      breakdownText: `Rs${basePayout.toFixed(2)} + distance = Rs${totalEarning.toFixed(2)}`,
      legacy: {
        rule: commissionResult?.rule || null,
        breakdown: commissionResult?.breakdown || null
      }
    };
  }
};
