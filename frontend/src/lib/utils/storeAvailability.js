const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const parseTimeToMinutes = (timeText) => {
  if (!timeText || typeof timeText !== "string") return null;
  const normalized = timeText.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3] || null;

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "PM" && hours !== 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
};

const isTimeWithinWindow = (currentMinutes, openingMinutes, closingMinutes) => {
  if (
    !Number.isFinite(currentMinutes) ||
    !Number.isFinite(openingMinutes) ||
    !Number.isFinite(closingMinutes)
  ) {
    return false;
  }

  if (closingMinutes === openingMinutes) return true;
  if (closingMinutes > openingMinutes) {
    return currentMinutes >= openingMinutes && currentMinutes <= closingMinutes;
  }
  return currentMinutes >= openingMinutes || currentMinutes <= closingMinutes;
};

const normalizeOutletTimings = (outletTimings) => {
  if (Array.isArray(outletTimings)) return outletTimings;
  if (Array.isArray(outletTimings?.timings)) return outletTimings.timings;
  return [];
};

export const evaluateStoreAvailability = ({
  store,
  outletTimings = null,
  at = new Date(),
  label = "Restaurant",
} = {}) => {
  if (!store || typeof store !== "object") {
    return { isAvailable: false, reason: `${label} details are unavailable.` };
  }

  if (store.isActive === false) {
    return { isAvailable: false, reason: `${label} is inactive right now.` };
  }

  if (store.isAcceptingOrders === false) {
    return { isAvailable: false, reason: `${label} is offline and not accepting orders.` };
  }

  const currentDayName = WEEK_DAYS[at.getDay()];
  const currentMinutes = at.getHours() * 60 + at.getMinutes();

  const timings = normalizeOutletTimings(outletTimings);
  const dayTiming = timings.find(
    (entry) => String(entry?.day || "").toLowerCase() === currentDayName.toLowerCase(),
  );

  if (dayTiming) {
    if (dayTiming.isOpen === false) {
      return { isAvailable: false, reason: `${label} is closed today.` };
    }

    const openingMinutes = parseTimeToMinutes(dayTiming.openingTime);
    const closingMinutes = parseTimeToMinutes(dayTiming.closingTime);
    if (
      Number.isFinite(openingMinutes) &&
      Number.isFinite(closingMinutes) &&
      !isTimeWithinWindow(currentMinutes, openingMinutes, closingMinutes)
    ) {
      return { isAvailable: false, reason: `${label} is currently closed.` };
    }

    return { isAvailable: true, reason: "" };
  }

  const openDays = Array.isArray(store?.openDays) ? store.openDays : [];
  if (openDays.length > 0) {
    const dayOpen = openDays.some(
      (day) => String(day || "").slice(0, 3).toLowerCase() === currentDayName.slice(0, 3).toLowerCase(),
    );
    if (!dayOpen) {
      return { isAvailable: false, reason: `${label} is closed today.` };
    }
  }

  const openingMinutes = parseTimeToMinutes(store?.deliveryTimings?.openingTime);
  const closingMinutes = parseTimeToMinutes(store?.deliveryTimings?.closingTime);
  if (
    Number.isFinite(openingMinutes) &&
    Number.isFinite(closingMinutes) &&
    !isTimeWithinWindow(currentMinutes, openingMinutes, closingMinutes)
  ) {
    return { isAvailable: false, reason: `${label} is currently closed.` };
  }

  return { isAvailable: true, reason: "" };
};
