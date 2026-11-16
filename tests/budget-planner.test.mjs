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
const seedMatch = appSource.match(/function seedDoc\(\) \{[\s\S]*?\n  \}\n/);
assert.ok(seedMatch, "Expected seedDoc() in the app script");
const seedDoc = vm.runInNewContext(`(${seedMatch[0]})`, {});

function doc(overrides) {
  return {
    version: 2, title: "Test", currency: "USD", rate: 102, startYear: 2026, endYear: 2027, asOf: "2026-07-17",
    hoursBudgets: { "2026": 1000 }, budgets: { "2026": 100000 },
    engines: [{ id: "a", name: "Alpha" }, { id: "b", name: "Bravo" }],
    blocks: [],
    ...overrides,
  };
}
function block(overrides) {
  return { id: "1", name: "x", engineId: "a", hours: 0, hoursActual: null, materials: 0, materialsActual: null, start: null, end: null, ...overrides };
}
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, message || `${actual} should be ${expected}`);

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

test("proRate splits hours and materials at the as-of day, with the as-of day forecast", () => {
  const b = block({ hours: 100, materials: 1000, start: "2026-07-01", end: "2026-07-10" });
  const { byYear, totalDays } = E.proRate(b, "2026-07-05", [2026, 2027]);
  assert.equal(totalDays, 10);
  near(byYear[2026].hoursSpent, 40, "July 1 to 4 are worked");
  near(byYear[2026].hoursPlanned, 60, "July 5 to 10 are forecast");
  near(byYear[2026].materialsSpent, 400);
  near(byYear[2026].materialsPlanned, 600);
  assert.equal(byYear[2027], undefined);
});

test("proRate allocates a block across the year boundary by day", () => {
  const b = block({ hours: 730, start: "2026-01-01", end: "2027-12-31" });
  const { byYear } = E.proRate(b, "2027-01-01", [2026, 2027]);
  near(byYear[2026].hoursSpent, 365);
  assert.equal(byYear[2026].hoursPlanned, 0);
  assert.equal(byYear[2027].hoursSpent, 0);
  near(byYear[2027].hoursPlanned, 365);
});

test("proRate treats an as-of date before the block as all forecast and after it as all worked", () => {
  const b = block({ hours: 90, start: "2026-03-01", end: "2026-03-30" });
  const before = E.proRate(b, "2026-01-01", [2026]).byYear[2026];
  const after = E.proRate(b, "2026-12-31", [2026]).byYear[2026];
  assert.equal(before.hoursSpent, 0);
  near(before.hoursPlanned, 90);
  near(after.hoursSpent, 90);
  assert.equal(after.hoursPlanned, 0);
});

test("proRate handles a one-day block and ignores backlog items", () => {
  const one = E.proRate(block({ hours: 500, start: "2026-07-17", end: "2026-07-17" }), "2026-07-17", [2026]).byYear[2026];
  assert.equal(one.hoursSpent, 0);
  assert.equal(one.hoursPlanned, 500);
  const backlog = E.proRate(block({ hours: 500 }), "2026-07-17", [2026]);
  assert.deepEqual(plain(backlog.byYear), {});
});

test("days outside the configured year range are not counted", () => {
  const b = block({ hours: 1000, start: "2025-12-01", end: "2026-01-31" });
  const { byYear } = E.proRate(b, "2026-01-01", [2026, 2027]);
  assert.equal(byYear[2025], undefined);
  near(byYear[2026].hoursPlanned, (31 / 62) * 1000);
});

test("logged hours replace the elapsed-schedule estimate and keep the remaining estimate as forecast", () => {
  const years = [2026, 2027];
  const base = { hours: 100, start: "2026-07-01", end: "2026-07-10" };
  const mid = E.proRate(block({ ...base, hoursActual: 70 }), "2026-07-05", years).byYear[2026];
  assert.equal(mid.hoursSpent, 70);
  assert.equal(mid.hoursPlanned, 30);
  const over = E.proRate(block({ ...base, hoursActual: 120 }), "2026-07-05", years).byYear[2026];
  assert.equal(over.hoursSpent, 120, "an overrun shows as worked above the estimate");
  assert.equal(over.hoursPlanned, 0);
  const future = E.proRate(block({ ...base, hoursActual: 10 }), "2026-06-01", years).byYear[2026];
  assert.equal(future.hoursSpent, 10, "hours logged before the block starts still count as worked");
  assert.equal(future.hoursPlanned, 90);
  const past = E.proRate(block({ ...base, hoursActual: 40 }), "2026-12-01", years).byYear[2026];
  assert.equal(past.hoursSpent, 40);
  assert.equal(past.hoursPlanned, 60, "a finished block with hours left in the estimate still forecasts them");
  const none = E.proRate(block(base), "2026-07-05", years).byYear[2026];
  near(none.hoursSpent, 40, "no logged figure means the elapsed-schedule estimate");
});

test("materials spent to date behave the same way and are independent of logged hours", () => {
  const years = [2026, 2027];
  const b = block({ hours: 100, hoursActual: 70, materials: 1000, materialsActual: 250, start: "2026-07-01", end: "2026-07-10" });
  const split = E.proRate(b, "2026-07-05", years).byYear[2026];
  assert.equal(split.hoursSpent, 70);
  assert.equal(split.hoursPlanned, 30);
  assert.equal(split.materialsSpent, 250);
  assert.equal(split.materialsPlanned, 750);
  const unlogged = E.proRate(block({ hours: 100, hoursActual: 70, materials: 1000, start: "2026-07-01", end: "2026-07-10" }), "2026-07-05", years).byYear[2026];
  near(unlogged.materialsSpent, 400, "unlogged materials still pro-rate by day even when hours are logged");
  const over = E.proRate(block({ materials: 1000, materialsActual: 1300, start: "2026-07-01", end: "2026-07-10" }), "2026-07-05", years).byYear[2026];
  assert.equal(over.materialsSpent, 1300);
  assert.equal(over.materialsPlanned, 0);
});

test("a logged figure splits across years by elapsed and remaining days", () => {
  const years = [2026, 2027];
  const b = block({ hours: 100, hoursActual: 50, start: "2026-12-30", end: "2027-01-02" });
  const { byYear } = E.proRate(b, "2027-01-01", years);
  assert.equal(byYear[2026].hoursSpent, 50, "all elapsed days are in 2026");
  assert.equal(byYear[2026].hoursPlanned, 0);
  assert.equal(byYear[2027].hoursSpent, 0);
  assert.equal(byYear[2027].hoursPlanned, 50, "all remaining days are in 2027");
  const rolled = E.rollupByYear(doc({ asOf: "2027-01-01", blocks: [b] }));
  assert.equal(rolled.byYear[2026].hours.spent, 50);
  assert.equal(rolled.byYear[2027].hours.planned, 50);
  assert.equal(rolled.total.hours.committed, 100);
});

test("rollupByYear reconciles hours, materials and cost, and leaves remaining unset without a budget", () => {
  const d = doc({
    blocks: [
      block({ id: "1", hours: 1001, start: "2026-07-10", end: "2026-07-22" }),
      block({ id: "2", engineId: "b", hours: 333, materials: 400, start: "2026-12-30", end: "2027-01-02" }),
      block({ id: "3", engineId: "b", hours: 777, materials: 50 }),
    ],
  });
  const { years, byYear, total } = E.rollupByYear(d);
  assert.deepEqual(plain(years), [2026, 2027]);
  for (const y of years) {
    const { hours, materials, cost } = byYear[y];
    assert.equal(hours.spent + hours.planned, hours.committed, `hours ${y} reconcile`);
    assert.equal(materials.spent + materials.planned, materials.committed, `materials ${y} reconcile`);
    assert.equal(cost.laborSpent + cost.laborPlanned, cost.labor);
    assert.equal(cost.labor + cost.materials, cost.committed);
    assert.equal(cost.spent + cost.planned, cost.committed);
    assert.equal(cost.labor, hours.committed * 102, "labor cost is the whole hours at the rate");
    assert.equal(cost.materials, materials.committed);
    for (const v of [hours.spent, hours.planned, materials.spent, materials.planned, cost.spent]) assert.ok(Number.isInteger(v));
  }
  assert.equal(total.hours.committed, 1001 + 333, "backlog hours stay out of the yearly totals");
  assert.equal(total.materials.committed, 400);
  // 333 hours over four days split 166.5 / 166.5; the leftover hour goes to the earlier year.
  assert.equal(byYear[2026].hours.committed, 1001 + 167);
  assert.equal(byYear[2027].hours.committed, 166);
  assert.equal(byYear[2026].hours.spent, Math.round(1001 * 7 / 13), "July 10 to 16 are worked");
  assert.equal(byYear[2026].materials.committed, 200);
  assert.equal(byYear[2027].materials.committed, 200);
  assert.equal(byYear[2026].hours.remaining, 1000 - 1168);
  assert.equal(byYear[2027].hours.budget, null);
  assert.equal(byYear[2027].hours.remaining, null, "no annual hours set means no remaining figure");
  assert.equal(byYear[2026].cost.committed, 1168 * 102 + 200);
  assert.equal(byYear[2026].cost.remaining, 100000 - (1168 * 102 + 200));
  assert.equal(byYear[2027].cost.remaining, null);
  assert.equal(total.cost.committed, 1334 * 102 + 400);
  assert.equal(total.hours.budget, 1000);
  assert.equal(total.cost.remaining, byYear[2026].cost.remaining, "the total remaining sums only the years with a budget");
});

test("allocateCommitted hands leftover units to the largest fractional shares, earlier year first", () => {
  const years = [2026, 2027, 2028];
  const split = { 2026: { spent: 10.2, planned: 0 }, 2027: { spent: 0, planned: 10.5 }, 2028: { spent: 0, planned: 10.3 } };
  assert.deepEqual(plain(E.allocateCommitted(split, years)), { 2026: 10, 2027: 11, 2028: 10 });
  const tie = { 2026: { spent: 0, planned: 0.5 }, 2027: { spent: 0, planned: 0.5 } };
  assert.deepEqual(plain(E.allocateCommitted(tie, years)), { 2026: 1, 2027: 0 });
  assert.deepEqual(plain(E.allocateCommitted({}, years)), {});
  const keyed = { 2026: { materialsSpent: 0.5, materialsPlanned: 0.2 }, 2027: { materialsSpent: 0, materialsPlanned: 0.3 } };
  assert.deepEqual(plain(E.allocateCommitted(keyed, years, "materialsSpent", "materialsPlanned")), { 2026: 1, 2027: 0 });
});

test("rollupByEngine reconciles per engine, prices labor at the rate and keeps backlog separate", () => {
  const d = doc({
    blocks: [
      block({ id: "1", hours: 1001, materials: 100, start: "2026-07-10", end: "2026-07-22" }),
      block({ id: "2", engineId: "b", hours: 333, start: "2026-12-30", end: "2027-01-02" }),
      block({ id: "3", engineId: "b", hours: 777, materials: 50 }),
      block({ id: "4", name: "orphan", engineId: "nope", hours: 999, materials: 5 }),
    ],
  });
  const { rows, total } = E.rollupByEngine(d);
  assert.deepEqual(plain(rows.map((r) => r.engineId)), ["a", "b"]);
  for (const r of rows) {
    assert.equal(r.hours.spent + r.hours.planned, r.hours.committed);
    assert.equal(r.materials.spent + r.materials.planned, r.materials.committed);
    assert.equal(r.cost.labor, r.hours.committed * 102);
    assert.equal(r.cost.committed, r.cost.labor + r.materials.committed);
  }
  assert.equal(rows[0].hours.committed, 1001);
  assert.equal(rows[0].materials.committed, 100);
  assert.equal(rows[0].cost.committed, 1001 * 102 + 100);
  assert.equal(rows[0].hours.backlog, 0);
  assert.equal(rows[1].hours.committed, 333);
  assert.equal(rows[1].hours.backlog, 777);
  assert.equal(rows[1].materials.backlog, 50);
  assert.equal(rows[1].cost.backlog, 777 * 102 + 50);
  assert.equal(total.hours.backlog, 777, "blocks that point at a missing engine are ignored");
  assert.deepEqual(plain(E.backlogTotal(d)), { hours: 777 + 999, materials: 55, cost: (777 + 999) * 102 + 55 }, "backlogTotal counts every undated block");
});

test("rounding drift stays within one unit per cell and never breaks a row", () => {
  const blocks = [];
  for (let i = 0; i < 200; i += 1) {
    blocks.push(block({ id: String(i), name: "b" + i, engineId: i % 2 ? "a" : "b", hours: 7 + i * 13, materials: i * 3, start: "2026-01-01", end: "2026-12-31" }));
  }
  const d = doc({ blocks });
  const year = E.rollupByYear(d);
  const engine = E.rollupByEngine(d);
  const totalHours = blocks.reduce((s, b) => s + b.hours, 0);
  const totalMaterials = blocks.reduce((s, b) => s + b.materials, 0);
  assert.equal(year.total.hours.committed, totalHours);
  assert.equal(engine.total.hours.committed, totalHours);
  assert.equal(year.total.materials.committed, totalMaterials);
  assert.equal(engine.total.materials.committed, totalMaterials);
  assert.ok(Math.abs(year.total.hours.spent - engine.total.hours.spent) <= d.engines.length);
  assert.equal(year.total.cost.committed, totalHours * 102 + totalMaterials);
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
  assert.equal(result.migrated, false);
  assert.equal(result.doc.extra, undefined);
  assert.equal(result.doc.blocks[0].color, undefined);
  assert.equal(result.doc.blocks.length, seed.blocks.length);
  assert.equal(result.doc.version, 2);
});

test("validateDoc rejects malformed documents with specific messages", () => {
  const cases = [
    [null, /not a planner document/],
    [[], /not a planner document/],
    [doc({ version: 3 }), /version/],
    [doc({ startYear: 2030, endYear: 2026 }), /before start year/],
    [doc({ startYear: 2000, endYear: 2026 }), /at most 10 years/],
    [doc({ asOf: "yesterday" }), /As-of date/],
    [doc({ budgets: { "2026": -5 } }), /Budget for 2026/],
    [doc({ hoursBudgets: { abc: 5 } }), /four-digit year/],
    [doc({ hoursBudgets: { "2026": 1.5 } }), /Annual hours for 2026/],
    [doc({ rate: -1 }), /Rate must be/],
    [doc({ rate: "102" }), /Rate must be/],
    [doc({ engines: [] }), /At least one engine/],
    [doc({ engines: [{ id: "a", name: "A" }, { id: "a", name: "B" }] }), /duplicated/],
    [doc({ blocks: [block({ engineId: "zz" })] }), /unknown engine/],
    [doc({ blocks: [block({ hours: 1.5 })] }), /hours must be a whole number/],
    [doc({ blocks: [block({ hours: 10, hoursActual: -1, start: "2026-01-01", end: "2026-01-02" })] }), /logged hours must be a whole number/],
    [doc({ blocks: [block({ materials: 2.5 })] }), /materials must be a whole number of dollars/],
    [doc({ blocks: [block({ materials: 10, materialsActual: "x", start: "2026-01-01", end: "2026-01-02" })] }), /materials spent must be a whole number/],
    [doc({ blocks: [block({ start: "2026-01-01", end: null })] }), /both start and end/],
    [doc({ blocks: [block({ start: "2026-02-02", end: "2026-02-01" })] }), /ends before it starts/],
    [doc({ blocks: [block({ id: "1" }), block({ id: "1", name: "y" })] }), /repeats id/],
  ];
  for (const [input, pattern] of cases) {
    const result = E.validateDoc(input);
    assert.equal(result.ok, false);
    assert.equal(result.doc, null);
    assert.ok(result.errors.some((e) => pattern.test(e)), `expected ${pattern} in ${JSON.stringify(result.errors)}`);
  }
});

test("validateDoc defaults missing figures, rounds the rate to cents and skips null budgets", () => {
  const result = E.validateDoc(doc({ rate: 102.126, hoursBudgets: { "2026": null, "2027": 20 }, blocks: [{ id: "1", name: "x", engineId: "a", start: "2026-01-01", end: "2026-01-02" }] }));
  assert.ok(result.ok, result.errors.join("\n"));
  assert.equal(result.doc.rate, 102.13);
  assert.deepEqual(plain(result.doc.hoursBudgets), { "2027": 20 });
  assert.deepEqual(plain(result.doc.blocks[0]), { id: "1", name: "x", engineId: "a", hours: 0, hoursActual: null, materials: 0, materialsActual: null, start: "2026-01-01", end: "2026-01-02" });
  const bare = E.validateDoc({ version: 2, startYear: 2026, endYear: 2026, engines: [{ id: "a", name: "A" }], blocks: [] });
  assert.ok(bare.ok, bare.errors.join("\n"));
  assert.equal(bare.doc.rate, 102);
  assert.deepEqual(plain(bare.doc.budgets), {});
});

test("version 1 plans from the hours and dollar editions migrate into hours and materials", () => {
  const hoursPlan = {
    version: 1, unit: "hours", rate: 90, startYear: 2026, endYear: 2026, asOf: "2026-03-01", budgets: { "2026": 500 },
    engines: [{ id: "a", name: "Alpha" }],
    blocks: [{ id: "x", name: "Legacy", engineId: "a", cost: 100, actual: 20, materials: 50, start: "2026-02-01", end: "2026-03-31" }],
  };
  const h = E.validateDoc(hoursPlan);
  assert.ok(h.ok, h.errors.join("\n"));
  assert.equal(h.migrated, true);
  assert.equal(h.doc.version, 2);
  assert.equal(h.doc.rate, 90);
  assert.deepEqual(plain(h.doc.hoursBudgets), { "2026": 500 }, "an hours plan's budgets are annual hours");
  assert.deepEqual(plain(h.doc.budgets), {});
  assert.deepEqual(plain(h.doc.blocks[0]), { id: "x", name: "Legacy", engineId: "a", hours: 100, hoursActual: 20, materials: 50, materialsActual: null, start: "2026-02-01", end: "2026-03-31" });
  const dollarPlan = {
    version: 1, unit: "USD", startYear: 2026, endYear: 2026, asOf: "2026-03-01", budgets: { "2026": 50000 },
    engines: [{ id: "a", name: "Alpha" }],
    blocks: [{ id: "y", name: "Legacy dollars", engineId: "a", cost: 10200, actual: 5100, start: "2026-02-01", end: "2026-03-31" }, { id: "z", name: "Backlog", engineId: "a", cost: 1020, start: null, end: null }],
  };
  const d = E.validateDoc(dollarPlan);
  assert.ok(d.ok, d.errors.join("\n"));
  assert.equal(d.migrated, true);
  assert.equal(d.doc.rate, 102, "a dollar plan without a rate converts at the default rate");
  assert.deepEqual(plain(d.doc.budgets), { "2026": 50000 }, "a dollar plan's budgets stay dollars");
  assert.deepEqual(plain(d.doc.hoursBudgets), {});
  assert.equal(d.doc.blocks[0].hours, 100, "labor dollars become hours at the rate");
  assert.equal(d.doc.blocks[0].hoursActual, 50);
  assert.equal(d.doc.blocks[0].materials, 0);
  assert.equal(d.doc.blocks[1].hours, 10);
  assert.equal(d.doc.blocks[1].hoursActual, null);
  const custom = E.migrateV1({ ...dollarPlan, rate: 100 });
  assert.equal(custom.blocks[0].hours, 102);
  const bad = E.validateDoc({ ...hoursPlan, blocks: [{ id: "x", name: "Legacy", engineId: "a", cost: "lots", start: null, end: null }] });
  assert.equal(bad.ok, false, "a broken version 1 block is still rejected after migration");
});

test("fmtMoney, fmtHours and fmtAmount format whole numbers with a sign and a unit", () => {
  assert.equal(E.fmtMoney(0), "$0");
  assert.equal(E.fmtMoney(1343616), "$1,343,616");
  assert.equal(E.fmtMoney(-239230), "-$239,230");
  assert.equal(E.fmtMoney(12.9), "$12");
  assert.equal(E.fmtHours(1234), "1,234 h");
  assert.equal(E.fmtHours(-5), "-5 h");
  assert.equal(E.fmtAmount(0, "hours"), "0 h");
  assert.equal(E.fmtAmount(99, "furlongs"), "$99");
});

test("the sample plan gives the reference hours, materials and cost totals", () => {
  const result = E.validateDoc(seedDoc());
  assert.ok(result.ok, result.errors.join("\n"));
  const d = result.doc;
  assert.equal(d.rate, 102);
  const year = E.rollupByYear(d);
  const y26 = year.byYear[2026];
  assert.deepEqual(plain(y26.hours), { budget: 13436, spent: 10535, planned: 5294, committed: 15829, remaining: -2393 });
  assert.deepEqual(plain(y26.materials), { budget: null, spent: 12370, planned: 8630, committed: 21000, remaining: null });
  assert.equal(y26.cost.labor, 15829 * 102);
  assert.equal(y26.cost.laborSpent, 10535 * 102);
  assert.equal(y26.cost.materials, 21000);
  assert.equal(y26.cost.committed, 1635558);
  assert.equal(y26.cost.remaining, 1700000 - 1635558);
  assert.equal(year.byYear[2027].hours.committed, 0);
  assert.equal(year.byYear[2027].cost.remaining, null, "2027 has no budget set");
  const engine = E.rollupByEngine(d);
  const core = engine.rows.find((r) => r.engineId === "core");
  assert.deepEqual(plain(core.hours), { spent: 640, planned: 560, committed: 1200, backlog: 0 }, "worked hours come from the logged figure");
  assert.deepEqual(plain(core.materials), { spent: 12000, planned: 6500, committed: 18500, backlog: 0 }, "materials spent come from the logged figure");
  assert.deepEqual(plain(core.cost), { labor: 122400, materials: 18500, committed: 140900, backlog: 0 });
  assert.equal(engine.total.cost.committed, year.total.cost.committed);
  assert.equal(engine.total.hours.committed, year.total.hours.committed);
  assert.deepEqual(plain(E.backlogTotal(d)), { hours: 2010, materials: 4000, cost: 2010 * 102 + 4000 });
  assert.equal(engine.total.cost.backlog, 209020);
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
