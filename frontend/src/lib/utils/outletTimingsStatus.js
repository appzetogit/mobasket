const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAMES_MONDAY_FIRST = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const parseTimeToMinutes = (value) => {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3] || null;
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (period) {
    if (hours < 1 || hours > 12) return null;
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
};

export const normalizeTimeTo24Hour = (value, fallback = '09:00') => {
  if (!value || typeof value !== 'string') return fallback;
  const parsedMinutes = parseTimeToMinutes(value);
  if (!Number.isFinite(parsedMinutes)) return fallback;
  const hours = Math.floor(parsedMinutes / 60) % 24;
  const minutes = parsedMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const slotTo24Hour = (time, period) => {
  if (!time || typeof time !== 'string' || !time.includes(':')) return null;
  const [rawHour, rawMinute] = time.split(':').map(Number);
  if (!Number.isFinite(rawHour) || !Number.isFinite(rawMinute)) return null;
  let hour = rawHour;
  const minute = Math.max(0, Math.min(59, rawMinute));
  const p = String(period || '').toLowerCase();
  if (p === 'pm' && hour !== 12) hour += 12;
  if (p === 'am' && hour === 12) hour = 0;
  hour = Math.max(0, Math.min(23, hour));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const minutesToSlotParts = (totalMinutes) => {
  if (!Number.isFinite(totalMinutes)) return null;
  const normalizedMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours24 = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return {
    time: `${hours24 % 12 || 12}:${String(minutes).padStart(2, '0')}`,
    period: hours24 >= 12 ? 'pm' : 'am',
  };
};

const normalizeSlotTime = (time, period) => {
  const normalized24 = slotTo24Hour(time, period) || normalizeTimeTo24Hour(time, null);
  if (!normalized24) return null;
  return minutesToSlotParts(parseTimeToMinutes(normalized24));
};

const normalizeSlot = (slot) => {
  if (!slot || typeof slot !== 'object') return null;
  const start = normalizeSlotTime(slot.start, slot.startPeriod);
  const end = normalizeSlotTime(slot.end, slot.endPeriod);
  if (!start || !end) return null;
  return {
    start: start.time,
    end: end.time,
    startPeriod: start.period,
    endPeriod: end.period,
  };
};

const isWithinWindow = (currentMinutes, openingMinutes, closingMinutes) => {
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

export const normalizeOutletTimingsMap = (raw) => {
  if (!raw) return null;
  const next = {};

  const assignDay = (day, value) => {
    if (!DAY_NAMES_MONDAY_FIRST.includes(day) || !value || typeof value !== 'object') return;
    const slots = Array.isArray(value?.slots) ? value.slots.map(normalizeSlot).filter(Boolean) : [];
    const firstSlot = slots.length > 0 ? slots[0] : null;
    const lastSlot = slots.length > 0 ? slots[slots.length - 1] : null;
    const openingFromSlot = firstSlot ? slotTo24Hour(firstSlot.start, firstSlot.startPeriod) : null;
    const closingFromSlot = lastSlot ? slotTo24Hour(lastSlot.end, lastSlot.endPeriod) : null;

    next[day] = {
      isOpen: value.isOpen !== false,
      openingTime: normalizeTimeTo24Hour(value.openingTime || openingFromSlot, '09:00'),
      closingTime: normalizeTimeTo24Hour(value.closingTime || closingFromSlot, '22:00'),
      slots,
    };
  };

  if (Array.isArray(raw)) {
    raw.forEach((entry) => assignDay(entry?.day, entry));
  } else if (typeof raw === 'object') {
    DAY_NAMES_MONDAY_FIRST.forEach((day) => assignDay(day, raw[day]));
  }

  return Object.keys(next).length > 0 ? next : null;
};

export const isOpenFromOutletTimingsMap = (timingsByDay, now = new Date()) => {
  if (!timingsByDay || typeof timingsByDay !== 'object') return null;
  const currentDay = DAY_ORDER[now.getDay()];
  const dayData = timingsByDay[currentDay];
  if (!dayData) return null;
  if (dayData.isOpen === false) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const slots = Array.isArray(dayData?.slots) ? dayData.slots : [];
  if (slots.length > 0) {
    return slots.some((slot) => {
      const start24 = slotTo24Hour(slot?.start, slot?.startPeriod);
      const end24 = slotTo24Hour(slot?.end, slot?.endPeriod);
      const startMinutes = parseTimeToMinutes(start24);
      const endMinutes = parseTimeToMinutes(end24);
      return isWithinWindow(nowMinutes, startMinutes, endMinutes);
    });
  }

  const openingMinutes = parseTimeToMinutes(dayData.openingTime);
  const closingMinutes = parseTimeToMinutes(dayData.closingTime);
  if (!Number.isFinite(openingMinutes) || !Number.isFinite(closingMinutes)) return true;

  return isWithinWindow(nowMinutes, openingMinutes, closingMinutes);
};
