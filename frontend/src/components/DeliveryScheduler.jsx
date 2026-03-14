import React, { useState, useEffect, useMemo, useRef } from "react";
import { Calendar, Clock, Truck, ChevronDown } from "lucide-react";
import {
  format,
  setHours,
  setMinutes,
  isAfter,
  addMinutes,
  addDays,
  isSameDay,
  startOfDay,
} from "date-fns";

const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const parseTimeToMinutes = (timeText) => {
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
  } else {
    if (hours < 0 || hours > 23) return null;
  }

  return hours * 60 + minutes;
};

const parseSlotTimeToMinutes = (timeValue, periodValue) => {
  if (!timeValue || typeof timeValue !== "string") return null;
  const normalizedTime = timeValue.trim();
  const normalizedPeriod = String(periodValue || "").trim().toUpperCase();
  if (!normalizedPeriod || (normalizedPeriod !== "AM" && normalizedPeriod !== "PM")) return null;
  return parseTimeToMinutes(`${normalizedTime} ${normalizedPeriod}`);
};

const formatMinutesToLabel = (totalMinutes) => {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const date = setHours(setMinutes(new Date(), minute), hour24);
  return format(date, "hh:mm a");
};

const toSlotValue = (startMinutes, endMinutes) => {
  const to24 = (mins) => {
    const normalized = ((mins % 1440) + 1440) % 1440;
    const h = String(Math.floor(normalized / 60)).padStart(2, "0");
    const m = String(normalized % 60).padStart(2, "0");
    return `${h}:${m}`;
  };
  return `${to24(startMinutes)}-${to24(endMinutes)}`;
};

const DeliveryScheduler = ({ type = "food", onScheduleChange, restaurantSchedule = null }) => {
  const [deliveryType, setDeliveryType] = useState("now"); // 'now' | 'scheduled'
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const dateInputRef = useRef(null);
  const upcomingDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(new Date(), index)),
    [],
  );
  const selectedDayName = WEEK_DAYS[selectedDate.getDay()];
  const selectedDayShort = format(selectedDate, "EEE").toLowerCase();

  const resolvedWorkingHours = useMemo(() => {
    const outletTimings = Array.isArray(restaurantSchedule?.outletTimings)
      ? restaurantSchedule.outletTimings
      : [];
    const outletDay = outletTimings.find(
      (timing) => String(timing?.day || "").toLowerCase() === selectedDayName.toLowerCase(),
    );

    if (outletDay) {
      const openMinutes = parseTimeToMinutes(outletDay.openingTime);
      const closeMinutes = parseTimeToMinutes(outletDay.closingTime);
      const slots = Array.isArray(outletDay?.slots) ? outletDay.slots : [];
      const slotWindows = slots
        .map((slot) => {
          const startMinutes = parseSlotTimeToMinutes(slot?.start, slot?.startPeriod);
          const endMinutes = parseSlotTimeToMinutes(slot?.end, slot?.endPeriod);
          if (startMinutes === null || endMinutes === null) return null;
          return { startMinutes, endMinutes };
        })
        .filter(Boolean);
      return {
        isOpen:
          Boolean(outletDay.isOpen) &&
          (slotWindows.length > 0 || (openMinutes !== null && closeMinutes !== null)),
        openMinutes,
        closeMinutes,
        slotWindows,
      };
    }

    const openDays = Array.isArray(restaurantSchedule?.openDays)
      ? restaurantSchedule.openDays
      : [];
    const hasOpenDays = openDays.length > 0;
    const dayIsOpen = hasOpenDays
      ? openDays.some((day) => {
          const normalized = String(day || "").trim().toLowerCase();
          return (
            normalized === selectedDayName.toLowerCase() ||
            normalized === selectedDayShort
          );
        })
      : true;

    const openMinutes = parseTimeToMinutes(restaurantSchedule?.deliveryTimings?.openingTime);
    const closeMinutes = parseTimeToMinutes(restaurantSchedule?.deliveryTimings?.closingTime);
    const hasTimings = openMinutes !== null && closeMinutes !== null;

    return {
      isOpen: dayIsOpen,
      openMinutes: hasTimings ? openMinutes : 8 * 60,
      closeMinutes: hasTimings ? closeMinutes : 22 * 60,
      slotWindows: [],
    };
  }, [restaurantSchedule, selectedDayName, selectedDayShort]);
  
  const availableTimeSlots = useMemo(() => {
    const slots = [];
    const now = new Date();
    const isToday = isSameDay(selectedDate, now);

    if (!resolvedWorkingHours.isOpen) return slots;

    const windows = Array.isArray(resolvedWorkingHours.slotWindows) && resolvedWorkingHours.slotWindows.length > 0
      ? resolvedWorkingHours.slotWindows.map((window) => {
          let startMinutes = window.startMinutes;
          let endMinutes = window.endMinutes;
          if (endMinutes <= startMinutes) {
            endMinutes += 24 * 60;
          }
          return { startMinutes, endMinutes };
        })
      : (() => {
          let openingMinutes = resolvedWorkingHours.openMinutes;
          let closingMinutes = resolvedWorkingHours.closeMinutes;
          if (openingMinutes === null || closingMinutes === null) {
            openingMinutes = 8 * 60;
            closingMinutes = 22 * 60;
          }
          if (closingMinutes <= openingMinutes) {
            closingMinutes += 24 * 60;
          }
          return [{ startMinutes: openingMinutes, endMinutes: closingMinutes }];
        })();

    const slotDurationMinutes = 120; // 2-hour windows
    const slotStepMinutes = 60; // 1-hour start step

    const dayStart = startOfDay(selectedDate);
    const nowWithBuffer = type === "food" ? addMinutes(now, 60) : now;

    windows.forEach(({ startMinutes, endMinutes }) => {
      for (
        let slotStartMinutes = startMinutes;
        slotStartMinutes + slotDurationMinutes <= endMinutes;
        slotStartMinutes += slotStepMinutes
      ) {
        const slotEndMinutes = slotStartMinutes + slotDurationMinutes;
        const slotStartDate = addMinutes(dayStart, slotStartMinutes);

        if (isToday && isAfter(nowWithBuffer, slotStartDate)) {
          continue;
        }

        slots.push({
          label: `${formatMinutesToLabel(slotStartMinutes)} - ${formatMinutesToLabel(slotEndMinutes)}`,
          value: toSlotValue(slotStartMinutes, slotEndMinutes),
        });
      }
    });

    return slots;
  }, [selectedDate, type, resolvedWorkingHours]);
  const selectedSlotLabel =
    availableTimeSlots.find((slot) => slot.value === selectedTimeSlot)?.label || "";

  const normalizedSelectedTimeSlot = availableTimeSlots.some(
    (slot) => slot.value === selectedTimeSlot,
  )
    ? selectedTimeSlot
    : "";


  // Notify parent
  useEffect(() => {
    onScheduleChange({
      deliveryType,
      deliveryDate: deliveryType === "scheduled" ? selectedDate : null,
      deliveryTimeSlot: deliveryType === "scheduled" ? normalizedSelectedTimeSlot : null,
    });
  }, [deliveryType, selectedDate, normalizedSelectedTimeSlot, onScheduleChange]);

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-orange-50 mb-4 dark:bg-[#151a23] dark:border-white/10">
      <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2 dark:text-gray-100">
        <Truck className="w-5 h-5 text-[#ff8100]" />
        Delivery Options
      </h3>

      {/* Main Toggles */}
      <div className="flex gap-4 mb-6">
        <div
          onClick={() => setDeliveryType("now")}
          className={`flex-1 p-4 rounded-xl border relative cursor-pointer transition-all flex items-center justify-between ${deliveryType === "now"
            ? "border-[#ff8100] bg-white shadow-sm ring-1 ring-[#ff8100] dark:bg-[#0f172a]"
            : "border-gray-200 bg-white text-gray-400 opacity-60 hover:opacity-100 dark:bg-[#0f172a] dark:text-gray-500 dark:border-white/10"
            }`}
        >
          <div>
            <span
              className={`block text-sm font-bold ${deliveryType === "now" ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"
                }`}
            >
              Deliver Now
            </span>
            <span className="text-[10px] text-gray-400 font-medium">
              8-12 mins
            </span>
          </div>
          <div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${deliveryType === "now" ? "border-[#ff8100]" : "border-gray-300 dark:border-white/30"
              }`}
          >
            {deliveryType === "now" && <div className="w-2.5 h-2.5 bg-[#ff8100] rounded-full" />}
          </div>
        </div>

        <div
          onClick={() => setDeliveryType("scheduled")}
          className={`flex-1 p-4 rounded-xl border relative cursor-pointer transition-all flex items-center justify-between ${deliveryType === "scheduled"
            ? "border-[#ff8100] bg-orange-50/10 shadow-sm ring-1 ring-[#ff8100] dark:bg-orange-500/10"
            : "border-gray-200 bg-white text-gray-400 opacity-60 hover:opacity-100 dark:bg-[#0f172a] dark:text-gray-500 dark:border-white/10"
            }`}
        >
          <div>
            <span
              className={`block text-sm font-bold ${deliveryType === "scheduled" ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"
                }`}
            >
              Schedule
            </span>
            <span className="text-[10px] text-gray-400 font-medium">
              Select time
            </span>
          </div>
          <div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${deliveryType === "scheduled" ? "border-[#ff8100]" : "border-gray-300 dark:border-white/30"
              }`}
          >
            {deliveryType === "scheduled" && <div className="w-2.5 h-2.5 bg-[#ff8100] rounded-full" />}
          </div>
        </div>
      </div>

      {/* Schedule Options */}
      {deliveryType === "scheduled" && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          {/* Date */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1 dark:text-gray-400">
              <Calendar className="w-3.5 h-3.5" /> Select Date
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
              {upcomingDates.map((dateOption) => {
                const active = isSameDay(dateOption, selectedDate);
                return (
                  <button
                    key={format(dateOption, "yyyy-MM-dd")}
                    type="button"
                    onClick={() => setSelectedDate(dateOption)}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${
                      active
                        ? "border-[#ff8100] bg-orange-50 text-orange-900 dark:bg-orange-500/10 dark:text-orange-100"
                        : "border-gray-200 bg-white text-gray-700 hover:border-orange-300 dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-300 dark:hover:border-orange-400/60"
                    }`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {format(dateOption, "EEE")}
                    </p>
                    <p className="text-sm font-bold">{format(dateOption, "d MMM")}</p>
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <button
                type="button"
                className="w-full flex items-center justify-between bg-orange-50/50 border border-orange-200 text-orange-900 rounded-xl px-4 py-3 shadow-sm hover:border-[#ff8100] transition-colors dark:bg-orange-500/10 dark:border-orange-400/40 dark:text-orange-100"
                onClick={() => {
                  const input = dateInputRef.current;
                  if (!input) return;
                  if (typeof input.showPicker === "function") {
                    try {
                      input.showPicker();
                      return;
                    } catch {
                      // Fall back to click() when showPicker is blocked
                    }
                  }
                  input.click();
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="bg-[#ff8100] p-2 rounded-lg text-white">
                    <Calendar size={18} />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">Date</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {format(selectedDate, "EEE, MMM d")}
                    </span>
                  </div>
                </div>
                <ChevronDown size={16} className="text-orange-400" />
              </button>
              <input
                ref={dateInputRef}
                type="date"
                className="absolute -z-10 opacity-0 pointer-events-none w-0 h-0"
                value={
                  !isNaN(selectedDate.getTime())
                    ? format(selectedDate, "yyyy-MM-dd")
                    : ""
                }
                min={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  const [year, month, day] = String(rawValue)
                    .split("-")
                    .map((value) => Number(value));
                  if (
                    Number.isInteger(year) &&
                    Number.isInteger(month) &&
                    Number.isInteger(day)
                  ) {
                    // Parse as local date to avoid UTC timezone shifts.
                    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
                    if (!isNaN(date.getTime())) {
                      setSelectedDate(date);
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* Time Slot */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1 dark:text-gray-400">
              <Clock className="w-3.5 h-3.5" /> Select Time Slot
            </p>
            {availableTimeSlots.length === 0 ? (
              <div className="w-full bg-gray-50 border border-gray-200 text-gray-600 text-sm rounded-xl p-3 dark:bg-white/5 dark:border-white/10 dark:text-gray-300">
                No slots available for this date
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {availableTimeSlots.map((slot) => {
                  const isSelected = normalizedSelectedTimeSlot === slot.value;
                  return (
                    <button
                      key={slot.value}
                      type="button"
                      onClick={() => setSelectedTimeSlot(slot.value)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 border text-sm font-medium transition-colors ${
                        isSelected
                          ? "border-[#ff8100] bg-orange-50 text-orange-900 dark:bg-orange-500/10 dark:text-orange-100"
                          : "border-gray-200 bg-white text-gray-800 hover:border-orange-300 dark:border-white/10 dark:bg-[#0f172a] dark:text-gray-200 dark:hover:border-orange-400/60"
                      }`}
                    >
                      {slot.label}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedSlotLabel && (
              <p className="mt-2 text-xs font-medium text-gray-600 break-words dark:text-gray-400">
                Selected: {selectedSlotLabel}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryScheduler;
