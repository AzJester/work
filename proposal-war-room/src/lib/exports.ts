// Plain exports: comma-separated values and an iCalendar file. No icons, no brand marks: icons stay inside the app.

import { addDays, formatDate, zonedInstant } from "./calendar.ts";
import { timeZoneLabel } from "./model.ts";
import type { Pursuit } from "./model.ts";
import { calendarFor, MILESTONES, milestoneDays } from "./scheduler.ts";

/** One CSV cell. Text that a spreadsheet would run as a formula is kept as text. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 rows with a byte order mark, so a spreadsheet reads the file as UTF-8. */
export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return `\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** "2:00 PM" from "14:00". */
export function formatTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${hours < 12 ? "AM" : "PM"}`;
}

export function scheduleCsv(pursuit: Pursuit): string {
  const calendar = calendarFor(pursuit.schedule.settings);
  const rows: unknown[][] = [["Milestone", "Start", "End", "Business days", "Locked", "State", "Note"]];
  for (const def of MILESTONES) {
    const item = pursuit.schedule.milestones.find(entry => entry.id === def.id);
    if (!item) continue;
    const note = def.id === "due" ? `${formatTime(pursuit.dueTime)} ${timeZoneLabel(pursuit.timeZone)}` : def.note;
    rows.push(item.dropped
      ? [def.label, "", "", "", "No", "Dropped", note]
      : [def.label, item.start, item.end, def.kind === "point" ? 1 : milestoneDays(item, calendar), item.locked ? "Yes" : "No", "Planned", note]);
  }
  return toCsv(rows);
}

const icsText = (value: string): string => value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const compact = (date: string): string => date.replace(/-/g, "");
const utcStamp = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** Folds a content line at 75 octets, as RFC 5545 asks, without splitting a character. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "", size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/**
 * The schedule as an iCalendar file. Reviews and work spans are all-day events. The due date carries its time,
 * written in UTC so no time zone table has to travel with the file.
 */
export function scheduleIcs(pursuit: Pursuit, nowISO: string): string {
  const stamp = utcStamp(Date.parse(nowISO));
  const name = pursuit.name || "Proposal";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Astrion//Proposal War Room//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(`${name} proposal schedule`)}`];
  for (const def of MILESTONES) {
    const item = pursuit.schedule.milestones.find(entry => entry.id === def.id);
    if (!item || item.dropped) continue;
    const details = [pursuit.solicitationNumber ? `Solicitation ${pursuit.solicitationNumber}` : "", def.note, item.locked ? "Date set by hand" : ""].filter(Boolean).join(". ");
    lines.push("BEGIN:VEVENT", `UID:${pursuit.id}-${def.id}@proposal-war-room`, `DTSTAMP:${stamp}`);
    const instant = def.id === "due" ? zonedInstant(item.start, pursuit.dueTime, pursuit.timeZone) : null;
    if (instant !== null) {
      lines.push(`DTSTART:${utcStamp(instant)}`, `SUMMARY:${icsText(`Proposal due ${formatTime(pursuit.dueTime)} ${timeZoneLabel(pursuit.timeZone)}: ${name}`)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(item.start)}`, `DTEND;VALUE=DATE:${compact(addDays(item.end, 1))}`, `SUMMARY:${icsText(`${def.label}: ${name}`)}`, "TRANSP:TRANSPARENT");
    }
    if (details) lines.push(`DESCRIPTION:${icsText(`${details}.`)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** The change log as rows, newest first. */
export function changeLogCsv(pursuit: Pursuit): string {
  const rows: unknown[][] = [["Recorded", "Kind", "Amendment", "Amendment date", "Title", "Detail"]];
  for (const entry of [...pursuit.changeLog].reverse()) rows.push([entry.at, entry.kind, entry.amendmentNumber, entry.amendmentDate, entry.title, entry.detail]);
  return toCsv(rows);
}

export { formatDate };
