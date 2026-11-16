import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, "..");
const html = readFileSync(resolve(rootDir, "budget-planner.html"), "utf8");

function scriptById(id) {
  const match = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  assert.ok(match, `Expected a <script id="${id}"> block`);
  return match[1];
}

// The engine block is pure and browser-free, so it runs as-is inside a bare VM context.
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(scriptById("budget-engine"), sandbox);
const E = sandbox.BudgetEngine;
assert.ok(E, "The engine must export globalThis.BudgetEngine");
// Objects built inside the VM realm carry foreign prototypes, so compare them as plain JSON.
const plain = (value) => JSON.parse(JSON.stringify(value));

// The seed is defined inside the app script; evaluate only the seedDoc function source.
const appSource = html.split('<script id="budget-engine">')[1].split("</script>")[1];
const seedMatch = appSource.match(/function seedDoc\(unit\) \{[\s\S]*?\n  \}\n/);
assert.ok(seedMatch, "Expected seedDoc(unit) in the app script");
const seedDoc = vm.runInNewContext(`(${seedMatch[0]})`, { PAGE_UNIT: "USD" });

function doc(overrides) {
  return {
    version: 1, title: "Test", currency: "USD", startYear: 2026, endYear: 2027, asOf: "2026-07-17",
    budgets: { "2026": 1000, "2027": 0 },
    engines: [{ id: "a", name: "Alpha" }, { id: "b", name: "Bravo" }],
    blocks: [],
    ...overrides,
  };
}

test("parseISO accepts calendar dates only and reads them as UTC days", () => {
  assert.equal(E.parseISO("2026-07-17"), Date.UTC(2026, 6, 17));
  assert.ok(Number.isNaN(E.parseISO("2026-02-30")), "February 30 must be rejected");
  assert.ok(Number.isNaN(E.parseISO("2026-7-1")));
  assert.ok(Number.isNaN(E.parseISO("")));
  assert.ok(Number.isNaN(E.parseISO(null)));
  assert.equal(E.toISO(E.parseISO("2027-12-31")), "2027-12-31");
});

test("dayCount is inclusive on both ends and ignores DST", () => {
  assert.equal(E.dayCount(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 1)), 1);
  assert.equal(E.dayCount(Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 31)), 365);
  assert.equal(E.dayCount(Date.UTC(2028, 0, 1), Date.UTC(2028, 11, 31)), 366);
  assert.equal(E.dayCount(Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 1)), 0);
});

test("proRate splits a single-year block at the as-of day, with the as-of day planned", () => {
  const block = { cost: 100, start: "2026-07-01", end: "2026-07-10" };
  const { byYear, totalDays } = E.proRate(block, "2026-07-05", [2026, 2027]);
  assert.equal(totalDays, 10);
  assert.ok(Math.abs(byYear[2026].spent - 40) < 1e-9, "July 1 to 4 are spent");
  assert.ok(Math.abs(byYear[2026].planned - 60) < 1e-9, "July 5 to 10 are planned");
  assert.equal(byYear[2027], undefined);
});

test("proRate allocates a block across the year boundary by day", () => {
  const block = { cost: 365 + 365, start: "2026-01-01", end: "2027-12-31" };
  const { byYear } = E.proRate(block, "2027-01-01", [2026, 2027]);
  assert.ok(Math.abs(byYear[2026].spent - 365) < 1e-9);
  assert.equal(byYear[2026].planned, 0);
  assert.equal(byYear[2027].spent, 0);
  assert.ok(Math.abs(byYear[2027].planned - 365) < 1e-9);
});

test("proRate treats an as-of date before the block as all planned and after it as all spent", () => {
  const block = { cost: 90, start: "2026-03-01", end: "2026-03-30" };
  const before = E.proRate(block, "2026-01-01", [2026]).byYear[2026];
  const after = E.proRate(block, "2026-12-31", [2026]).byYear[2026];
  assert.equal(before.spent, 0);
  assert.ok(Math.abs(before.planned - 90) < 1e-9);
  assert.ok(Math.abs(after.spent - 90) < 1e-9);
  assert.equal(after.planned, 0);
});

test("proRate handles a one-day block and ignores backlog items", () => {
  const one = E.proRate({ cost: 500, start: "2026-07-17", end: "2026-07-17" }, "2026-07-17", [2026]).byYear[2026];
  assert.equal(one.spent, 0);
  assert.equal(one.planned, 500);
  const backlog = E.proRate({ cost: 500, start: null, end: null }, "2026-07-17", [2026]);
  assert.deepEqual(plain(backlog.byYear), {});
});

test("days outside the configured year range are not counted", () => {
  const block = { cost: 1000, start: "2025-12-01", end: "2026-01-31" };
  const { byYear } = E.proRate(block, "2026-01-01", [2026, 2027]);
  assert.equal(byYear[2025], undefined);
  assert.ok(Math.abs(byYear[2026].planned - (31 / 62) * 1000) < 1e-9);
});

test("rollupByYear reconciles spent plus planned to committed and budget minus committed to remaining", () => {
  const d = doc({
    blocks: [
      { id: "1", name: "x", engineId: "a", cost: 1001, start: "2026-07-10", end: "2026-07-22" },
      { id: "2", name: "y", engineId: "b", cost: 333, start: "2026-12-30", end: "2027-01-02" },
      { id: "3", name: "z", engineId: "b", cost: 777, start: null, end: null },
    ],
  });
  const { years, byYear, total } = E.rollupByYear(d);
  assert.deepEqual(plain(years), [2026, 2027]);
  for (const y of years) {
    assert.equal(byYear[y].spent + byYear[y].planned, byYear[y].committed, `year ${y} reconciles`);
    assert.equal(byYear[y].budget - byYear[y].committed, byYear[y].remaining);
    assert.ok(Number.isInteger(byYear[y].spent) && Number.isInteger(byYear[y].planned));
  }
  assert.equal(total.committed, 1001 + 333, "committed is exact and backlog cost stays out of it");
  assert.equal(total.spent + total.planned, total.committed);
  // 333 over four days splits 166.5 / 166.5; the leftover dollar goes to the earlier year.
  assert.equal(byYear[2026].committed, 1001 + 167);
  assert.equal(byYear[2027].committed, 166);
  assert.equal(byYear[2026].spent, Math.round(1001 * 7 / 13), "July 10 to 16 are spent");
});

test("allocateCommitted hands leftover dollars to the largest fractional shares, earlier year first", () => {
  const years = [2026, 2027, 2028];
  const split = { 2026: { spent: 10.2, planned: 0 }, 2027: { spent: 0, planned: 10.5 }, 2028: { spent: 0, planned: 10.3 } };
  assert.deepEqual(plain(E.allocateCommitted(split, years)), { 2026: 10, 2027: 11, 2028: 10 });
  const tie = { 2026: { spent: 0, planned: 0.5 }, 2027: { spent: 0, planned: 0.5 } };
  assert.deepEqual(plain(E.allocateCommitted(tie, years)), { 2026: 1, 2027: 0 });
  assert.deepEqual(plain(E.allocateCommitted({}, years)), {});
});

test("rollupByEngine reconciles per engine and keeps backlog separate", () => {
  const d = doc({
    blocks: [
      { id: "1", name: "x", engineId: "a", cost: 1001, start: "2026-07-10", end: "2026-07-22" },
      { id: "2", name: "y", engineId: "b", cost: 333, start: "2026-12-30", end: "2027-01-02" },
      { id: "3", name: "z", engineId: "b", cost: 777, start: null, end: null },
      { id: "4", name: "orphan", engineId: "nope", cost: 999, start: null, end: null },
    ],
  });
  const { rows, total } = E.rollupByEngine(d);
  assert.deepEqual(plain(rows.map((r) => r.engineId)), ["a", "b"]);
  for (const r of rows) assert.equal(r.spent + r.planned, r.committed);
  assert.equal(rows[0].committed, 1001);
  assert.equal(rows[0].backlog, 0);
  assert.equal(rows[1].committed, 333);
  assert.equal(rows[1].backlog, 777);
  assert.equal(total.backlog, 777, "blocks that point at a missing engine are ignored");
  assert.equal(E.backlogTotal(d), 777 + 999, "backlogTotal counts every undated block");
});

test("rounding drift stays within one dollar per cell and never breaks a row", () => {
  const blocks = [];
  for (let i = 0; i < 200; i += 1) {
    blocks.push({ id: String(i), name: "b" + i, engineId: i % 2 ? "a" : "b", cost: 7 + i * 13, start: "2026-01-01", end: "2026-12-31" });
  }
  const d = doc({ blocks });
  const year = E.rollupByYear(d);
  const engine = E.rollupByEngine(d);
  const totalCost = blocks.reduce((s, b) => s + b.cost, 0);
  assert.equal(year.total.committed, totalCost);
  assert.equal(engine.total.committed, totalCost);
  assert.ok(Math.abs(year.total.spent - engine.total.spent) <= d.engines.length);
});

test("stackLane places overlapping blocks on separate rows and reuses rows when free", () => {
  const blocks = [
    { id: "1", name: "A", start: "2026-01-01", end: "2026-03-31" },
    { id: "2", name: "B", start: "2026-01-01", end: "2026-03-31" },
    { id: "3", name: "C", start: "2026-04-01", end: "2026-04-30" },
    { id: "4", name: "D", start: "2026-03-31", end: "2026-05-01" },
    { id: "5", name: "E", start: null, end: null },
  ];
  const { placed, rows } = E.stackLane(blocks);
  const rowOf = Object.fromEntries(placed.map((p) => [p.block.id, p.row]));
  assert.equal(rows, 3);
  assert.equal(rowOf["1"], 0);
  assert.equal(rowOf["2"], 1);
  assert.equal(rowOf["4"], 2, "a block starting on the day another ends shares that day, so it needs a new row");
  assert.equal(rowOf["3"], 0, "a block starting after row 0 frees up reuses row 0");
  assert.equal(rowOf["5"], undefined, "backlog items are not stacked");
  assert.equal(E.stackLane([]).rows, 1);
});

test("validateDoc accepts the seed and normalizes unknown fields away", () => {
  const seed = seedDoc();
  seed.extra = "ignored";
  seed.blocks[0].color = "#ff0000";
  const result = E.validateDoc(seed);
  assert.ok(result.ok, result.errors.join("\n"));
  assert.equal(result.doc.extra, undefined);
  assert.equal(result.doc.blocks[0].color, undefined);
  assert.equal(result.doc.blocks.length, seed.blocks.length);
});

test("validateDoc rejects malformed documents with specific messages", () => {
  const cases = [
    [null, /not a planner document/],
    [[], /not a planner document/],
    [doc({ version: 2 }), /version/],
    [doc({ startYear: 2030, endYear: 2026 }), /before start year/],
    [doc({ startYear: 2000, endYear: 2026 }), /at most 10 years/],
    [doc({ asOf: "yesterday" }), /As-of date/],
    [doc({ budgets: { "2026": -5 } }), /Budget for 2026/],
    [doc({ budgets: { abc: 5 } }), /four-digit year/],
    [doc({ engines: [] }), /At least one engine/],
    [doc({ engines: [{ id: "a", name: "A" }, { id: "a", name: "B" }] }), /duplicated/],
    [doc({ blocks: [{ id: "1", name: "x", engineId: "zz", cost: 1, start: null, end: null }] }), /unknown engine/],
    [doc({ blocks: [{ id: "1", name: "x", engineId: "a", cost: 1.5, start: null, end: null }] }), /cost must be a whole number/],
    [doc({ blocks: [{ id: "1", name: "x", engineId: "a", cost: 10, actual: -1, start: "2026-01-01", end: "2026-01-02" }] }), /actual must be a whole number/],
    [doc({ unit: "days" }), /Unit must be USD or hours/],
    [doc({ blocks: [{ id: "1", name: "x", engineId: "a", cost: 1, start: "2026-01-01", end: null }] }), /both start and end/],
    [doc({ blocks: [{ id: "1", name: "x", engineId: "a", cost: 1, start: "2026-02-02", end: "2026-02-01" }] }), /ends before it starts/],
    [doc({ blocks: [{ id: "1", name: "x", engineId: "a", cost: 1, start: null, end: null }, { id: "1", name: "y", engineId: "a", cost: 1, start: null, end: null }] }), /repeats id/],
  ];
  for (const [input, pattern] of cases) {
    const result = E.validateDoc(input);
    assert.equal(result.ok, false);
    assert.equal(result.doc, null);
    assert.ok(result.errors.some((e) => pattern.test(e)), `expected ${pattern} in ${JSON.stringify(result.errors)}`);
  }
});

test("fmtMoney formats whole dollars with a leading sign", () => {
  assert.equal(E.fmtMoney(0), "$0");
  assert.equal(E.fmtMoney(1343616), "$1,343,616");
  assert.equal(E.fmtMoney(-239230), "-$239,230");
  assert.equal(E.fmtMoney(12.9), "$12");
});

test("fmtAmount formats hours with a unit suffix and falls back to dollars", () => {
  assert.equal(E.fmtAmount(1234, "hours"), "1,234 h");
  assert.equal(E.fmtAmount(-5, "hours"), "-5 h");
  assert.equal(E.fmtAmount(0, "hours"), "0 h");
  assert.equal(E.fmtAmount(99, "USD"), "$99");
  assert.equal(E.fmtAmount(99, "furlongs"), "$99");
});

test("a logged actual replaces the elapsed-schedule estimate and keeps the remaining estimate as planned", () => {
  const years = [2026, 2027];
  const block = { cost: 100, start: "2026-07-01", end: "2026-07-10" };
  const mid = E.proRate({ ...block, actual: 70 }, "2026-07-05", years).byYear[2026];
  assert.equal(mid.spent, 70);
  assert.equal(mid.planned, 30);
  const over = E.proRate({ ...block, actual: 120 }, "2026-07-05", years).byYear[2026];
  assert.equal(over.spent, 120, "an overrun shows as spent above the estimate");
  assert.equal(over.planned, 0);
  const future = E.proRate({ ...block, actual: 10 }, "2026-06-01", years).byYear[2026];
  assert.equal(future.spent, 10, "hours logged before the block starts still count as spent");
  assert.equal(future.planned, 90);
  const past = E.proRate({ ...block, actual: 40 }, "2026-12-01", years).byYear[2026];
  assert.equal(past.spent, 40);
  assert.equal(past.planned, 60, "a finished block with hours left in the estimate still forecasts them");
  const none = E.proRate({ ...block, actual: null }, "2026-07-05", years).byYear[2026];
  assert.ok(Math.abs(none.spent - 40) < 1e-9, "a null actual means the elapsed-schedule estimate");
});

test("a logged actual splits across years by elapsed and remaining days", () => {
  const years = [2026, 2027];
  const block = { cost: 100, actual: 50, start: "2026-12-30", end: "2027-01-02" };
  const { byYear } = E.proRate(block, "2027-01-01", years);
  assert.equal(byYear[2026].spent, 50, "all elapsed days are in 2026");
  assert.equal(byYear[2026].planned, 0);
  assert.equal(byYear[2027].spent, 0);
  assert.equal(byYear[2027].planned, 50, "all remaining days are in 2027");
  const rolled = E.rollupByYear(doc({ asOf: "2027-01-01", blocks: [{ id: "1", name: "x", engineId: "a", ...block }] }));
  assert.equal(rolled.byYear[2026].spent, 50);
  assert.equal(rolled.byYear[2027].planned, 50);
  assert.equal(rolled.total.committed, 100);
});

test("validateDoc carries unit and actual through and defaults them", () => {
  const plainDoc = E.validateDoc(doc({ blocks: [{ id: "1", name: "x", engineId: "a", cost: 10, start: "2026-01-01", end: "2026-01-02" }] }));
  assert.ok(plainDoc.ok);
  assert.equal(plainDoc.doc.unit, "USD");
  assert.equal(plainDoc.doc.blocks[0].actual, null);
  const hours = E.validateDoc(doc({ unit: "hours", blocks: [{ id: "1", name: "x", engineId: "a", cost: 10, actual: 4, start: "2026-01-01", end: "2026-01-02" }] }));
  assert.ok(hours.ok, hours.errors.join("\n"));
  assert.equal(hours.doc.unit, "hours");
  assert.equal(hours.doc.blocks[0].actual, 4);
});

test("the hours sample is the plan in hours with two blocks logged and no dollars", () => {
  const hours = seedDoc("hours");
  assert.equal(hours.unit, "hours");
  const result = E.validateDoc(hours);
  assert.ok(result.ok, result.errors.join("\n"));
  const b01 = hours.blocks.find((b) => b.id === "b01");
  assert.equal(b01.cost, 1200);
  assert.equal(b01.actual, 640);
  const engine = E.rollupByEngine(result.doc);
  const core = engine.rows.find((r) => r.engineId === "core");
  assert.equal(core.spent, 640, "worked hours come from the logged figure");
  assert.equal(core.planned, 560, "forecast is the estimate still to be worked");
  const year = E.rollupByYear(result.doc);
  const scheduledEstimate = result.doc.blocks.filter(E.isScheduled).reduce((s, b) => s + Math.max(b.cost, b.actual || 0), 0);
  assert.equal(year.total.committed, scheduledEstimate);
  assert.equal(year.byYear[2026].budget, 13436);
  assert.equal(E.backlogTotal(result.doc), 2010);
  assert.equal(seedDoc("USD").unit, "USD");
});

test("the seed plan reproduces the reference screenshot totals", () => {
  const seed = seedDoc();
  const engine = E.rollupByEngine(seed);
  const byId = Object.fromEntries(engine.rows.map((r) => [r.engineId, r]));
  // Committed and backlog are exact because they are sums of whole-dollar costs.
  assert.deepEqual(
    plain(engine.rows.map((r) => [r.engineId, r.committed, r.backlog])),
    [["core", 120000, 0], ["horizon", 226939, 81000], ["colossus", 0, 120000], ["meridian", 796111, 0], ["ai", 336000, 0], ["ops", 103796, 0]],
  );
  // Spent and planned match where the reference dates could be recovered exactly.
  assert.equal(byId.core.spent, 59341);
  assert.equal(byId.core.planned, 60659);
  assert.equal(byId.horizon.spent, 160270);
  assert.equal(byId.horizon.planned, 66669);
  assert.equal(byId.meridian.spent, 547285);
  assert.equal(byId.meridian.planned, 248826);
  // The reference's AI Initiative and Operations splits imply dates outside 2026; the seed keeps them inside and lands within $40.
  assert.ok(Math.abs(byId.ai.spent - 181310) <= 40);
  assert.ok(Math.abs(byId.ops.spent - 96450) <= 5);
  const year = E.rollupByYear(seed);
  assert.equal(year.byYear[2026].budget, 1343616);
  assert.equal(year.byYear[2026].committed, 1582846);
  assert.equal(year.byYear[2026].remaining, -239230);
  assert.equal(year.byYear[2027].committed, 0);
  assert.equal(year.total.committed, 1582846);
  assert.equal(E.backlogTotal(seed), 201000);
});

test("the page keeps the Astrion hard rules in its static markup", () => {
  const headings = [...html.matchAll(/<(h[1-3]|th)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2].replace(/<[^>]+>/g, "").trim());
  assert.ok(headings.length > 5);
  for (const text of headings) assert.ok(!/\.$/.test(text), `heading ends in a period: ${text}`);
  const title = html.match(/<title>([^<]*)<\/title>/)[1].trim();
  assert.ok(!title.endsWith("."));
  assert.ok(!html.includes("—"), "no em dashes in the page");
  assert.ok(/font-family:"Archivo"/.test(html) && /font-family:"JetBrains Mono"/.test(html), "brand fonts are declared");
  assert.ok(!/Space Grotesk/.test(html), "the wordmark is the outlined SVG, not live Space Grotesk");
  for (const retired of ["#102A47", "#33C7EB", "#38DBF0", "#DEFBFD", "#090A0B", "#0E0F11", "#1C1E22", "#3E3F41", "#8E8E8D", "#7F848E", "#E7E5DF"]) {
    assert.ok(!html.toUpperCase().includes(retired), `retired palette value ${retired} must not appear`);
  }
  assert.ok(!/<link[^>]+href="https?:/.test(html) && !/<script[^>]+src="https?:/.test(html), "no CDN or third-party resources");
});
