const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

export const isOpenFromOutletTimingsMap = (timingsByDay, now = new Date()) => {
  if (!timingsByDay || typeof timingsByDay !== 'object') return null;
  const currentDay = DAY_ORDER[now.getDay()];
  const dayData = timingsByDay[currentDay];
  if (!dayData) return null;
  if (dayData.isOpen === false) return false;

  const openingMinutes = parseTimeToMinutes(dayData.openingTime);
  const closingMinutes = parseTimeToMinutes(dayData.closingTime);
  if (!Number.isFinite(openingMinutes) || !Number.isFinite(closingMinutes)) return true;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (closingMinutes > openingMinutes) {
    return nowMinutes >= openingMinutes && nowMinutes <= closingMinutes;
  }
  return nowMinutes >= openingMinutes || nowMinutes <= closingMinutes;
};
