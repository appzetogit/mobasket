const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const BUSINESS_TIME_ZONE =
  process.env.BUSINESS_TIME_ZONE ||
  process.env.APP_TIME_ZONE ||
  process.env.TZ ||
  'Asia/Kolkata';

const getBusinessNowParts = (now = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);

  return {
    weekday,
    hour,
    minute,
  };
};

export const parseTimeToMinutes = (value) => {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3] || null;

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
};

const parseSlotTimeToMinutes = (timeValue, periodValue) => {
  if (!timeValue || typeof timeValue !== 'string') return null;
  const normalizedTime = timeValue.trim();
  const normalizedPeriod = String(periodValue || '').trim().toUpperCase();
  if (!normalizedPeriod || (normalizedPeriod !== 'AM' && normalizedPeriod !== 'PM')) return null;
  return parseTimeToMinutes(`${normalizedTime} ${normalizedPeriod}`);
};

const isWithinTimeWindow = (currentMinutes, openingMinutes, closingMinutes) => {
  if (
    !Number.isFinite(currentMinutes) ||
    !Number.isFinite(openingMinutes) ||
    !Number.isFinite(closingMinutes)
  ) {
    return false;
  }

  if (openingMinutes === closingMinutes) return true;
  if (closingMinutes > openingMinutes) {
    return currentMinutes >= openingMinutes && currentMinutes <= closingMinutes;
  }
  return currentMinutes >= openingMinutes || currentMinutes <= closingMinutes;
};

export const isOpenFromOutletTimings = (timings, now = new Date()) => {
  if (!Array.isArray(timings) || timings.length === 0) return true;

  const zonedNow = getBusinessNowParts(now);
  const currentDay =
    zonedNow.weekday && DAY_ORDER.includes(zonedNow.weekday)
      ? zonedNow.weekday
      : DAY_ORDER[now.getDay()];
  const currentDayEntry = timings.find((entry) => entry?.day === currentDay);
  if (!currentDayEntry) return true;
  if (currentDayEntry.isOpen === false) return false;

  const fallbackNowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowMinutes =
    Number.isFinite(zonedNow.hour) && Number.isFinite(zonedNow.minute)
      ? zonedNow.hour * 60 + zonedNow.minute
      : fallbackNowMinutes;
  const slots = Array.isArray(currentDayEntry.slots) ? currentDayEntry.slots : [];
  if (slots.length > 0) {
    const hasActiveSlot = slots.some((slot) => {
      const startMinutes = parseSlotTimeToMinutes(slot?.start, slot?.startPeriod);
      const endMinutes = parseSlotTimeToMinutes(slot?.end, slot?.endPeriod);
      return isWithinTimeWindow(nowMinutes, startMinutes, endMinutes);
    });
    return hasActiveSlot;
  }

  const openingMinutes = parseTimeToMinutes(currentDayEntry.openingTime);
  const closingMinutes = parseTimeToMinutes(currentDayEntry.closingTime);
  if (!Number.isFinite(openingMinutes) || !Number.isFinite(closingMinutes)) return true;

  return isWithinTimeWindow(nowMinutes, openingMinutes, closingMinutes);
};
