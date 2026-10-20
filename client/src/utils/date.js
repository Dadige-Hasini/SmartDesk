/**
 * SmartDesk Date & Time Utility
 *
 * Formats timestamps in the college local timezone (Asia/Kolkata - IST, UTC+05:30)
 * while preserving UTC timestamps on the server.
 */

const TIMEZONE = 'Asia/Kolkata';

/**
 * Format a date string into readable IST date and time.
 * Example: "20 Oct 2026, 06:45 PM IST"
 */
export function formatToIST(dateString, options = {}) {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';

    const defaultOptions = {
      timeZone: TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...options,
    };

    return new Intl.DateTimeFormat('en-IN', defaultOptions).format(date);
  } catch {
    return String(dateString);
  }
}

/**
 * Short date format in IST: "20 Oct 2026"
 */
export function formatDateOnlyIST(dateString) {
  return formatToIST(dateString, { hour: undefined, minute: undefined });
}

/**
 * Short time format in IST: "06:45 PM"
 */
export function formatTimeOnlyIST(dateString) {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Format relative time (e.g., "5m ago", "2h ago", "3d ago")
 */
export function formatRelativeIST(dateString) {
  if (!dateString) return '—';
  try {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return formatDateOnlyIST(dateString);
  } catch {
    return '—';
  }
}
