// Display helpers. All dates are shown in Philippine time (UTC+8, no daylight saving).
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export const formatWatts = (w: number) => (w >= 100 ? Math.round(w).toLocaleString('en-US') : w.toFixed(1));

export const formatKw = (w: number) => (w >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`);

export const formatKwh = (kwh: number) => (kwh >= 100 ? kwh.toFixed(0) : kwh >= 10 ? kwh.toFixed(1) : kwh.toFixed(2));

export const formatPeso = (amount: number) =>
  '₱' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A Date whose UTC fields read as Philippine wall-clock time. */
export const manilaClock = (instant: number = Date.now()) => new Date(instant + MANILA_OFFSET_MS);

/** The real instant of a Philippine wall-clock time. */
export const manilaInstant = (year: number, month: number, day: number, hour = 0) =>
  new Date(Date.UTC(year, month, day, hour) - MANILA_OFFSET_MS);

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-11-12" */
export const dayKey = (clock: Date) => `${clock.getUTCFullYear()}-${pad(clock.getUTCMonth() + 1)}-${pad(clock.getUTCDate())}`;
/** "2026-11-12T09" */
export const hourKey = (clock: Date) => `${dayKey(clock)}T${pad(clock.getUTCHours())}`;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const hourLabel = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
