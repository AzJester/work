import assert from "node:assert/strict";
import test from "node:test";
import {
  addBusinessDays, businessDaysBetween, businessDaysIn, federalHolidayOn, federalHolidays, formatDate, formatDateLong, isBusinessDay,
  makeCalendar, nextBusinessDay, observedDate, offDayReason, prevBusinessDay, weekday, zonedInstant,
} from "../proposal-war-room/src/lib/calendar.ts";
import {
  DEFAULT_SETTINGS, MILESTONE_IDS, MINIMUMS, applyPlan, calendarFor, countdownTo, defaultKickoff, diffSchedules, emptySchedule,
  internalSubmitDate, lockMilestone, milestoneDays, nextMilestone, normalizeSettings, planSchedule, unlockMilestone,
} from "../proposal-war-room/src/lib/scheduler.ts";
import { foldLine, scheduleCsv, scheduleIcs, toCsv } from "../proposal-war-room/src/lib/exports.ts";
import { newPursuit } from "../proposal-war-room/src/lib/model.ts";
import { replan } from "../proposal-war-room/src/lib/pursuit-ops.ts";

// The calendar under the Proposal War Room scheduler. Every plan is counted in business days, so a wrong holiday
// moves a color team review without anyone noticing. These tests pin the federal calendar and the planning rules.

const settings = (patch = {}) => normalizeSettings({ ...structuredClone(DEFAULT_SETTINGS), ...patch });
const get = (milestones, id) => milestones.find(item => item.id === id);
const dates = milestones => Object.fromEntries(milestones.filter(item => !item.dropped).map(item => [item.id, item.start === item.end ? item.start : `${item.start}..${item.end}`]));
/** A plan with a kickoff that is already on the books, the way every re-plan after the first one runs. */
const plan = ({ kickoff, due, today = kickoff, patch = {}, current, compressionKey = null }) => planSchedule({
  dueDate: due, rfpReleaseDate: "", today, settings: settings(patch),
  current: current ?? [{ id: "kickoff", start: kickoff, end: kickoff, locked: false, dropped: false }], compressionKey,
});

test("federal holidays fall on the right days, with Saturday and Sunday holidays observed on the weekday beside them", () => {
  const observed = year => Object.fromEntries(federalHolidays(year).map(holiday => [holiday.name, holiday.observed]));
  assert.deepEqual(observed(2027), {
    "New Year's Day": "2027-01-01",
    "Birthday of Martin Luther King, Jr.": "2027-01-18",
    "Washington's Birthday": "2027-02-15",
    "Memorial Day": "2027-05-31",
    "Juneteenth National Independence Day": "2027-06-18",
    "Independence Day": "2027-07-05",
    "Labor Day": "2027-09-06",
    "Columbus Day": "2027-10-11",
    "Veterans Day": "2027-11-11",
    "Thanksgiving Day": "2027-11-25",
    "Christmas Day": "2027-12-24",
  });
  assert.equal(observed(2026)["Independence Day"], "2026-07-03", "4 July 2026 is a Saturday, observed the Friday before");
  assert.equal(observed(2026)["Thanksgiving Day"], "2026-11-26");
  assert.equal(observed(2030)["Memorial Day"], "2030-05-27");
  assert.equal(observed(2030)["Thanksgiving Day"], "2030-11-28");
  assert.equal(observed(2024)["Washington's Birthday"], "2024-02-19");
  assert.equal(observed(2023)["Veterans Day"], "2023-11-10", "11 November 2023 is a Saturday");
  assert.equal(observedDate("2027-07-04"), "2027-07-05");
  assert.equal(observedDate("2027-12-25"), "2027-12-24");
});

test("a holiday observed in the neighboring year still closes that day", () => {
  // 1 January 2028 is a Saturday, so the federal government observes it on Friday 31 December 2027.
  assert.equal(weekday("2028-01-01"), 6);
  assert.equal(federalHolidayOn("2027-12-31"), "New Year's Day (observed)");
  assert.equal(isBusinessDay("2027-12-31"), false);
  assert.equal(addBusinessDays("2027-12-30", 1), "2028-01-03");
  // 1 January 2023 was a Sunday, observed on Monday 2 January.
  assert.equal(federalHolidayOn("2023-01-02"), "New Year's Day (observed)");
});

test("holidays are computed for any year, and only from the year each became law", () => {
  assert.equal(federalHolidays(2020).some(holiday => holiday.name.startsWith("Juneteenth")), false);
  assert.equal(federalHolidays(2021).find(holiday => holiday.name.startsWith("Juneteenth")).observed, "2021-06-18");
  assert.equal(federalHolidays(1985).some(holiday => holiday.name.includes("King")), false);
  assert.equal(federalHolidays(2041).length, 11);
  for (const year of [2031, 2038, 2045]) {
    for (const holiday of federalHolidays(year)) assert.ok(weekday(holiday.observed) >= 1 && weekday(holiday.observed) <= 5, `${holiday.name} ${year} is observed on a weekday`);
  }
});

test("business-day arithmetic skips weekends, holidays and blackout days", () => {
  assert.equal(addBusinessDays("2027-01-15", 1), "2027-01-19", "Friday to Tuesday across the King holiday");
  assert.equal(addBusinessDays("2027-01-19", -1), "2027-01-15");
  assert.equal(addBusinessDays("2027-01-16", 0), "2027-01-16", "zero steps returns the date as given");
  assert.equal(businessDaysBetween("2027-01-15", "2027-01-19"), 1);
  assert.equal(businessDaysBetween("2027-01-19", "2027-01-15"), -1);
  assert.equal(businessDaysBetween("2026-12-01", "2027-01-15"), 31);
  assert.equal(businessDaysIn("2027-01-11", "2027-01-15"), 5);
  assert.equal(businessDaysIn("2027-01-16", "2027-01-18"), 0, "a weekend and a holiday hold no business day");
  assert.equal(nextBusinessDay("2027-07-03"), "2027-07-06");
  assert.equal(prevBusinessDay("2027-07-05"), "2027-07-02");
  assert.equal(offDayReason("2027-01-18"), "Birthday of Martin Luther King, Jr.");
  assert.equal(offDayReason("2027-01-17"), "Weekend");
  assert.equal(offDayReason("2027-01-19"), null);

  const company = makeCalendar([{ date: "2026-12-24", label: "Company holiday" }, { date: "2026-12-31", label: "" }]);
  assert.equal(offDayReason("2026-12-24", company), "Company holiday");
  assert.equal(offDayReason("2026-12-31", company), "Company blackout");
  assert.equal(addBusinessDays("2026-12-23", 1, company), "2026-12-28", "the blackout, Christmas Day and the weekend are all skipped");
  assert.equal(businessDaysBetween("2026-12-23", "2027-01-04", company), 4, "28, 29 and 30 December, then 4 January");
});

test("acceptance 1: due Tuesday 19 January 2027 gives internal submit Friday 15 January 2027", () => {
  assert.equal(formatDateLong("2027-01-19"), "Tuesday, January 19, 2027");
  assert.equal(federalHolidayOn("2027-01-18"), "Birthday of Martin Luther King, Jr.");
  const internal = internalSubmitDate("2027-01-19", settings());
  assert.equal(internal, "2027-01-15");
  assert.equal(formatDateLong(internal), "Friday, January 15, 2027");
});

test("acceptance 2: due Tuesday 6 July 2027 gives internal submit Friday 2 July 2027", () => {
  assert.equal(weekday("2027-07-04"), 0, "4 July 2027 is a Sunday");
  assert.equal(federalHolidayOn("2027-07-05"), "Independence Day (observed)");
  const internal = internalSubmitDate("2027-07-06", settings());
  assert.equal(internal, "2027-07-02");
  assert.equal(formatDateLong(internal), "Friday, July 2, 2027");
});

test("the buffer is configurable and can be turned off", () => {
  assert.equal(internalSubmitDate("2027-01-19", settings({ bufferDays: 2 })), "2027-01-14");
  assert.equal(internalSubmitDate("2027-01-19", settings({ bufferEnabled: false })), "2027-01-19");
  const off = plan({ kickoff: "2026-12-01", due: "2027-01-19", patch: { bufferEnabled: false } });
  assert.equal(get(off.milestones, "internalSubmit").start, "2027-01-19");
  assert.equal(get(off.milestones, "production").end, "2027-01-15", "production ends the business day before internal submit");
});

test("a first plan starts at the RFP release date, or today once that has passed", () => {
  const calendar = calendarFor(settings());
  assert.equal(defaultKickoff("2026-12-05", "2026-11-30", calendar), "2026-12-07", "a Saturday release moves to Monday");
  assert.equal(defaultKickoff("2026-11-02", "2026-11-30", calendar), "2026-11-30", "a release in the past plans from today");
  assert.equal(defaultKickoff("", "2026-11-26", calendar), "2026-11-27", "Thanksgiving Day is not a business day");
  const first = planSchedule({ dueDate: "2027-01-19", rfpReleaseDate: "2026-12-01", today: "2026-11-30", settings: settings(), current: [] });
  assert.equal(first.kickoff, "2026-12-01");
  assert.deepEqual(first.milestones.map(item => item.id), MILESTONE_IDS, "ten milestones, in order");
});

test("proportional mode places the milestones at 15, 35, 65 and 85 percent of the window", () => {
  const result = plan({ kickoff: "2026-12-01", due: "2027-01-19" });
  assert.equal(result.windowDays, 31);
  assert.equal(result.needsCompression, false);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(dates(result.milestones), {
    kickoff: "2026-12-01",
    storyboards: "2026-12-08",
    pink: "2026-12-16",
    pinkRecovery: "2026-12-17..2026-12-29",
    red: "2026-12-30",
    redRecovery: "2026-12-31..2027-01-07",
    gold: "2027-01-08",
    production: "2027-01-11..2027-01-14",
    internalSubmit: "2027-01-15",
    due: "2027-01-19",
  });
  const calendar = calendarFor(settings());
  assert.equal(milestoneDays(get(result.milestones, "pinkRecovery"), calendar), 8);
  assert.equal(milestoneDays(get(result.milestones, "redRecovery"), calendar), 5, "New Year's Day is not counted");
  assert.equal(milestoneDays(get(result.milestones, "production"), calendar), 4);
});

test("fixed mode counts business days back from internal submit: 22, 16, 8 and 3", () => {
  const result = plan({ kickoff: "2026-12-01", due: "2027-01-19", patch: { mode: "fixed" } });
  assert.equal(result.needsCompression, false);
  assert.deepEqual(dates(result.milestones), {
    kickoff: "2026-12-01",
    storyboards: "2026-12-14",
    pink: "2026-12-22",
    pinkRecovery: "2026-12-23..2027-01-04",
    red: "2027-01-05",
    redRecovery: "2027-01-06..2027-01-11",
    gold: "2027-01-12",
    production: "2027-01-13..2027-01-14",
    internalSubmit: "2027-01-15",
    due: "2027-01-19",
  });
  const custom = plan({ kickoff: "2026-12-01", due: "2027-01-19", patch: { mode: "fixed", offsets: { storyboards: 20, pink: 15, red: 9, gold: 4 } } });
  assert.equal(get(custom.milestones, "gold").start, "2027-01-11");
  assert.equal(get(custom.milestones, "red").start, "2027-01-04");
});

test("a comfortable window never trips the minimums, in either mode", () => {
  for (const mode of ["proportional", "fixed"]) {
    for (const due of ["2027-03-01", "2027-04-15", "2027-06-30", "2027-09-08", "2027-12-01"]) {
      const result = plan({ kickoff: "2027-01-04", due, patch: { mode } });
      assert.equal(result.needsCompression, false, `${mode} ${due}`);
      const calendar = calendarFor(settings());
      assert.ok(milestoneDays(get(result.milestones, "pinkRecovery"), calendar) >= MINIMUMS.recoveryDays);
      assert.ok(milestoneDays(get(result.milestones, "redRecovery"), calendar) >= MINIMUMS.recoveryDays);
      assert.ok(milestoneDays(get(result.milestones, "production"), calendar) >= MINIMUMS.productionDays);
      const starts = result.milestones.map(item => item.start);
      assert.deepEqual([...starts].sort(), starts, "the milestones are in date order");
    }
  }
});

test("acceptance 3: a locked Red team date stays put when the due date moves, and everything unlocked is planned again", () => {
  const before = plan({ kickoff: "2026-12-01", due: "2027-01-19" });
  assert.equal(get(before.milestones, "red").start, "2026-12-30");
  const locked = lockMilestone(before.milestones, "red", "2027-01-05");
  assert.equal(get(locked, "red").locked, true);

  const around = plan({ kickoff: "2026-12-01", due: "2027-01-19", current: locked });
  assert.equal(get(around.milestones, "red").start, "2027-01-05");
  assert.equal(get(around.milestones, "pinkRecovery").end, "2027-01-04", "the recovery before a locked review runs up to it");
  assert.equal(get(around.milestones, "redRecovery").start, "2027-01-06");
  assert.equal(get(around.milestones, "pink").start, get(before.milestones, "pink").start, "locking one date moves no other review");

  // The amendment: due date slips from 19 January to 9 February 2027.
  const after = plan({ kickoff: "2026-12-01", due: "2027-02-09", current: around.milestones });
  const red = get(after.milestones, "red");
  assert.deepEqual([red.start, red.end, red.locked], ["2027-01-05", "2027-01-05", true], "Red does not move");
  for (const id of ["storyboards", "pink", "pinkRecovery", "redRecovery", "gold", "production", "internalSubmit", "due"]) {
    const was = get(around.milestones, id), now = get(after.milestones, id);
    assert.ok(was.start !== now.start || was.end !== now.end, `${id} is unlocked and was planned again`);
    assert.equal(now.locked, false);
  }
  assert.equal(get(after.milestones, "kickoff").start, "2026-12-01", "kickoff is the start of the window and has already happened");
  assert.equal(get(after.milestones, "internalSubmit").start, "2027-02-08");
  const rows = diffSchedules(around.milestones, after.milestones);
  assert.deepEqual(rows.filter(row => !row.changed).map(row => row.id), ["kickoff", "red"]);
  assert.equal(rows.find(row => row.id === "red").locked, true);
  assert.equal(rows.find(row => row.id === "due").before, "Tue 19 Jan 2027");
  assert.equal(rows.find(row => row.id === "due").after, "Tue 9 Feb 2027");

  const unlocked = plan({ kickoff: "2026-12-01", due: "2027-02-09", current: unlockMilestone(after.milestones, "red") });
  assert.notEqual(get(unlocked.milestones, "red").start, "2027-01-05", "an unlocked date returns to the plan");
});

test("a locked date that breaks the milestone order is flagged, not moved", () => {
  const base = plan({ kickoff: "2026-12-01", due: "2027-01-19" });
  const broken = plan({ kickoff: "2026-12-01", due: "2027-01-19", current: lockMilestone(base.milestones, "red", "2027-01-12") });
  assert.equal(get(broken.milestones, "red").start, "2027-01-12", "the locked date is kept");
  assert.equal(get(broken.milestones, "gold").start, "2027-01-08", "the plan does not quietly move Gold out of the way");
  const conflict = broken.issues.find(issue => issue.code === "order");
  assert.ok(conflict, "the order conflict is reported");
  assert.equal(conflict.lockedConflict, true);
  assert.match(conflict.message, /Gold team review on Fri 8 Jan 2027 does not come after Red team review \(locked\) on Tue 12 Jan 2027/);
  assert.equal(broken.needsCompression, true);
});

test("acceptance 4: a 12-business-day window raises the compressed-plan warning and lists exactly what changed", () => {
  // Kickoff Monday 4 January 2027, due Friday 22 January: internal submit Thursday 21 January, 12 business days on.
  const result = plan({ kickoff: "2027-01-04", due: "2027-01-22" });
  assert.equal(result.internalSubmit, "2027-01-21");
  assert.equal(result.windowDays, 12);
  assert.equal(result.needsCompression, true);
  const messages = result.nominalIssues.filter(issue => issue.severity === "error").map(issue => issue.message);
  assert.deepEqual(messages, [
    "Red recovery has 1 business day. The minimum is 2 business days.",
    "Final production has 1 business day. The minimum is 2 business days.",
  ]);
  // Nothing is squeezed silently: until a compressed plan is chosen, the plan on record is the standard one, flagged.
  assert.equal(result.used, null);
  assert.deepEqual(result.milestones, result.nominal);
  assert.deepEqual(result.issues, result.nominalIssues);

  assert.equal(result.options.length, 2);
  const [recommended, alternative] = result.options;
  assert.equal(recommended.key, "fold-pink");
  assert.equal(recommended.title, "Fold Pink into Red");
  assert.deepEqual(recommended.changes, [
    "Pink team review dropped. Its checks fold into Red team review.",
    "Pink recovery dropped with the Pink team review.",
    "Red team review moved from Thu 14 Jan 2027 to Tue 12 Jan 2027.",
    "Red recovery holds 2 business days. The standard plan left 1 business day.",
    "Gold team review moved from Tue 19 Jan 2027 to Fri 15 Jan 2027.",
    "Final production holds 2 business days. The standard plan left 1 business day.",
  ]);
  assert.deepEqual(dates(recommended.milestones), {
    kickoff: "2027-01-04", storyboards: "2027-01-06", red: "2027-01-12", redRecovery: "2027-01-13..2027-01-14",
    gold: "2027-01-15", production: "2027-01-19..2027-01-20", internalSubmit: "2027-01-21", due: "2027-01-22",
  });
  assert.deepEqual(recommended.milestones.filter(item => item.dropped).map(item => item.id), ["pink", "pinkRecovery"]);
  assert.ok(recommended.draftDays >= MINIMUMS.draftDays);
  assert.equal(alternative.key, "adjust", "keeping all three reviews is offered, second, because it leaves writers too little time");
  assert.ok(alternative.draftDays < MINIMUMS.draftDays);
  assert.deepEqual(alternative.milestones.filter(item => item.dropped), []);

  // Accepting the recommendation applies it and keeps the list of changes on record.
  const accepted = plan({ kickoff: "2027-01-04", due: "2027-01-22", compressionKey: "fold-pink" });
  assert.equal(accepted.used.key, "fold-pink");
  assert.deepEqual(accepted.issues.filter(issue => issue.severity === "error"), []);
  const state = applyPlan(emptySchedule(), accepted, "2027-01-04T15:00:00.000Z");
  assert.deepEqual(state.compression.changes, recommended.changes);
});

test("shorter windows drop or shorten more, and say so, until nothing fits", () => {
  const first = window => {
    const due = addBusinessDays("2027-03-01", window + 1);
    const result = plan({ kickoff: "2027-03-01", due });
    assert.equal(result.windowDays, window);
    return result;
  };
  assert.equal(first(20).needsCompression, false);
  assert.equal(first(16).options[0].key, "adjust", "sixteen days keep three reviews with three days to draft before Pink");
  assert.equal(first(13).options[0].key, "fold-pink");
  assert.equal(first(8).options[0].key, "fold-pink");
  assert.equal(first(7).options[0].key, "fold-pink-no-storyboards");
  assert.match(first(7).options[0].changes.join(" "), /Storyboards \/ annotated outline milestone dropped/);
  assert.equal(first(6).options[0].key, "short-recovery");
  assert.match(first(6).options[0].changes.join(" "), /Red recovery cut to 1 business day, below the 2-day minimum\./);
  assert.equal(first(5).options[0].key, "short-production");
  assert.match(first(5).options[0].changes.join(" "), /Final production cut to 1 business day, below the 2-day minimum\./);
  assert.equal(first(4).options[0].key, "single-review");
  assert.match(first(4).options[0].changes.join(" "), /Gold team review dropped/);
  assert.equal(first(3).options[0].key, "review-only");
  const none = first(2);
  assert.equal(none.needsCompression, true);
  assert.deepEqual(none.options, [], "no plan is invented for a window that cannot hold one");
  for (const window of [3, 4, 5, 6, 7, 8, 11, 13, 16]) {
    for (const option of first(window).options) {
      assert.deepEqual(option.issues.filter(issue => issue.severity === "error"), [], `${option.key} at ${window} days holds its own minimums`);
      assert.ok(option.changes.length > 0, "a compressed plan always says what it changed");
    }
  }
});

test("a fixed-offset plan that reaches back before kickoff is adjusted, not dropped", () => {
  // 20 business days cannot hold a storyboard milestone 22 days before internal submit.
  const due = addBusinessDays("2027-03-01", 21);
  const result = plan({ kickoff: "2027-03-01", due, patch: { mode: "fixed" } });
  assert.equal(result.needsCompression, true);
  assert.match(result.nominalIssues[0].message, /Storyboards \/ annotated outline due on .* does not come after Kickoff/);
  const adjusted = result.options.find(option => option.key === "adjust");
  assert.ok(adjusted);
  assert.deepEqual(adjusted.milestones.filter(item => item.dropped), []);
  assert.equal(adjusted.changes.length, 1, "only the storyboard date has to move");
  assert.match(adjusted.changes[0], /^Storyboards \/ annotated outline due moved from /);
});

test("a compressed plan never moves or drops a locked milestone", () => {
  const base = plan({ kickoff: "2027-01-04", due: "2027-01-22" });
  const result = plan({ kickoff: "2027-01-04", due: "2027-01-22", current: lockMilestone(base.milestones, "pink", "2027-01-07") });
  assert.deepEqual(result.options.map(option => option.key), ["adjust"], "Pink cannot be folded into Red while its date is locked");
  const pink = get(result.options[0].milestones, "pink");
  assert.deepEqual([pink.start, pink.dropped, pink.locked], ["2027-01-07", false, true]);
  assert.deepEqual(dates(result.options[0].milestones), {
    kickoff: "2027-01-04", storyboards: "2027-01-06", pink: "2027-01-07", pinkRecovery: "2027-01-08..2027-01-11", red: "2027-01-12",
    redRecovery: "2027-01-13..2027-01-14", gold: "2027-01-15", production: "2027-01-19..2027-01-20", internalSubmit: "2027-01-21", due: "2027-01-22",
  });

  // One day later there is no room left behind the locked date. No plan is offered, and none is forced.
  const stuck = plan({ kickoff: "2027-01-04", due: "2027-01-22", current: lockMilestone(base.milestones, "pink", "2027-01-08") });
  assert.equal(stuck.needsCompression, true);
  assert.deepEqual(stuck.options, []);
  assert.equal(get(stuck.milestones, "pink").start, "2027-01-08");
});

test("an accepted compressed plan falls away when the window grows back", () => {
  const short = plan({ kickoff: "2027-01-04", due: "2027-01-22", compressionKey: "fold-pink" });
  assert.equal(get(short.milestones, "pink").dropped, true);
  const longer = plan({ kickoff: "2027-01-04", due: "2027-03-01", current: short.milestones, compressionKey: "fold-pink" });
  assert.equal(longer.needsCompression, false);
  assert.equal(longer.used, null);
  assert.equal(get(longer.milestones, "pink").dropped, false, "Pink team review returns with the standard plan");
});

test("the countdown reads in business days", () => {
  const result = plan({ kickoff: "2026-12-01", due: "2027-01-19" });
  const calendar = calendarFor(settings());
  const red = countdownTo(get(result.milestones, "red"), "2026-12-21", calendar);
  assert.equal(red.text, "6 business days to Red team");
  assert.equal(red.caption, "business days to Red team");
  assert.equal(countdownTo(get(result.milestones, "red"), "2026-12-30", calendar).text, "Red team is today");
  assert.equal(countdownTo(get(result.milestones, "due"), "2027-01-15", calendar).text, "1 business day to the due date");
  assert.equal(nextMilestone(result.milestones, "2026-12-17", calendar).milestone.id, "red", "a recovery already under way is not the next milestone");
  assert.equal(nextMilestone(result.milestones, "2027-01-20", calendar), null);
});

test("the schedule exports as CSV and as an iCalendar file", () => {
  const pursuit = { ...newPursuit("Sentinel Range, Phase 2", "2026-11-30T15:00:00.000Z"), solicitationNumber: "W91CRB-27-R-0007", rfpReleaseDate: "2026-12-01" };
  const planned = replan(pursuit, "2026-11-30", "2026-11-30T15:00:00.000Z", "Schedule planned", "", { dueDate: "2027-01-19" }).pursuit;
  assert.equal(planned.dueDate, "2027-01-19");
  assert.equal(planned.changeLog.length, 1);

  const csv = scheduleCsv(planned);
  assert.ok(csv.startsWith("\uFEFFMilestone,Start,End,Business days,Locked,State,Note\r\n"));
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 11);
  assert.equal(lines[5], "Red team review,2026-12-30,2026-12-30,1,No,Planned,");
  assert.equal(lines[8], '"Final production",2027-01-11,2027-01-14,4,No,Planned,"Formatting, graphics, white glove check"'.replace('"Final production"', "Final production"));
  assert.equal(lines[10], "Due,2027-01-19,2027-01-19,1,No,Planned,2:00 PM Eastern Time");
  assert.equal(toCsv([["=SUM(A1)", "plain", 'say "hi"', "-12.5", "@cmd"]]), "\uFEFF'=SUM(A1),plain,\"say \"\"hi\"\"\",-12.5,'@cmd\r\n", "text a spreadsheet would run as a formula stays text");

  const ics = scheduleIcs(planned, "2026-11-30T15:00:00.000Z");
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 10);
  assert.match(ics, /DTSTART;VALUE=DATE:20261230\r\nDTEND;VALUE=DATE:20261231\r\nSUMMARY:Red team review: Sentinel Range\\, Phase 2\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270111\r\nDTEND;VALUE=DATE:20270115\r\nSUMMARY:Final production/, "an all-day span ends on the day after its last day");
  assert.match(ics, /DTSTART:20270119T190000Z\r\nSUMMARY:Proposal due 2:00 PM Eastern Time/, "2:00 PM Eastern in January is 19:00 UTC");
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, `no line is longer than 75 octets: ${line}`);
  assert.equal(foldLine("x".repeat(160)).split("\r\n ").length, 3);
  assert.equal(zonedInstant("2027-07-06", "14:00", "America/New_York"), Date.UTC(2027, 6, 6, 18, 0), "daylight time is four hours behind UTC");
  assert.equal(zonedInstant("2027-01-19", "14:00", "America/Phoenix"), Date.UTC(2027, 0, 19, 21, 0));
  assert.equal(formatDate("2027-01-15"), "Fri 15 Jan 2027");
});
