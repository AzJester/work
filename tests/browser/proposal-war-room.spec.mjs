import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The Proposal War Room, driven through its built page. The thirteen acceptance tests of its build specification
// are named in the test titles. Claude is never called from here: the server route is replaced by the reply Claude
// gave for the sample excerpt, recorded in proposal-war-room/fixtures/.

const APP = "../proposal-war-room/dist/";
const fixture = name => readFileSync(new URL(`../../proposal-war-room/fixtures/${name}`, import.meta.url));
const fixturePath = name => new URL(`../../proposal-war-room/fixtures/${name}`, import.meta.url).pathname;
const source = name => readFileSync(new URL(`../../proposal-war-room/src/assets/${name}`, import.meta.url), "utf8");
const SAMPLE = JSON.parse(fixture("sample-pursuit.json").toString());
const PARSE_REPLY = fixture("sample-parse-reply.json").toString();
const STATUS_REPLY = fixture("sample-status-reply.txt").toString();
const SUPABASE = "https://hqqwlkmggwgaoiyzgrhy.supabase.co";

/** Opens the app working on this device only, at a fixed date, with the worked sample pursuit when asked for. */
async function openDevice(page, { today = "2026-12-01", sample = false, route = "", theme = "dark" } = {}) {
  await page.clock.install({ time: new Date(`${today}T15:00:00Z`) });
  await page.addInitScript(([pursuit, startTheme]) => {
    if (localStorage.getItem("pwr:mode")) return;
    localStorage.setItem("pwr:mode", "device");
    localStorage.setItem("pwr:theme", startTheme);
    if (pursuit) {
      localStorage.setItem(`pwr:pursuit:${pursuit.id}`, JSON.stringify({ revision: 1, pursuit }));
      localStorage.setItem("pwr:index", JSON.stringify([{ id: pursuit.id, name: pursuit.name, solicitationNumber: pursuit.solicitationNumber, dueDate: pursuit.dueDate, updatedAt: pursuit.updatedAt }]));
    }
  }, [sample ? SAMPLE : null, theme]);
  await page.goto(`${APP}${route ? `#/${route}` : ""}`);
  await expect(page.locator('[data-region="nav"]')).toBeVisible();
}

async function newPursuit(page, name) {
  await page.getByRole("button", { name: "New pursuit" }).first().click();
  await page.locator('[data-dialog="new-pursuit"]').getByLabel("Pursuit name").fill(name);
  await page.getByRole("button", { name: "Create pursuit" }).click();
  await expect(page.locator('[data-view="setup"]')).toBeVisible();
}

const go = async (page, route) => { await page.locator(`a[data-nav="${route}"]`).click(); await expect(page.locator(`a[data-nav="${route}"]`)).toHaveAttribute("aria-current", "page"); };
const saved = page => expect(page.locator("[data-save-state]")).toHaveAttribute("data-save-state", "Saved");
const startOf = (page, milestone) => page.getByLabel(`${milestone} start`, { exact: true });

/** A stand-in for the Supabase project: sign-in, the pursuits table and the assistant route, all in memory. */
async function mockCloud(page, assist = async () => ({ text: PARSE_REPLY, stop_reason: "end_turn" })) {
  const state = { rows: new Map(), calls: [] };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };
  const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "pm@example.com", app_metadata: {}, user_metadata: {} };
  const part = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + 5 * 365 * 86400;
  const token = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: user.id, role: "authenticated", exp: expires })}.signature`;
  const json = (route, status, body) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: body === null ? "" : JSON.stringify(body) });
  await page.route(`${SUPABASE}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/auth/v1/token") return json(route, 200, { access_token: token, token_type: "bearer", expires_in: 5 * 365 * 86400, expires_at: expires, refresh_token: "refresh", user });
    if (url.pathname === "/auth/v1/user") return json(route, 200, user);
    if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/functions/v1/proposal-assist") {
      const body = request.postDataJSON();
      state.calls.push({ body, authorization: request.headers().authorization ?? "" });
      const reply = await assist(body, state.calls.length);
      return reply.error ? json(route, reply.status ?? 500, { error: reply.error, code: reply.code ?? "error" }) : json(route, 200, { contract_version: "proposal-assist-v1", action: body.action, model: "claude-opus-5-5", request_id: "test", ...reply });
    }
    if (url.pathname === "/rest/v1/proposal_pursuits") {
      const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, ""), revision = (url.searchParams.get("revision") ?? "").replace(/^eq\./, "");
      if (method === "GET" && id) { const row = state.rows.get(id); return json(route, 200, row ? [{ data: row.data, revision: row.revision }] : []); }
      if (method === "GET") return json(route, 200, [...state.rows.values()].map(row => ({ id: row.id, name: row.name, solicitation_number: row.solicitation_number, due_date: row.due_date, updated_at: row.updated_at })));
      if (method === "POST") { const body = request.postDataJSON(); state.rows.set(body.id, { ...body, revision: 1, updated_at: new Date().toISOString() }); return json(route, 201, null); }
      if (method === "PATCH") {
        const row = state.rows.get(id);
        if (!row || String(row.revision) !== revision) return json(route, 200, []);
        Object.assign(row, request.postDataJSON(), { updated_at: new Date().toISOString() });
        return json(route, 200, [{ revision: row.revision }]);
      }
      if (method === "DELETE") { state.rows.delete(id); return route.fulfill({ status: 204, headers: cors }); }
    }
    return json(route, 404, { message: "not mocked" });
  });
  state.token = token;
  return state;
}

async function signIn(page, { today = "2026-12-01" } = {}) {
  await page.clock.install({ time: new Date(`${today}T15:00:00Z`) });
  await page.goto(APP);
  await page.getByLabel("Email").fill("pm@example.com");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator('[data-region="nav"]')).toBeVisible();
}

/**
 * The brand rules a browser can measure, read from computed styles: palette values only, square corners, no shadow
 * or gradient, two typefaces, table text from 8 to 10 pt, titles without periods, sprite icons only, and one Ion
 * element in each screen region. Returns what breaks them.
 */
function brandAudit() {
  const problems = [];
  const probe = document.createElement("div");
  document.body.append(probe);
  const resolve = value => { probe.style.cssText = `color:${value}`; return getComputedStyle(probe).color; };
  const names = ["void", "carbon", "gunmetal", "bone", "steel", "ion", "flare", "paper"];
  const palette = new Map(names.map(name => [resolve(`var(--astrion-${name})`), name]));
  probe.style.cssText = "border-top:1px solid var(--hairline)";
  const hairline = getComputedStyle(probe).borderTopColor;
  probe.remove();
  const nameOf = value => palette.get(value);
  const light = document.documentElement.dataset.theme === "light";
  const clear = value => value === "rgba(0, 0, 0, 0)" || value === "transparent" || /\/ 0\)$/.test(value);
  const visible = el => { const box = el.getBoundingClientRect(), style = getComputedStyle(el); return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none"; };
  const label = el => `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).join(".")}` : ""}`;
  const ownText = el => [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());
  const ionPainted = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("[data-icon-sprite]") || !visible(el)) continue;
    const style = getComputedStyle(el), svg = el instanceof SVGElement;
    const checks = [];
    if (!svg || el.tagName === "svg") checks.push(["color", style.color, false]);
    if (!svg) checks.push(["background-color", style.backgroundColor, false]);
    for (const side of ["Top", "Right", "Bottom", "Left"]) if (parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== "none") checks.push([`border-${side.toLowerCase()}-color`, style[`border${side}Color`], true]);
    if (style.textDecorationLine !== "none") checks.push(["text-decoration-color", style.textDecorationColor, false]);
    if (el.tagName === "svg") { if (style.stroke !== "none") checks.push(["stroke", style.stroke, false]); if (style.fill !== "none") checks.push(["fill", style.fill, false]); }
    let ion = false;
    for (const [property, value, border] of checks) {
      if (clear(value)) continue;
      if (nameOf(value) === "ion") ion = true;
      if (!nameOf(value) && !(border && value === hairline)) problems.push(`color: ${label(el)} ${property} = ${value}`);
    }
    if (ion) ionPainted.add(el);
    if (!svg && ownText(el)) {
      const ink = nameOf(style.color);
      if (light && (ink === "steel" || ink === "ion")) problems.push(`light theme: ${label(el)} sets text in ${ink}`);
      const family = style.fontFamily.split(",")[0].trim().replace(/["']/g, "");
      if (family !== "Archivo" && family !== "JetBrains Mono") problems.push(`font: ${label(el)} uses ${family}`);
      let ground = el;
      while (ground && clear(getComputedStyle(ground).backgroundColor)) ground = ground.parentElement;
      if (ground && nameOf(getComputedStyle(ground).backgroundColor) === "ion" && ink !== "carbon") problems.push(`text on Ion: ${label(el)} is ${ink ?? style.color}, not Carbon`);
    }
    for (const corner of ["TopLeft", "TopRight", "BottomLeft", "BottomRight"]) if (parseFloat(style[`border${corner}Radius`]) > 0) { problems.push(`radius: ${label(el)}`); break; }
    if (style.boxShadow !== "none") problems.push(`shadow: ${label(el)}`);
    if (style.textShadow !== "none") problems.push(`text shadow: ${label(el)}`);
    if (style.backgroundImage !== "none") problems.push(`background image: ${label(el)} ${style.backgroundImage.slice(0, 40)}`);
    if (style.filter !== "none") problems.push(`filter: ${label(el)}`);
  }
  // One Ion element per region. Ion inside an Ion element is the same element.
  const regions = new Map();
  for (const el of ionPainted) {
    let parent = el.parentElement, nested = false;
    while (parent && !nested) { nested = ionPainted.has(parent); parent = parent.parentElement; }
    if (nested) continue;
    const region = el.closest("[data-region]")?.getAttribute("data-region") ?? "outside every region";
    regions.set(region, [...(regions.get(region) ?? []), label(el)]);
  }
  for (const [region, list] of regions) if (region === "outside every region" || list.length > 1) problems.push(`ion: ${region} shows ${list.join(", ")}`);
  for (const el of document.querySelectorAll("table *")) {
    if (!visible(el) || !(ownText(el) || ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName))) continue;
    const points = parseFloat(getComputedStyle(el).fontSize) * 0.75;
    if (points < 7.99 || points > 10.01) problems.push(`table text: ${label(el)} is ${points.toFixed(2)} pt`);
  }
  for (const el of document.querySelectorAll("h1,h2,h3,h4,h5,h6,th,caption,[role=heading],[role=tab],.page-title,.panel-title,.toast-title,.table-caption,.alert-title,.notice-head,title")) {
    const text = (el.innerText ?? el.textContent ?? "").trim();
    if (/\.$/.test(text)) problems.push(`title ends in a period: "${text.slice(0, 60)}"`);
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement || node.parentElement.closest("[data-icon-sprite], textarea, [data-user-text], script, style")) continue;
    const text = node.textContent;
    if (/[—–]/.test(text)) problems.push(`dash: "${text.trim().slice(0, 50)}"`);
    if (/!/.test(text)) problems.push(`exclamation point: "${text.trim().slice(0, 50)}"`);
    if (/[←-⇿⌀-➿⬀-⯿\u{1F000}-\u{1FAFF}■-◿•×]/u.test(text)) problems.push(`symbol in place of an icon: "${text.trim().slice(0, 50)}"`);
  }
  for (const svg of document.querySelectorAll("svg")) {
    if (svg.closest("[data-icon-sprite]")) continue;
    const id = svg.querySelector("use")?.getAttribute("href") ?? "";
    const style = getComputedStyle(svg), size = parseFloat(style.width);
    if (!svg.classList.contains("icon") || !id.startsWith("#ast-") || !document.getElementById(id.slice(1))) problems.push(`icon outside the sprite: ${id || "inline drawing"}`);
    else if (![16, 20, 24, 32].includes(size) || size !== parseFloat(style.height)) problems.push(`icon size: ${id} at ${style.width}`);
    else if (style.fill !== "none" || parseFloat(style.strokeWidth) !== 1.5 || style.strokeLinecap !== "square" || style.strokeLinejoin !== "miter") problems.push(`icon restyled: ${id}`);
  }
  for (const image of document.querySelectorAll("img")) if (!image.classList.contains("wordmark")) problems.push(`image: ${image.src.slice(-60)}`);
  // A status is a word. Where it has an icon, the word is still there.
  for (const status of document.querySelectorAll(".status")) if (!(status.querySelector(".status-word")?.textContent ?? status.textContent).trim()) problems.push("a status with no word");
  return [...new Set(problems)];
}

const expectBrand = async (page, where) => {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(brandAudit), where).toEqual([]);
};

test("step 0: the style check holds the brand in both themes, and the wordmark is the supplied file (acceptance 12)", async ({ page }) => {
  await openDevice(page, { route: "style" });
  await expect(page.locator('[data-view="style-check"]')).toBeVisible();
  await expectBrand(page, "style check, dark");
  expect(await page.evaluate(() => ["400 14px Archivo", "700 24px Archivo", "800 56px Archivo", "500 11px 'JetBrains Mono'"].map(font => document.fonts.check(font)))).toEqual([true, true, true, true]);
  expect(await page.locator(".count-number").first().evaluate(el => [getComputedStyle(el).fontWeight, getComputedStyle(el).fontFamily.split(",")[0]])).toEqual(["800", "Archivo"]);

  const wordmark = page.locator('[data-region="nav"] img.wordmark');
  await expect(wordmark).toHaveAttribute("alt", "Astrion");
  await expect(wordmark).toHaveAttribute("data-wordmark", "light");
  expect(await wordmark.evaluate(async image => (await fetch(image.src)).text())).toBe(source("astrion-wordmark-light.svg"));
  const box = await wordmark.boundingBox(), brand = await page.locator(".nav-brand").boundingBox();
  expect(box.x - brand.x).toBeGreaterThanOrEqual(box.height);
  expect(box.y - brand.y).toBeGreaterThanOrEqual(box.height);
  expect(await page.locator('[data-region="nav"]').evaluate(nav => /A\s*S\s*T\s*R\s*I\s*O\s*N/.test(nav.innerText))).toBe(false);

  await page.getByRole("button", { name: "Light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(wordmark).toHaveAttribute("data-wordmark", "dark");
  expect(await wordmark.evaluate(async image => (await fetch(image.src)).text())).toBe(source("astrion-wordmark-dark.svg"));
  await expectBrand(page, "style check, light");
  expect(await page.evaluate(() => { const body = getComputedStyle(document.body); const probe = document.createElement("i"); probe.style.color = "var(--astrion-paper)"; document.body.append(probe); const paper = getComputedStyle(probe).color; probe.remove(); return body.backgroundColor === paper; })).toBe(true);
});

test("step 1 and acceptance 1 and 2: the due date gives internal submit on Friday 15 January and Friday 2 July 2027", async ({ page }) => {
  await openDevice(page);
  await expect(page.getByRole("heading", { name: "No pursuit yet" })).toBeVisible();
  await expect(page.locator(".btn-primary")).toHaveCount(1);
  await newPursuit(page, "Sentinel Range Modernization");
  await page.getByLabel("Agency").fill("Army Contracting Command");
  await page.getByLabel("Solicitation number").fill("W91CRB-27-R-0007");
  await page.getByLabel("RFP release date").fill("2026-12-01");
  await page.getByLabel("Q&A deadline").fill("2026-12-11");
  await page.getByLabel("Submission method").selectOption("email");
  await page.getByLabel("Capture manager").fill("Dana Whitfield");
  await page.getByLabel("Proposal manager").fill("Luis Ortega");
  await page.getByLabel("Due time").fill("14:00");
  await page.getByLabel("Time zone").selectOption("America/New_York");
  await page.getByRole("button", { name: "Add volume" }).click();
  await page.getByLabel("Volume name").fill("Volume I, Technical");
  await page.getByLabel("Page limit for Volume I, Technical").fill("25");

  await page.getByLabel("Proposal due date").fill("2027-01-19");
  await expect(page.locator('[data-value="due"]')).toHaveText("Tuesday, January 19, 2027, 2:00 PM Eastern Time");
  await expect(page.locator('[data-value="internal-submit"]')).toHaveText("Friday, January 15, 2027, 1 business day before the due date");
  await saved(page);

  // Everything is saved without a save button, and comes back after a reload.
  await page.reload();
  await go(page, "setup");
  await expect(page.getByLabel("Pursuit name")).toHaveValue("Sentinel Range Modernization");
  await expect(page.getByLabel("Submission method")).toHaveValue("email");
  await expect(page.getByLabel("Page limit for Volume I, Technical")).toHaveValue("25");

  // A new due date is an amendment: every date is shown before and after, and nothing changes until it is confirmed.
  await page.getByLabel("Proposal due date").fill("2027-07-06");
  const dialog = page.locator('[data-dialog="amendment"]');
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-value="internal-submit"]')).toContainText("January 15, 2027");
  await expect(dialog.locator('[data-table="amendment-diff"] tbody tr')).toHaveCount(10);
  await expect(dialog.locator('tr[data-milestone="due"] td').nth(1)).toHaveText(/Tue 19 Jan 2027/i);
  await expect(dialog.locator('tr[data-milestone="due"] td').nth(2)).toHaveText(/Tue 6 Jul 2027/i);
  await expect(dialog.locator('tr[data-milestone="kickoff"]')).toHaveAttribute("data-changed", "false");
  await dialog.getByLabel("Amendment number").fill("0003");
  await dialog.getByRole("button", { name: "Confirm amendment" }).click();
  await expect(page.locator('[data-value="internal-submit"]')).toHaveText("Friday, July 2, 2027, 1 business day before the due date");
  await go(page, "schedule");
  await page.getByRole("tab", { name: "Change log" }).click();
  const first = page.locator('[data-table="change-log"] tbody tr').first();
  await expect(first).toHaveAttribute("data-log-kind", "amendment");
  await expect(first.locator("td").nth(2)).toHaveText("0003");
  await expect(first.locator("td").nth(3)).toHaveText(/Tue 1 Dec 2026/i);
  await expect(first).toContainText("Amendment 0003: due date moved to Tue 6 Jul 2027");
});

test("acceptance 3: a locked Red team date holds through an amendment and a re-plan, and everything unlocked moves", async ({ page }) => {
  await openDevice(page);
  await newPursuit(page, "Lock check");
  await page.getByLabel("RFP release date").fill("2026-12-01");
  await page.getByLabel("Proposal due date").fill("2027-01-19");
  await go(page, "schedule");
  await page.getByRole("tab", { name: "List" }).click();
  await expect(startOf(page, "Red team review")).toHaveValue("2026-12-30");
  await startOf(page, "Red team review").fill("2027-01-05");
  const red = page.locator('[data-table="milestones"] tr[data-milestone="red"]');
  await expect(red.locator('[data-status-word="Locked"]')).toBeVisible();
  await expect(red.locator('[data-status-word="Locked"] svg')).toHaveAttribute("data-icon", "lock");
  await expect(page.getByLabel("Pink recovery end")).toHaveValue("2027-01-04");
  const unlocked = ["Storyboards / annotated outline due", "Pink team review", "Gold team review", "Internal submit", "Due"];
  const before = {};
  for (const name of unlocked) before[name] = await startOf(page, name).inputValue();

  await startOf(page, "Due").fill("2027-02-09");
  const dialog = page.locator('[data-dialog="amendment"]');
  await expect(dialog.locator('tr[data-changed="false"]')).toHaveCount(2);
  await expect(dialog.locator('tr[data-milestone="red"]')).toHaveAttribute("data-changed", "false");
  await expect(dialog.locator('tr[data-milestone="red"] [data-status-word="Locked"]')).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm amendment" }).click();
  await page.locator('[data-action="replan"]').click();

  await expect(startOf(page, "Red team review")).toHaveValue("2027-01-05");
  await expect(startOf(page, "Internal submit")).toHaveValue("2027-02-08");
  for (const name of unlocked) expect(await startOf(page, name).inputValue(), `${name} is unlocked and moved`).not.toBe(before[name]);
  await expect(startOf(page, "Kickoff")).toHaveValue("2026-12-01");

  // A locked date that breaks the order is flagged where it sits, and unlocking returns it to the plan.
  await startOf(page, "Gold team review").fill("2027-01-04");
  await expect(page.locator('[data-table="milestones"] tr[data-milestone="gold"] [data-status-word="Conflict"]')).toBeVisible();
  await expect(page.locator('[data-table="milestones"] tr[data-milestone="gold"]')).toContainText("does not come after Red team review (locked)");
  await expect(page.locator('[data-notice="compression-warning"]')).toContainText("A locked date conflicts with the plan");
  await page.locator('[data-table="milestones"] tr[data-milestone="gold"]').getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator('[data-status-word="Conflict"]')).toHaveCount(0);
  await expect(startOf(page, "Red team review")).toHaveValue("2027-01-05");
});

test("acceptance 4: a 12-business-day window raises the compressed-plan warning, lists what changes, and squeezes nothing silently", async ({ page }) => {
  await openDevice(page, { today: "2027-01-04" });
  await newPursuit(page, "Short fuse task order");
  await page.getByLabel("Proposal due date").fill("2027-01-22");
  await go(page, "schedule");
  await expect(page.locator('[data-value="window"]')).toHaveText("12 business days, kickoff to internal submit");
  const warning = page.locator('[data-region="schedule-compression"]');
  await expect(warning.locator('[data-notice="compression-warning"]')).toContainText("The window is too short for the standard plan");
  await expect(warning.locator('[data-notice="compression-warning"] svg')).toHaveAttribute("data-icon", "status-attention");
  await expect(warning.locator('[data-list="plan-problems"] li')).toHaveText(["Red recovery has 1 business day. The minimum is 2 business days.", "Final production has 1 business day. The minimum is 2 business days."]);
  await expect(warning.getByRole("button", { name: "Fold Pink into Red (recommended)" })).toHaveAttribute("aria-pressed", "true");
  await expect(warning.locator('[data-list="compression-changes"] li')).toHaveText([
    "Pink team review dropped. Its checks fold into Red team review.",
    "Pink recovery dropped with the Pink team review.",
    "Red team review moved from Thu 14 Jan 2027 to Tue 12 Jan 2027.",
    "Red recovery holds 2 business days. The standard plan left 1 business day.",
    "Gold team review moved from Tue 19 Jan 2027 to Fri 15 Jan 2027.",
    "Final production holds 2 business days. The standard plan left 1 business day.",
  ]);
  // Until the plan is applied, the dates on record are the standard ones, flagged.
  await page.getByRole("tab", { name: "List" }).click();
  await expect(startOf(page, "Pink team review")).toHaveValue("2027-01-08");
  await expect(startOf(page, "Red team review")).toHaveValue("2027-01-14");
  await expect(page.locator('[data-table="milestones"] tr[data-milestone="redRecovery"] [data-status-word="Conflict"]')).toBeVisible();

  // The other choice keeps three reviews and says what it costs.
  await warning.getByRole("button", { name: "Keep all three reviews at minimum spacing" }).click();
  await expect(warning.locator('[data-list="compression-changes"]')).toContainText("Pink team review moved from Fri 8 Jan 2027 to Thu 7 Jan 2027.");
  await warning.getByRole("button", { name: "Fold Pink into Red (recommended)" }).click();
  await warning.locator('[data-action="apply-compression"]').click();

  await expect(page.locator('[data-notice="compressed-in-force"]')).toContainText("Compressed plan");
  await expect(page.locator('[data-notice="compressed-in-force"]')).toContainText("Fold Pink into Red");
  await expect(page.locator('[data-region="schedule-compression"] [data-list="compression-changes"] li')).toHaveCount(6);
  await expect(page.locator('[data-table="milestones"] tr[data-milestone="pink"] [data-status-word="Dropped"]')).toBeVisible();
  await expect(startOf(page, "Red team review")).toHaveValue("2027-01-12");
  await expect(page.locator('[data-status-word="Conflict"]')).toHaveCount(0);
  await page.getByRole("tab", { name: "Change log" }).click();
  await expect(page.locator('[data-table="change-log"] tbody tr').first()).toContainText("Compressed plan applied: Fold Pink into Red");
  await expectBrand(page, "schedule with a compressed plan");
});

test("step 2: timeline, countdown, planning rules and the calendar and CSV exports", async ({ page }) => {
  await openDevice(page, { today: "2026-12-21", sample: true, route: "schedule" });
  await expect(page.locator('[data-countdown="next-milestone"] .count-number')).toHaveText("6");
  await expect(page.locator('[data-countdown="next-milestone"]')).toContainText(/business days to Red team/i);
  await expect(page.locator("[data-countdown-text]")).toHaveText("6 business days to Red team, Wed 30 Dec 2026.");

  // Gantt: reviews are solid Steel bars, recovery and production are outlines, and today is the one Ion element.
  const colors = await page.evaluate(() => {
    const probe = document.createElement("i"); document.body.append(probe);
    const of = value => { probe.style.color = value; return getComputedStyle(probe).color; };
    const out = { steel: of("var(--astrion-steel)"), ion: of("var(--astrion-ion)"), gunmetal: of("var(--astrion-gunmetal)") }; probe.remove(); return out;
  });
  const style = (selector, ...properties) => page.locator(selector).first().evaluate((el, list) => list.map(property => getComputedStyle(el)[property]), properties);
  expect(await style('[data-gantt-bar="red"]', "backgroundColor")).toEqual([colors.steel]);
  expect(await style('[data-gantt-bar="redRecovery"]', "backgroundColor", "borderTopColor", "borderTopWidth")).toEqual(["rgba(0, 0, 0, 0)", colors.steel, "1px"]);
  expect(await style('[data-gantt-bar="production"]', "backgroundColor", "borderTopWidth")).toEqual(["rgba(0, 0, 0, 0)", "1px"]);
  expect(await style("[data-gantt-today]", "backgroundColor", "width")).toEqual([colors.ion, "1px"]);
  await expect(page.locator("[data-gantt-today]")).toHaveCount(1);
  await expect(page.locator(".gantt-today-label")).toHaveText(/today/i);
  await expect(page.locator('[data-gantt-point="kickoff"] svg')).toHaveAttribute("data-icon", "milestone");
  expect(await style('[data-offday="2026-12-25"]', "backgroundColor")).toEqual([colors.gunmetal]);
  await expect(page.locator('[data-offday="2026-12-25"]')).toHaveAttribute("title", "Fri 25 Dec 2026: Christmas Day");
  await expect(page.locator('[data-offday="2027-01-18"]')).toHaveAttribute("title", "Mon 18 Jan 2027: Birthday of Martin Luther King, Jr.");
  await expect(page.locator('[data-offday="2026-12-26"]')).toHaveAttribute("title", "Sat 26 Dec 2026: Weekend");
  await expect(page.locator('[data-offday="2026-12-28"]')).toHaveCount(0);
  await expectBrand(page, "timeline");

  // A company blackout day and fixed offsets, applied together.
  await page.getByRole("tab", { name: "Planning rules" }).click();
  await page.getByRole("button", { name: "Fixed offsets" }).click();
  await page.getByLabel("Blackout date").fill("2026-12-24");
  await page.getByLabel("Label", { exact: true }).fill("Company holiday");
  await page.getByRole("button", { name: "Add blackout day" }).click();
  await page.locator('[data-action="apply-rules"]').click();
  await page.getByRole("tab", { name: "List" }).click();
  await expect(startOf(page, "Gold team review")).toHaveValue("2027-01-12");
  await expect(startOf(page, "Red team review")).toHaveValue("2027-01-05");
  await expect(startOf(page, "Pink team review")).toHaveValue("2026-12-21");
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.locator('[data-offday="2026-12-24"]')).toHaveAttribute("title", "Thu 24 Dec 2026: Company holiday");

  const [calendar] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export .ics" }).click()]);
  expect(calendar.suggestedFilename()).toBe("w91crb-27-r-0007-schedule.ics");
  const ics = readFileSync(await calendar.path(), "utf8");
  expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(10);
  expect(ics).toContain("DTSTART;VALUE=DATE:20270105\r\nDTEND;VALUE=DATE:20270106\r\nSUMMARY:Red team review: Sentinel Range Modernization");
  expect(ics).toContain("DTSTART:20270119T190000Z\r\nSUMMARY:Proposal due 2:00 PM Eastern Time: Sentinel Range Modernization");
  const [sheet] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  const csv = readFileSync(await sheet.path(), "utf8").replace(/^﻿/, "").trim().split("\r\n");
  expect(csv[0]).toBe("Milestone,Start,End,Business days,Locked,State,Note");
  expect(csv[5]).toBe("Red team review,2027-01-05,2027-01-05,1,No,Planned,");
  expect(csv).toHaveLength(11);
});

test("step 3: roster, sections and subsections, reordering by button and by drag, owner filter and my assignments", async ({ page }) => {
  await openDevice(page, { today: "2026-12-01", sample: true, route: "team" });
  await expect(page.locator('[data-table="roster"] tbody tr')).toHaveCount(4);
  await page.getByRole("button", { name: "Add person" }).click();
  await page.getByLabel("Name").last().fill("Ana Soto");
  await page.getByLabel("Email").last().fill("not an address");
  await expect(page.getByLabel("Email").last()).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Email").last().fill("ana.soto@example.com");
  await page.getByLabel("Role").last().fill("Writer");

  await go(page, "outline");
  const technical = page.locator('[data-table="outline"][data-volume="Volume I, Technical"]');
  const rows = () => technical.locator("tbody tr[data-node]").evaluateAll(list => list.map(row => row.dataset.node));
  expect(await rows()).toEqual(["Technical Approach to SOW Tasks 3.1 through 3.4", "Identifying and Mitigating Technical and Schedule Risk"]);
  await page.locator("section", { has: page.getByRole("heading", { name: "Volume I, Technical" }) }).getByRole("button", { name: "Add section" }).click();
  const editor = page.locator('[data-editor="node"]');
  await editor.getByLabel("Title").fill("Transition approach");
  await editor.getByLabel("L reference").fill("L.4.3");
  await editor.getByLabel("Owner", { exact: true }).selectOption({ label: "Ana Soto" });
  await editor.getByLabel("Reviewer").selectOption({ label: "Luis Ortega" });
  await editor.getByLabel("Page allocation").fill("4");
  await editor.getByLabel("Status").selectOption("Outlining");
  await editor.getByLabel("Notes").fill("Phase-in plan and risks.");
  const added = technical.locator('tr[data-node="Transition approach"]');
  await expect(added).toHaveClass(/is-selected/);
  await expect(added.locator("td").nth(8)).toHaveText(/Wed 16 Dec 2026/i);
  await expect(added.locator('[data-status-word="Outlining"] svg')).toHaveAttribute("data-icon", "status-in-progress");
  await expect(technical.locator("tr.is-selected")).toHaveCount(1);
  await editor.getByRole("button", { name: "Add subsection" }).click();
  await page.locator('[data-editor="node"]').getByLabel("Title").fill("Phase-in schedule");
  await expect(technical.locator('tr[data-node="Phase-in schedule"]')).toHaveAttribute("data-depth", "1");
  await expect(technical.locator('tr[data-node="Phase-in schedule"] td').first()).toHaveText("1.3.1");

  // The set has no drag handle: the whole row drags, and Up and Down do the same from the keyboard or a tablet.
  await added.getByRole("button", { name: "Up" }).click();
  expect(await rows()).toEqual(["Technical Approach to SOW Tasks 3.1 through 3.4", "Transition approach", "Phase-in schedule", "Identifying and Mitigating Technical and Schedule Risk"]);
  await expect(technical.locator('tr[data-node="Transition approach"]')).toHaveAttribute("draggable", "true");
  await technical.locator('tr[data-node="Identifying and Mitigating Technical and Schedule Risk"]').dragTo(technical.locator('tr[data-node="Technical Approach to SOW Tasks 3.1 through 3.4"]'));
  expect(await rows()).toEqual(["Identifying and Mitigating Technical and Schedule Risk", "Technical Approach to SOW Tasks 3.1 through 3.4", "Transition approach", "Phase-in schedule"]);
  await expect(technical.locator('tr[data-node="Identifying and Mitigating Technical and Schedule Risk"]').getByRole("button", { name: "Up" })).toBeDisabled();
  await expectBrand(page, "outline with a row open");

  await page.getByLabel("Filter by owner").selectOption({ label: "Ana Soto" });
  expect(await rows()).toEqual(["Transition approach", "Phase-in schedule"]);
  await expect(page.locator('[data-table="outline"][data-volume="Volume II, Management"]')).toHaveCount(0);
  await page.getByRole("tab", { name: "My assignments" }).click();
  await page.getByLabel("Person").selectOption({ label: "Priya Raman" });
  await expect(page.locator('[data-table="assignments"] tbody tr')).toHaveCount(2);
  await expect(page.locator('[data-table="assigned-requirements"] tbody tr')).toHaveCount(2);
  await page.getByLabel("Person").selectOption({ label: "Luis Ortega" });
  await expect(page.locator('[data-table="assignments"] tbody tr td:nth-child(4)')).toHaveText(["Reviewer", "Reviewer", "Reviewer", "Reviewer"]);
  await expectBrand(page, "my assignments");
});

test("acceptance 5: 27 pages against a 25-page limit raises the top alert, and the volume shows Over with the blocked icon and 108%", async ({ page }) => {
  await openDevice(page, { sample: true, route: "budget" });
  const status = page.locator('[data-volume-status="Volume I, Technical"]');
  await expect(status).toHaveText(/Near limit\s*92%/);
  await expect(status.locator("svg")).toHaveAttribute("data-icon", "status-attention");
  await expect(page.locator('[data-volume-status="Volume II, Management"]')).toHaveText(/Within\s*40%/);
  await expect(page.locator('[data-volume-status="Volume II, Management"] svg')).toHaveAttribute("data-icon", "check");
  await expect(page.locator('[data-volume-status="Volume III, Price"]')).toHaveText("No limit");
  await expect(page.locator("[data-alert]")).toHaveCount(0);

  await page.getByLabel("Current pages for Identifying and Mitigating Technical and Schedule Risk").fill("12");
  await expect(status).toHaveText(/Over\s*108%/);
  await expect(status.locator("svg")).toHaveAttribute("data-icon", "status-blocked");
  expect(await status.locator(".status-word").evaluate(el => getComputedStyle(el).fontWeight)).toBe("700");
  const alert = page.locator('[data-alert="page-limit"]');
  await expect(alert).toHaveAttribute("role", "alert");
  await expect(alert).toContainText("Volume I, Technical is over its page limit");
  await expect(alert).toContainText("27 of 25 pages, 108%.");
  expect(await alert.evaluate(el => { const probe = document.createElement("i"); document.body.append(probe); probe.style.color = "var(--astrion-ion)"; const ion = getComputedStyle(probe).color; probe.style.color = "var(--astrion-carbon)"; const carbon = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(el).backgroundColor === ion && getComputedStyle(el).color === carbon; })).toBe(true);
  await expect(page.locator('[data-table="budget"][data-volume="Volume I, Technical"] tr[data-row="volume-total"]')).toContainText("108% of limit");
  await expectBrand(page, "page budget, over the limit");

  // The alert follows the pursuit to every screen, and on the dashboard it is the only Ion element (acceptance 11).
  await go(page, "dashboard");
  await expect(alert).toBeVisible();
  await expect(page.locator('[data-table="dash-budget"] tr[data-volume="Volume I, Technical"]')).toContainText(/Over\s*108%/);
  expect(await page.evaluate(() => { const probe = document.createElement("i"); document.body.append(probe); probe.style.color = "var(--astrion-ion)"; const ion = getComputedStyle(probe).color; probe.remove(); return [...document.querySelectorAll("main *")].filter(el => { const style = getComputedStyle(el); return el.getBoundingClientRect().width > 0 && [style.color, style.backgroundColor, style.borderTopColor].includes(ion) && !el.closest("[data-alert]"); }).length; })).toBe(0);
  await expect(page.locator('[data-action="draft-status"]')).toHaveClass(/btn-strong/);
  await alert.getByRole("button", { name: "Open page budget" }).click();
  await expect(page.locator('[data-view="budget"]')).toBeVisible();

  // Excluded sections do not count, a word count estimates pages, and allocations past the limit are called out.
  await page.getByLabel("Current pages for Identifying and Mitigating Technical and Schedule Risk").fill("8");
  await expect(page.locator("[data-alert]")).toHaveCount(0);
  await page.getByLabel("Count method for Technical Approach to SOW Tasks 3.1 through 3.4").selectOption("estimate");
  await page.getByLabel("Word count for Technical Approach to SOW Tasks 3.1 through 3.4").fill("6000");
  await page.getByLabel("Graphics pages for Technical Approach to SOW Tasks 3.1 through 3.4").fill("2.5");
  const row = page.locator('[data-table="budget"] tr[data-node="Technical Approach to SOW Tasks 3.1 through 3.4"]');
  await expect(row.locator('[data-cell="pages"]')).toHaveText("14.5");
  await page.getByLabel("Words per page").fill("400");
  await expect(row.locator('[data-cell="pages"]')).toHaveText("17.5");
  await expect(row.locator('[data-status-word="Over"]')).toBeVisible();
  await page.getByLabel("Count Technical Approach to SOW Tasks 3.1 through 3.4 toward the page limit").uncheck({ force: true });
  await expect(row.locator('[data-status-word="Not counted"]')).toBeVisible();
  await expect(status).toHaveText(/Within\s*32%/);
  await page.getByLabel("Allocated pages for Identifying and Mitigating Technical and Schedule Risk").fill("30");
  await expect(page.locator('[data-notice="over-allocated"]')).toContainText("Sections are allocated 30 pages, 5 more than the 25-page limit.");

  // The format rules from Section L are a checklist on each volume.
  const checklist = page.locator('[data-format-checklist="Volume II, Management"]');
  await expect(checklist.locator("li")).toHaveCount(5);
  await checklist.locator("label.check").nth(1).click();
  await expect(checklist.locator("h3")).toContainText(/1 of 5 checked/i);
  await expect(page.locator('[data-format-checklist="Volume I, Technical"] h3')).toContainText(/0 of 5 checked/i);
});

test("step 5: the compliance matrix flags, gates, sorts, filters, crosswalks and exports", async ({ page }, testInfo) => {
  await openDevice(page, { sample: true, route: "compliance" });
  await expect(page.locator("[data-gate]")).toHaveAttribute("data-gate", "not-ready");
  await expect(page.locator('[data-gate] [data-status-word="Not ready"] svg')).toHaveAttribute("data-icon", "status-blocked");
  await expect(page.locator('[data-spec="gate"] [data-value="open"]')).toHaveText("12");
  await expect(page.locator('[data-spec="gate"] [data-value="gap"]')).toHaveText("1");
  await expect(page.locator('[data-spec="gate"] [data-value="unmapped"]')).toHaveText("5");
  await expect(page.locator('[data-spec="gate"] [data-value="untraced"]')).toHaveText("1");
  await expect(page.locator('[data-chart-row="Volume I, Technical"] .bar-value')).toHaveText(/20%, 1 of 5/i);
  const matrix = page.locator('[data-table="matrix"]');
  await expect(matrix.locator("thead th")).toHaveText([/Req ID/i, /Source/i, /Ref/i, /Requirement/i, /Type/i, /Mapped sections/i, /Owner/i, /Status/i, /Page ref/i, /Comment/i]);
  await expect(matrix.locator('tr[data-req="L-001"] [data-status-word="Unmapped"]')).toBeVisible();
  await expect(matrix.locator('tr[data-req="M-006"] [data-status-word="Untraced"]')).toBeVisible();
  await expect(matrix.locator('tr[data-req="L-007"] [data-status-word="Gap"] svg')).toHaveAttribute("data-icon", "status-blocked");
  expect(await matrix.locator('tr[data-req="L-006"] td').nth(0).evaluate(el => getComputedStyle(el.querySelector("button")).fontFamily.split(",")[0].replace(/"/g, ""))).toBe("JetBrains Mono");
  expect(await matrix.locator('tr[data-req="L-006"] td').nth(3).evaluate(el => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, ""))).toBe("Archivo");

  // Map a requirement, and N/A needs its reason.
  await matrix.locator('tr[data-req="L-001"]').click();
  const editor = page.locator('[data-editor="requirement"]');
  await editor.locator('[data-list="section-map"] label.check', { hasText: "Technical Approach" }).click();
  await expect(matrix.locator('tr[data-req="L-001"] td').nth(5)).toContainText("Volume I, Technical / Technical Approach");
  await expect(page.locator('[data-spec="gate"] [data-value="unmapped"]')).toHaveText("4");
  await editor.getByLabel("Status").selectOption("N/A");
  await expect(matrix.locator('tr[data-req="L-001"]')).toContainText("Needs a reason. Counts as Open until it has one.");
  await expect(editor.getByLabel("Reason for N/A")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('[data-spec="gate"] [data-value="open"]')).toHaveText("12");
  await editor.getByLabel("Reason for N/A").fill("Verified at production, not in a section.");
  await expect(page.locator('[data-spec="gate"] [data-value="open"]')).toHaveText("11");
  await expect(matrix.locator("tr.is-selected")).toHaveCount(1);
  await expectBrand(page, "matrix with a row open");
  await editor.getByRole("button", { name: "Close" }).click();

  const ids = () => matrix.locator("tbody tr[data-req]").evaluateAll(list => list.map(row => row.dataset.req));
  await matrix.getByRole("button", { name: "Status" }).click();
  expect((await ids()).slice(0, 2)).toEqual(["L-007", "L-002"]);
  await expect(matrix.locator("th", { hasText: /status/i })).toHaveAttribute("aria-sort", "ascending");
  await matrix.getByRole("button", { name: "Req ID" }).click();
  await page.getByLabel("Search").fill("risk");
  expect(await ids()).toEqual(["L-007", "M-004"]);
  await page.getByLabel("Search").fill("");
  await page.getByLabel("Source").selectOption("M");
  await page.getByLabel("Type", { exact: true }).selectOption("subfactor");
  expect(await ids()).toEqual(["M-003", "M-004"]);
  await page.getByLabel("Source").selectOption("all");
  await page.getByLabel("Type", { exact: true }).selectOption("all");
  await page.getByText("Flagged only").click();
  expect(await ids()).toEqual(["L-002", "L-003", "L-004", "L-005", "L-007", "M-006"]);
  await expect(page.locator('[data-value="row-count"]')).toHaveText("6 of 15 shown");
  await page.getByText("Flagged only").click();

  await page.getByRole("tab", { name: "L-to-M crosswalk" }).click();
  const crosswalk = page.locator('[data-table="crosswalk"]');
  await expect(crosswalk.locator('tr[data-crosswalk="L-006"] td').nth(3)).toContainText("1a Technical Approach");
  await expect(crosswalk.locator('tr[data-crosswalk="L-007"] td').nth(3)).toContainText("1b Risk Management");
  await expect(crosswalk.locator('tr[data-crosswalk="M-006"] [data-status-word="Untraced"]')).toBeVisible();
  await expectBrand(page, "crosswalk");

  await page.getByRole("tab", { name: "Matrix" }).click();
  const [csvFile] = await Promise.all([page.waitForEvent("download"), page.locator('[data-action="export-csv"]').click()]);
  const csv = readFileSync(await csvFile.path(), "utf8").replace(/^﻿/, "").trim().split("\r\n");
  expect(csv[0]).toBe("Req ID,Source,Paragraph ref,Requirement text,Type,Mapped sections,Owner,Status,N/A reason,Proposal page ref,Reviewer comment");
  expect(csv).toHaveLength(16);
  expect(csv[1]).toContain("N/A,\"Verified at production, not in a section.\"");
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.locator('[data-action="export-xlsx"]').click()]);
  expect(xlsx.suggestedFilename()).toBe("w91crb-27-r-0007-compliance-matrix.xlsx");
  const workbook = testInfo.outputPath("compliance-matrix.xlsx");
  await xlsx.saveAs(workbook);
  expect([...readFileSync(workbook).subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  // Where the Astrion brand checker and its Python libraries are on this machine, the exported workbook has to pass it.
  const checker = process.env.ASTRION_BRAND_CHECKER;
  if (checker) expect(execFileSync("python3", [checker, workbook]).toString()).toMatch(/^PASS /);
});

test("acceptance 6: the sample excerpt parses, is reviewed before anything is written, and applies with its due date", async ({ page }) => {
  const cloud = await mockCloud(page);
  await signIn(page);
  await newPursuit(page, "Sentinel Range Modernization");
  await expect(page.locator(".nav-foot")).toContainText("pm@example.com");
  await go(page, "parser");
  await page.getByRole("button", { name: "Use the sample excerpt" }).click();
  await expect(page.getByLabel("Section L and Section M text")).toHaveValue(/^L\.2 Proposals are due 2:00 PM Eastern Time/);
  await page.locator('[data-action="run-parser"]').click();
  await expect(page.locator('[data-view="parser-review"]')).toBeVisible();

  // The text went to the server route with the account's token, and nothing else did.
  expect(cloud.calls).toHaveLength(1);
  expect(cloud.calls[0].authorization).toBe(`Bearer ${cloud.token}`);
  expect(Object.keys(cloud.calls[0].body)).toEqual(["contract_version", "action", "text", "part", "parts", "known_volumes"]);
  expect(cloud.calls[0].body.text).toContain("M.3 The Government will evaluate the 30-page technical volume");

  // Three volumes with their limits and exclusions.
  const volumes = page.locator('[data-table="review-volumes"] tbody tr');
  await expect(volumes).toHaveCount(3);
  expect(await volumes.evaluateAll(rows => rows.map(row => [...row.querySelectorAll("input:not([type=checkbox])")].map(input => input.value)))).toEqual([
    ["Volume I, Technical", "25", "cover; table of contents; acronym list"],
    ["Volume II, Management", "15", "cover; table of contents; acronym list; Resumes"],
    ["Volume III, Price", "", "cover; table of contents; acronym list"],
  ]);
  await expect(volumes.first().locator(".quote")).toHaveText("Volume I, Technical, shall not exceed 25 pages.");
  await expect(volumes.first().locator("td").last()).toHaveText("L.3.1");
  // The format rules, both subfactors, and the 25 against 30 page conflict.
  expect(await page.locator('[data-table="review-format"] input[aria-label="Format rule"]').evaluateAll(inputs => inputs.map(input => input.value))).toEqual([
    "Page size 8.5 x 11 inches", "1-inch margins", "Text in Times New Roman 12 point", "Text in tables and graphics no smaller than 10 point", "Resumes shall not exceed two pages each",
  ]);
  await expect(page.getByLabel("Subfactors of Factor 1, Technical")).toHaveValue("1a Technical Approach; 1b Risk Management");
  await expect(page.locator('[data-table="review-conflicts"] textarea')).toHaveValue(/25 pages.*30-page technical volume/);
  await expect(page.locator('[data-table="review-conflicts"] td').last()).toHaveText("L.3.1, M.3");
  await expect(page.locator('[data-table="review-requirements"] tbody tr')).toHaveCount(10);
  await expect(page.locator('[data-table="review-questions"] tbody tr')).toHaveCount(5);
  await expect(page.locator('[data-spec="parser-run"] [data-value="selected"]')).toHaveText("31 items");
  await expectBrand(page, "parser review");

  // Nothing is in the pursuit until Apply. Every item has a checkbox and can be edited first.
  expect(cloud.rows.values().next().value.data.volumes).toEqual([]);
  await page.getByLabel("Include Price").uncheck({ force: true });
  await page.locator('[data-table="review-outline"] input[aria-label="Section title"]').first().fill("Technical approach");
  await expect(page.locator('[data-spec="parser-run"] [data-value="selected"]')).toHaveText("30 items");
  await expect(page.locator('[data-offer="due-date"]')).toContainText("Set the due date to Tue 19 Jan 2027, 2:00 PM Eastern Time and plan the schedule");
  await page.locator('[data-action="apply-parse"]').click();
  await expect(page.locator('[data-notice="applied"]')).toBeVisible();

  await go(page, "setup");
  await expect(page.locator('[data-value="due"]')).toHaveText("Tuesday, January 19, 2027, 2:00 PM Eastern Time");
  await expect(page.locator('[data-value="internal-submit"]')).toContainText("Friday, January 15, 2027");
  await expect(page.locator('[data-table="volumes"] tbody tr')).toHaveCount(3);
  await expect(page.getByLabel("Page limit for Volume III, Price")).toHaveValue("");
  await expect(page.locator('[data-table="key-dates"] tbody tr')).toContainText("Proposals due via the designated portal");
  await go(page, "outline");
  await expect(page.locator('[data-table="outline"][data-volume="Volume I, Technical"] tbody tr[data-node]')).toHaveCount(2);
  await expect(page.locator('tr[data-node="Technical approach"] td').nth(2)).toHaveText("L.4.1");
  await go(page, "compliance");
  await expect(page.locator('[data-table="matrix"] tbody tr[data-req]')).toHaveCount(14);
  await expect(page.locator('[data-table="matrix"] tr[data-req="L-006"] td').nth(5)).toContainText("Technical approach");
  await expect(page.locator('[data-table="matrix"] tr[data-req="M-003"] td').nth(3)).toHaveText("1a Technical Approach");
  await expect(page.locator('[data-table="matrix"]')).not.toContainText("Price");
  await go(page, "budget");
  await expect(page.locator('[data-table="format-rules"] tbody tr')).toHaveCount(5);
  await go(page, "dashboard");
  await expect(page.locator('[data-list="questions"] li')).toHaveCount(5);
  await saved(page);
  const stored = cloud.rows.values().next().value;
  expect([stored.name, stored.due_date, stored.data.requirements.length]).toEqual(["Sentinel Range Modernization", "2027-01-19", 14]);
});

test("step 6: an invalid reply is retried once with the parse error, a second failure shows the raw reply, and a merge overwrites nothing without a yes", async ({ page }) => {
  let mode = "retry";
  const cloud = await mockCloud(page, async (body, count) => {
    if (mode === "retry") return count === 1 ? { text: "Here is the JSON you asked for: {\"volumes\": [", stop_reason: "end_turn" } : { text: PARSE_REPLY, stop_reason: "end_turn" };
    if (mode === "bad") return { text: "I could not find Section L in this text.", stop_reason: "end_turn" };
    if (mode === "denied") return { status: 403, code: "not_allowed", error: "This account is not allowed to use Proposal War Room AI assistance." };
    return { text: PARSE_REPLY.replace('"page_limit":25', '"page_limit":30'), stop_reason: "end_turn" };
  });
  await signIn(page);
  await newPursuit(page, "Retry check");
  await go(page, "parser");
  await page.getByRole("button", { name: "Use the sample excerpt" }).click();
  await page.locator('[data-action="run-parser"]').click();
  await expect(page.locator('[data-view="parser-review"]')).toBeVisible();
  expect(cloud.calls).toHaveLength(2);
  expect(cloud.calls[1].body.retry.error).toMatch(/^The reply is not valid JSON: /);
  expect(cloud.calls[1].body.retry.previous).toBe("Here is the JSON you asked for: {\"volumes\": [");
  expect(cloud.calls[1].body.text).toBe(cloud.calls[0].body.text);
  await expect(page.locator('[data-spec="parser-run"]')).toContainText("1 part returned valid JSON on the second request");
  await page.locator('[data-action="apply-parse"]').click();
  await expect(page.locator('[data-notice="applied"]')).toBeVisible();

  mode = "bad";
  await page.getByRole("button", { name: "Use the sample excerpt" }).click();
  await page.locator('[data-action="run-parser"]').click();
  const raw = page.locator('[data-notice="parser-raw"]');
  await expect(raw).toContainText("Part 1 did not return usable JSON after two requests");
  await expect(raw.locator("pre")).toHaveText("I could not find Section L in this text.");
  expect(cloud.calls).toHaveLength(4);
  await expect(page.locator('[data-action="apply-parse"]')).toBeDisabled();
  await page.getByRole("button", { name: "Discard results" }).click();

  // An amendment raises the page limit. The pursuit already holds data, so the change is previewed and has to be ticked.
  mode = "limit";
  await page.locator('[data-action="run-parser"]').click();
  await expect(page.locator('[data-view="parser-review"]')).toBeVisible();
  await page.locator('[data-action="apply-parse"]').click();
  const merge = page.locator('[data-dialog="merge-preview"]');
  await expect(merge.locator('[data-value="adds"]')).toHaveText("Nothing new");
  await expect(merge.locator('[data-value="duplicates"]')).toHaveText("33 left as they are");
  await expect(merge.locator('[data-table="overwrites"] tbody tr')).toHaveCount(1);
  await expect(merge.locator('[data-table="overwrites"] tbody tr')).toContainText(/Volume I, Technical: page limit\s*25 pages\s*30 pages/i);
  await expect(merge.getByLabel("Change Volume I, Technical: page limit")).not.toBeChecked();
  await expectBrand(page, "merge preview");
  await merge.locator('[data-action="apply-merge"]').click();
  await go(page, "setup");
  await expect(page.getByLabel("Page limit for Volume I, Technical")).toHaveValue("25");
  await go(page, "parser");
  await page.locator('[data-action="run-parser"]').click();
  await page.locator('[data-action="apply-parse"]').click();
  await merge.getByLabel("Change Volume I, Technical: page limit").check({ force: true });
  await merge.locator('[data-action="apply-merge"]').click();
  await go(page, "setup");
  await expect(page.getByLabel("Page limit for Volume I, Technical")).toHaveValue("30");

  // An account that is not on the allowlist is told so, and nothing else breaks.
  mode = "denied";
  await go(page, "parser");
  await page.locator('[data-action="run-parser"]').click();
  await expect(page.locator('[data-notice="parser-error"]')).toContainText("This account is not allowed to use Proposal War Room AI assistance.");
});

test("step 6: Word, PDF and text uploads are read in the browser, and the device-only mode asks for sign-in before Claude", async ({ page }) => {
  let outside = 0;
  await page.route(`${SUPABASE}/**`, route => { outside += 1; return route.abort(); });
  await openDevice(page);
  await newPursuit(page, "Upload check");
  await go(page, "parser");
  const box = page.getByLabel("Section L and Section M text");
  for (const name of ["sample-excerpt.docx", "sample-excerpt.pdf", "sample-excerpt.txt"]) {
    await box.fill("");
    await page.locator('[data-input="parser-file"]').setInputFiles(fixturePath(name));
    await expect(box, name).toHaveValue(/^L\.2 Proposals are due 2:00 PM Eastern Time, 19 January 2027/, { timeout: 20_000 });
    expect((await box.inputValue()).replace(/\s+/g, " "), name).toContain("M.3 The Government will evaluate the 30-page technical volume for understanding of the requirement and feasibility of approach.");
  }
  await expect(page.locator('[data-notice="device-mode"]')).toHaveText("This pursuit is saved on this device only. Sign in to run the parser.");
  await page.locator('[data-action="run-parser"]').click();
  await expect(page.locator('[data-notice="parser-error"]')).toContainText("Sign in to use Claude.");
  expect(outside, "a device-only pursuit sends nothing to the server").toBe(0);
  await expectBrand(page, "parser input");
});

test("step 7 and acceptance 13: the dashboard computes what needs attention, and the status email is plain text in Astrion voice", async ({ page }) => {
  let reply = STATUS_REPLY;
  const cloud = await mockCloud(page, async () => ({ text: reply, stop_reason: "end_turn" }));
  await signIn(page, { today: "2027-01-13" });
  await page.locator('[data-input="nav-import"]').setInputFiles(fixturePath("sample-pursuit.json"));
  await expect(page.locator('[data-view="setup"]')).toBeVisible();
  await go(page, "dashboard");
  await expect(page.locator('[data-value="pursuit-name"]')).toHaveText(/Sentinel Range Modernization/i);
  await expect(page.locator('[data-value="solicitation"]')).toHaveText(/Solicitation W91CRB-27-R-0007 \/ Army Contracting Command/i);
  await expect(page.locator('[data-countdown="due"] .count-number')).toHaveText("3");
  await expect(page.locator('[data-countdown="due"]')).toContainText(/business days to the due date/i);
  await expect(page.locator('[data-countdown="next-milestone"] .count-number')).toHaveText("2");
  await expect(page.locator('[data-countdown="next-milestone"] .count-number')).toHaveClass(/is-signal/);
  await expect(page.locator("[data-countdown-text]")).toHaveText("2 business days to Internal submit, Fri 15 Jan 2027.");
  await expect(page.locator('[data-list="attention"] li > span')).toHaveText([
    "Internal submit is in 2 business days, on Fri 15 Jan 2027.",
    "Volume I, Technical is at 92% of its page limit.",
    "Priya Raman has 2 overdue sections.",
    "Marcus Bell has 1 overdue section.",
    "1 compliance item is a Gap.",
    "5 Section L requirements map to no section.",
    "1 Section M factor or subfactor traces to no section.",
    "1 conflict in the solicitation is unresolved.",
    "The Q&A deadline passed on Fri 11 Dec 2026 with 5 questions still open.",
  ]);
  await expect(page.locator('[data-table="dash-overdue"] tbody tr')).toHaveCount(3);
  await expect(page.locator('[data-table="dash-overdue"] tbody tr').first()).toContainText("Priya Raman");
  await expect(page.locator('[data-gate] [data-status-word="Not ready"]')).toBeVisible();
  await expect(page.locator('[data-list="questions"] li')).toHaveCount(5);
  await expectBrand(page, "dashboard");

  await page.locator('[data-action="draft-status"]').click();
  const dialog = page.locator('[data-dialog="status-update"]');
  await dialog.locator('[data-action="write-email"]').click();
  await expect(dialog.locator('[data-email="subject"]')).toHaveText("Sentinel Range Modernization is off track for internal submit");
  const sent = cloud.calls.at(-1).body;
  expect(sent.action).toBe("status_update");
  expect(sent.data.due.business_days_remaining).toBe(3);
  expect(JSON.stringify(sent)).not.toContain("The offeror shall describe");
  const draft = async () => `${await dialog.locator('[data-email="subject"]').innerText()}\n${await dialog.locator('[data-email="body"]').innerText()}`;
  const clean = text => { expect(text).not.toMatch(/[—–!]/); expect(text).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}•]/u); expect(text).not.toMatch(/ASTRION/); expect(text.split("\n")[0]).not.toMatch(/\.$/); };
  clean(await draft());
  await expect(dialog.locator('[data-email="body"]')).toContainText("Sentinel Range Modernization is not on track.");
  await expect(dialog.locator('[data-email="body"] svg, [data-email="body"] img')).toHaveCount(0);
  await expect(dialog.locator('[data-email="source"]')).not.toContainText("Removed");
  expect(decodeURIComponent(await dialog.locator('[data-action="mailto"]').getAttribute("href"))).toMatch(/^mailto:\?subject=Sentinel Range Modernization is off track for internal submit&body=Team,/);
  await expectBrand(page, "status update dialog");

  // Whatever the model returns, the voice rules are enforced before the draft is shown.
  reply = "Subject: ASTRION status update — great progress!.\n\nTeam,\n\nWe are on plan — Red team is next! \u{1F680}\n• Volume I is at 23–25 pages.\n\nThanks!";
  await dialog.getByRole("button", { name: "Draft again" }).click();
  await expect(dialog.locator('[data-email="subject"]')).toHaveText("Astrion status update, great progress");
  clean(await draft());
  await expect(dialog.locator('[data-email="body"]')).toHaveText("Team,\n\nWe are on plan, Red team is next.\n- Volume I is at 23 to 25 pages.\n\nThanks.");
  await expect(dialog.locator('[data-email="source"]')).toContainText("Removed from the draft: em or en dash, exclamation point, emoji, icon or symbol, ASTRION in capitals, subject ends in a period.");
});

test("signed-in pursuits save to the account, and a save over a newer copy asks before it overwrites", async ({ page }) => {
  const cloud = await mockCloud(page);
  await signIn(page);
  await newPursuit(page, "Cloud check");
  await page.getByLabel("Agency").fill("Missile Defense Agency");
  await saved(page);
  const row = cloud.rows.values().next().value;
  expect([row.name, row.data.agency, row.revision]).toEqual(["Cloud check", "Missile Defense Agency", 2]);
  expect(JSON.stringify(row)).not.toContain("sk-ant-");

  // Another window saved in between.
  row.revision = 7;
  row.data = { ...row.data, agency: "Changed elsewhere" };
  await page.getByLabel("Agency").fill("Space Development Agency");
  const dialog = page.locator('[data-dialog="save-conflict"]');
  await expect(dialog).toContainText("This pursuit changed somewhere else");
  await expect(page.locator("[data-save-state]")).toHaveAttribute("data-save-state", "Not saved");
  expect(row.data.agency).toBe("Changed elsewhere");
  await dialog.getByRole("button", { name: "Keep this version" }).click();
  await saved(page);
  expect([row.data.agency, row.revision]).toEqual(["Space Development Agency", 8]);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator('[data-view="sign-in"]')).toBeVisible();
  await expectBrand(page, "sign in");
  await expect(page.locator(".btn-primary")).toHaveCount(1);
});

test("a pursuit exports and imports as one JSON file, and several pursuits sit behind the switcher", async ({ page }) => {
  await openDevice(page, { sample: true, route: "setup" });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export pursuit JSON" }).click()]);
  expect(download.suggestedFilename()).toBe("w91crb-27-r-0007-pursuit.json");
  const exported = JSON.parse(readFileSync(await download.path(), "utf8"));
  expect([exported.app, exported.name, exported.requirements.length, exported.outline.length, exported.schedule.milestones.length]).toEqual(["astrion-proposal-war-room", "Sentinel Range Modernization", 15, 3, 10]);

  await newPursuit(page, "Second pursuit");
  await expect(page.locator("#pursuit-switcher option")).toHaveText(["Second pursuit", "Sentinel Range Modernization (W91CRB-27-R-0007)"]);
  await page.locator('[data-input="import-pursuit"]').setInputFiles(await download.path());
  const conflict = page.locator('[data-dialog="import-conflict"]');
  await expect(conflict).toContainText("This pursuit is already here");
  await conflict.getByRole("button", { name: "Add as a copy" }).click();
  await expect(page.locator("#pursuit-switcher option")).toHaveCount(3);
  await expect(page.getByLabel("Pursuit name")).toHaveValue("Sentinel Range Modernization (imported)");
  await page.locator("#pursuit-switcher").selectOption({ label: "Second pursuit" });
  await expect(page.getByLabel("Pursuit name")).toHaveValue("Second pursuit");
  await page.reload();
  await expect(page.locator("#pursuit-switcher")).toContainText("Second pursuit");
  await go(page, "setup");
  await expect(page.getByLabel("Pursuit name")).toHaveValue("Second pursuit");

  await page.locator('[data-input="import-pursuit"]').setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"name":"not a pursuit"}') });
  await expect(page.locator(".toast")).toContainText("Import failed");
  await expect(page.locator(".toast")).toContainText("This file is not a Proposal War Room pursuit.");
  await page.getByRole("button", { name: "Delete pursuit" }).click();
  await page.locator('[data-dialog="delete-pursuit"]').getByRole("button", { name: "Delete pursuit" }).click();
  await expect(page.locator("#pursuit-switcher option")).toHaveCount(2);
});

const SCREENS = ["dashboard", "setup", "schedule", "outline", "budget", "compliance", "parser", "team", "settings"];

for (const theme of ["dark", "light"]) {
  test(`acceptance 7 to 12: every screen holds the brand in the ${theme} theme at desktop and tablet widths`, async ({ page }) => {
    test.setTimeout(90_000);
    await openDevice(page, { today: "2026-12-21", sample: true, theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const width of [1440, 820]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const screen of SCREENS) {
        await go(page, screen);
        await expectBrand(page, `${screen}, ${theme}, ${width} px`);
        // Acceptance 8: computed table text is between 8 and 10 pt, and a narrow screen scrolls the table instead of shrinking it.
        const sizes = await page.locator("table td, table th").evaluateAll(cells => [...new Set(cells.filter(cell => cell.getBoundingClientRect().width > 0).map(cell => Math.round(parseFloat(getComputedStyle(cell).fontSize) * 75) / 100))]);
        for (const size of sizes) { expect(size, `${screen} table text at ${width} px`).toBeGreaterThanOrEqual(8); expect(size).toBeLessThanOrEqual(10); }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${screen} at ${width} px does not scroll sideways as a page`).toBe(true);
      }
      if (width === 820) expect(await page.locator(".btn").first().evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(40);
    }
    await go(page, "schedule");
    for (const tab of ["List", "Change log", "Planning rules"]) { await page.getByRole("tab", { name: tab }).click(); await expectBrand(page, `schedule ${tab}, ${theme}`); }
    await go(page, "settings");
    await expect(page.locator('[data-value="icons"]')).toHaveText("Icons: provisional Astrion set");
    // Pink, Red and Gold team are names with the color-review icon. Nothing is tinted after them.
    await go(page, "schedule");
    await expect(page.locator('[data-gantt-row="pink"] .gantt-label svg').first()).toHaveAttribute("data-icon", "color-review");
    expect(await page.evaluate(() => ["pink", "red", "gold"].map(id => getComputedStyle(document.querySelector(`[data-gantt-bar="${id}"]`)).backgroundColor)).then(list => new Set(list).size)).toBe(1);
  });
}

test("every icon-only button has a name and a tooltip, and the page keeps a visible focus ring", async ({ page }) => {
  await openDevice(page, { sample: true, route: "compliance" });
  const unnamed = await page.locator("button.btn-icon").evaluateAll(buttons => buttons.filter(button => !button.getAttribute("aria-label") || !button.title).length);
  expect(unnamed).toBe(0);
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => { const style = getComputedStyle(document.activeElement); const probe = document.createElement("i"); document.body.append(probe); probe.style.color = "var(--astrion-ion)"; const ion = getComputedStyle(probe).color; probe.remove(); return [style.outlineStyle, style.outlineWidth, style.outlineOffset, style.outlineColor === ion]; });
  expect(ring).toEqual(["solid", "2px", "2px", true]);
});
