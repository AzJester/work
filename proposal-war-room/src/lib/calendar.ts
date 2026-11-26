// Business-day calendar: weekends, United States federal holidays with their observed dates, and a blackout list.
// Dates are civil dates written YYYY-MM-DD. Nothing here reads the clock or a time zone, so the same input always
// gives the same answer on every machine.

export type ISODate = string;

export interface Blackout {
  date: ISODate;
  label: string;
}

export interface Holiday {
  /** The day the holiday falls on. */
  actual: ISODate;
  /** The weekday the federal government observes it. Equal to `actual` unless that is a Saturday or a Sunday. */
  observed: ISODate;
  name: string;
}

export interface WorkCalendar {
  blackouts: ReadonlyMap<ISODate, string>;
}

const DAY_MS = 86_400_000;
const pad = (n: number): string => String(n).padStart(2, "0");

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toUTC(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function ymd(year: number, month: number, day: number): ISODate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

/** Calendar days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** 0 is Sunday, 6 is Saturday. */
export function weekday(date: ISODate): number {
  return new Date(toUTC(date)).getUTCDay();
}

export function isWeekend(date: ISODate): boolean {
  const day = weekday(date);
  return day === 0 || day === 6;
}

export function yearOf(date: ISODate): number {
  return Number(date.slice(0, 4));
}

/** The nth given weekday of a month, counting from 1. */
function nthWeekday(year: number, month: number, day: number, n: number): ISODate {
  const first = weekday(ymd(year, month, 1));
  return ymd(year, month, 1 + ((day - first + 7) % 7) + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, day: number): ISODate {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = weekday(ymd(year, month, lastDay));
  return ymd(year, month, lastDay - ((last - day + 7) % 7));
}

/** A Saturday holiday is observed the Friday before. A Sunday holiday is observed the Monday after. */
export function observedDate(actual: ISODate): ISODate {
  const day = weekday(actual);
  if (day === 6) return addDays(actual, -1);
  if (day === 0) return addDays(actual, 1);
  return actual;
}

/**
 * The federal holidays that fall in a year (5 U.S.C. 6103), with the day each is observed.
 * New Year's Day on a Saturday is observed on 31 December of the year before, so the observed date of a holiday can
 * sit in the neighboring year. Inauguration Day is left out: it applies to the Washington area only, and belongs in
 * the blackout list of a pursuit that needs it.
 */
export function federalHolidays(year: number): Holiday[] {
  const fixed = (month: number, day: number, name: string): Holiday => {
    const actual = ymd(year, month, day);
    return { actual, observed: observedDate(actual), name };
  };
  const floating = (actual: ISODate, name: string): Holiday => ({ actual, observed: actual, name });
  const list: Holiday[] = [fixed(1, 1, "New Year's Day")];
  if (year >= 1986) list.push(floating(nthWeekday(year, 1, 1, 3), "Birthday of Martin Luther King, Jr."));
  list.push(floating(nthWeekday(year, 2, 1, 3), "Washington's Birthday"));
  list.push(floating(lastWeekday(year, 5, 1), "Memorial Day"));
  if (year >= 2021) list.push(fixed(6, 19, "Juneteenth National Independence Day"));
  list.push(fixed(7, 4, "Independence Day"));
  list.push(floating(nthWeekday(year, 9, 1, 1), "Labor Day"));
  list.push(floating(nthWeekday(year, 10, 1, 2), "Columbus Day"));
  list.push(fixed(11, 11, "Veterans Day"));
  list.push(floating(nthWeekday(year, 11, 4, 4), "Thanksgiving Day"));
  list.push(fixed(12, 25, "Christmas Day"));
  return list;
}

const observedByYear = new Map<number, Map<ISODate, string>>();

/** Observed federal holidays that land in a year, by date. */
function observedIn(year: number): Map<ISODate, string> {
  let map = observedByYear.get(year);
  if (!map) {
    map = new Map();
    for (const source of [year - 1, year, year + 1]) {
      for (const holiday of federalHolidays(source)) {
        if (yearOf(holiday.observed) !== year) continue;
        map.set(holiday.observed, holiday.observed === holiday.actual ? holiday.name : `${holiday.name} (observed)`);
      }
    }
    observedByYear.set(year, map);
  }
  return map;
}

/** The federal holiday observed on a date, or null. */
export function federalHolidayOn(date: ISODate): string | null {
  return observedIn(yearOf(date)).get(date) ?? null;
}

export function makeCalendar(blackouts: readonly Blackout[] = []): WorkCalendar {
  const map = new Map<ISODate, string>();
  for (const entry of blackouts) {
    if (isISODate(entry.date)) map.set(entry.date, entry.label.trim() || "Company blackout");
  }
  return { blackouts: map };
}

export const FEDERAL_CALENDAR: WorkCalendar = makeCalendar();

/** Why a date is not a business day: the holiday or blackout name, or "Weekend". Null for a business day. */
export function offDayReason(date: ISODate, calendar: WorkCalendar = FEDERAL_CALENDAR): string | null {
  const holiday = federalHolidayOn(date);
  if (holiday) return holiday;
  const blackout = calendar.blackouts.get(date);
  if (blackout) return blackout;
  return isWeekend(date) ? "Weekend" : null;
}

export function isBusinessDay(date: ISODate, calendar: WorkCalendar = FEDERAL_CALENDAR): boolean {
  return offDayReason(date, calendar) === null;
}

/** The date itself when it is a business day, otherwise the next one. */
export function nextBusinessDay(date: ISODate, calendar: WorkCalendar = FEDERAL_CALENDAR): ISODate {
  let current = date;
  while (!isBusinessDay(current, calendar)) current = addDays(current, 1);
  return current;
}

/** The date itself when it is a business day, otherwise the one before. */
export function prevBusinessDay(date: ISODate, calendar: WorkCalendar = FEDERAL_CALENDAR): ISODate {
  let current = date;
  while (!isBusinessDay(current, calendar)) current = addDays(current, -1);
  return current;
}

/**
 * Steps a number of business days from a date. Positive moves later, negative earlier, and zero returns the date
 * unchanged. The start date does not have to be a business day, and it is never counted.
 */
export function addBusinessDays(date: ISODate, count: number, calendar: WorkCalendar = FEDERAL_CALENDAR): ISODate {
  const step = count < 0 ? -1 : 1;
  let remaining = Math.abs(Math.trunc(count));
  let current = date;
  while (remaining > 0) {
    current = addDays(current, step);
    if (isBusinessDay(current, calendar)) remaining -= 1;
  }
  return current;
}

/**
 * Business days from `a` to `b`: the days after `a`, up to and including `b`. Negative when `b` is earlier.
 * It is the count that addBusinessDays undoes when both ends are business days.
 */
export function businessDaysBetween(a: ISODate, b: ISODate, calendar: WorkCalendar = FEDERAL_CALENDAR): number {
  if (a === b) return 0;
  if (b < a) return -businessDaysBetween(b, a, calendar);
  let count = 0;
  for (let current = addDays(a, 1); current <= b; current = addDays(current, 1)) {
    if (isBusinessDay(current, calendar)) count += 1;
  }
  return count;
}

/** Business days inside a span, both ends included. Zero when the span is empty or runs backward. */
export function businessDaysIn(start: ISODate, end: ISODate, calendar: WorkCalendar = FEDERAL_CALENDAR): number {
  if (end < start) return 0;
  return businessDaysBetween(addDays(start, -1), end, calendar);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Fri 15 Jan 2027": the short form used in tables and exports. */
export function formatDate(date: ISODate | "" | null | undefined): string {
  if (!date || !isISODate(date)) return "";
  const [y, m, d] = date.split("-").map(Number);
  return `${DAYS[weekday(date)]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Friday, January 15, 2027": the long form used in sentences. */
export function formatDateLong(date: ISODate | "" | null | undefined): string {
  if (!date || !isISODate(date)) return "";
  const [y, m, d] = date.split("-").map(Number);
  return `${DAYS_LONG[weekday(date)]}, ${MONTHS_LONG[m - 1]} ${d}, ${y}`;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

/** The civil date in a time zone at an instant. With no zone, the machine's own. */
export function todayISO(now: Date = new Date(), timeZone?: string): ISODate {
  if (!timeZone) return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string): string => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The instant a wall-clock time in a time zone names, in milliseconds. Null when the inputs are not valid. */
export function zonedInstant(date: ISODate, time: string, timeZone: string): number | null {
  if (!isISODate(date)) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time || "");
  const hours = match ? Number(match[1]) : 23;
  const minutes = match ? Number(match[2]) : 59;
  if (hours > 23 || minutes > 59) return null;
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hours, minutes);
  const offsetAt = (instant: number): number | null => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).formatToParts(new Date(instant));
      const get = (type: string): number => Number(parts.find(part => part.type === type)?.value);
      return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant;
    } catch {
      return null;
    }
  };
  const first = offsetAt(wall);
  if (first === null) return null;
  const second = offsetAt(wall - first);
  return wall - (second ?? first);
}
