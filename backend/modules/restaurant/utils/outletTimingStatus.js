const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

export const isOpenFromOutletTimings = (timings, now = new Date()) => {
  if (!Array.isArray(timings) || timings.length === 0) return true;

  const currentDay = DAY_ORDER[now.getDay()];
  const currentDayEntry = timings.find((entry) => entry?.day === currentDay);
  if (!currentDayEntry) return true;
  if (currentDayEntry.isOpen === false) return false;

  const openingMinutes = parseTimeToMinutes(currentDayEntry.openingTime);
  const closingMinutes = parseTimeToMinutes(currentDayEntry.closingTime);
  if (!Number.isFinite(openingMinutes) || !Number.isFinite(closingMinutes)) return true;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (closingMinutes > openingMinutes) {
    return nowMinutes >= openingMinutes && nowMinutes <= closingMinutes;
  }
  return nowMinutes >= openingMinutes || nowMinutes <= closingMinutes;
};
