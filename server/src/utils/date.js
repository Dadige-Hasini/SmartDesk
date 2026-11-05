/**
 * SmartDesk Server Date & Time Utility
 * 
 * Manages timezone conversions between canonical UTC server storage
 * and the college local timezone: Asia/Kolkata (IST, UTC+05:30).
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Format a UTC Date, timestamp or ISO string into readable Asia/Kolkata (IST) display format.
 * Example output: "24 Oct 2026, 05:30 PM IST"
 * 
 * @param {string|Date|number} dateInput
 * @param {Intl.DateTimeFormatOptions} [customOptions]
 * @returns {string}
 */
export function formatToIST(dateInput, customOptions = {}) {
  if (!dateInput) return '—';
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '—';

    const defaultOptions = {
      timeZone: IST_TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
      ...customOptions,
    };

    return new Intl.DateTimeFormat('en-IN', defaultOptions).format(date);
  } catch {
    return String(dateInput);
  }
}

/**
 * Format date-only in Asia/Kolkata (e.g. "24 Oct 2026")
 * 
 * @param {string|Date|number} dateInput
 * @returns {string}
 */
export function formatDateOnlyIST(dateInput) {
  return formatToIST(dateInput, {
    hour: undefined,
    minute: undefined,
    timeZoneName: undefined,
  });
}

/**
 * Format time-only in Asia/Kolkata (e.g. "05:30 PM")
 * 
 * @param {string|Date|number} dateInput
 * @returns {string}
 */
export function formatTimeOnlyIST(dateInput) {
  return formatToIST(dateInput, {
    day: undefined,
    month: undefined,
    year: undefined,
    timeZoneName: undefined,
  });
}

/**
 * Convert UTC timestamp to ISO string with explicit +05:30 Indian Standard Time offset.
 * Example: "2026-10-24T17:30:00+05:30"
 * 
 * @param {string|Date|number} [dateInput=new Date()]
 * @returns {string}
 */
export function toIstIsoString(dateInput = new Date()) {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  // IST is exactly UTC + 5 hours and 30 minutes (330 minutes)
  const istOffsetMs = 330 * 60 * 1000;
  const istTime = new Date(date.getTime() + istOffsetMs);
  const iso = istTime.toISOString();
  return `${iso.slice(0, 19)}+05:30`;
}
