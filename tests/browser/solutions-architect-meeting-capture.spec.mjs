import { expect, test } from "@playwright/test";

const APP_PATH = "../solutions-architect/";
const WORKSPACE_KEY = "solution_architect_workspace_v1";
const CAPTURE_PREFIX = "solution_architect_capture_inbox_v1:";

test.use({ serviceWorkers: "block" });

async function gotoFresh(page, route = "dashboard") {
  await page.goto(`${APP_PATH}#${route}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#workspace")).toBeVisible();
}

test("meeting transcript intake persists only selected evidence with mission metadata", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFresh(page);

  await page.getByRole("button", { name: /Capture$/ }).click();
  await page.getByRole("button", { name: /Meeting transcript or summary/ }).click();
  const meeting = page.getByRole("dialog", { name: "Paste meeting transcript or summary" });
  const source = meeting.locator("#meeting-source-text");
  await expect(source).toBeDisabled();
  await meeting.locator("#meeting-ack").check();
  await expect(source).toBeEnabled();
  await expect(source).toHaveAttribute("spellcheck", "false");
  await expect(source).toHaveAttribute("autocomplete", "off");

  await meeting.getByLabel("Meeting title").fill("Synthetic integrated mission review");
  await meeting.getByLabel("Meeting date").fill("2026-08-30");
  await meeting.getByLabel("Participants").fill("Mission lead, Platform architect; Test lead");
  await meeting.locator('[data-meeting-segment][value="Integrated Air and Missile Defense"]').check();
  await meeting.locator('[data-meeting-segment][value="Space Warfighting"]').check();

  const selectedPassage = "The customer asked for a modular interface demonstration before the next integration gate.";
  const discardedPassage = "TRANSIENT_FULL_TRANSCRIPT_MUST_NOT_PERSIST";
  const transcript = `Opening discussion that is not selected.\n${selectedPassage}\n${discardedPassage}`;
  await source.fill(transcript);
  await source.evaluate((textarea, passage) => {
    const start = textarea.value.indexOf(passage);
    textarea.focus();
    textarea.setSelectionRange(start, start + passage.length);
  }, selectedPassage);
  await meeting.getByRole("button", { name: "Add highlighted excerpt" }).click();

  await expect(meeting.locator(".meeting-excerpt")).toHaveCount(1);
  await expect(meeting.getByRole("button", { name: "Add highlighted excerpt" })).toBeFocused();
  await expect(meeting.locator(".meeting-excerpt")).toContainText(selectedPassage);
  expect(await page.evaluate(marker => Object.values(localStorage).join("\n").includes(marker), discardedPassage)).toBe(false);
  await meeting.getByRole("button", { name: "Stage 1 excerpt for review" }).click();

  const inbox = page.getByRole("dialog", { name: "Review capture inbox" });
  await expect(inbox.locator(".capture-card")).toHaveCount(1);
  const staged = await page.evaluate(({ workspaceKey, capturePrefix }) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const capture = JSON.parse(localStorage.getItem(`${capturePrefix}${workspace.activeSolutionId}`));
    return { capture, serialized: Object.values(localStorage).join("\n") };
  }, { workspaceKey: WORKSPACE_KEY, capturePrefix: CAPTURE_PREFIX });
  expect(staged.capture.items[0].fields).toMatchObject({
    sourceType: "Meeting transcript",
    meetingDate: "2026-08-30",
    participants: ["Mission lead", "Platform architect", "Test lead"]
  });
  expect(staged.capture.items[0].fields.missionSegments).toEqual(expect.arrayContaining([
    "Integrated Air and Missile Defense",
    "Space Warfighting"
  ]));
  expect(staged.capture.items[0].excerpt).toBe(selectedPassage);
  expect(staged.serialized).not.toContain(discardedPassage);

  await inbox.getByRole("button", { name: "Commit selected proposals" }).click();
  await page.locator('a[data-route="shape"]').click();
  const evidence = page.locator(".evidence-card").filter({ has: page.locator('input.card-title-input[value="Synthetic integrated mission review"]') });
  await expect(evidence).toContainText("Meeting transcript");
  await expect(evidence).toContainText("2026-08-30");
  await expect(evidence).toContainText("Mission lead, Platform architect, Test lead");
  await expect(evidence).toContainText("Integrated Air and Missile Defense");
  await expect(evidence).toContainText("Space Warfighting");

  const committed = await page.evaluate(key => {
    const workspace = JSON.parse(localStorage.getItem(key));
    return {
      evidence: workspace.evidence.find(item => item.title === "Synthetic integrated mission review"),
      serialized: Object.values(localStorage).join("\n")
    };
  }, WORKSPACE_KEY);
  expect(committed.evidence.notes).toBe(selectedPassage);
  expect(committed.serialized).not.toContain(discardedPassage);
  expect(pageErrors).toEqual([]);
});

test("short meeting summaries can be staged whole and closing discards unstaged text", async ({ page }) => {
  await gotoFresh(page);
  await page.getByRole("button", { name: "Workspace tools" }).click();
  await page.getByRole("button", { name: /Paste meeting transcript or summary/ }).click();
  let meeting = page.getByRole("dialog", { name: "Paste meeting transcript or summary" });
  await meeting.getByLabel("Content type").selectOption("Meeting summary");
  await expect(meeting.getByLabel("Content type")).toBeFocused();
  await meeting.locator("#meeting-ack").check();
  await meeting.getByLabel("Meeting title").fill("Synthetic summary review");
  await meeting.locator('[data-meeting-segment][value="Critical Infrastructure Protection"]').check();
  const summary = "The synthetic team agreed to validate recovery behavior before selecting a transition baseline.";
  await meeting.locator("#meeting-source-text").fill(summary);
  await meeting.getByRole("button", { name: "Use whole short summary" }).click();
  await expect(meeting.locator(".meeting-excerpt")).toContainText("Complete meeting summary");
  await meeting.getByRole("button", { name: "Stage 1 excerpt for review" }).click();

  await expect(page.getByRole("dialog", { name: "Review capture inbox" })).toContainText(summary);
  await page.getByRole("dialog", { name: "Review capture inbox" }).getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: /Capture$/ }).click();
  await page.getByRole("button", { name: /Meeting transcript or summary/ }).click();
  meeting = page.getByRole("dialog", { name: "Paste meeting transcript or summary" });
  await meeting.locator("#meeting-ack").check();
  await meeting.getByLabel("Meeting title").fill("Discard check");
  await meeting.locator("#meeting-source-text").fill("UNSTAGED_TRANSIENT_MEETING_TEXT");
  await meeting.getByRole("button", { name: "Cancel and discard full text" }).click();

  expect(await page.evaluate(() => Object.values(localStorage).join("\n"))).not.toContain("UNSTAGED_TRANSIENT_MEETING_TEXT");
  await page.getByRole("button", { name: /Capture$/ }).click();
  await page.getByRole("button", { name: /Meeting transcript or summary/ }).click();
  await expect(page.locator("#meeting-source-text")).toHaveValue("");
});

test("editing meeting text or type invalidates previously selected excerpts", async ({ page }) => {
  await gotoFresh(page);
  await page.getByRole("button", { name: /Capture$/ }).click();
  await page.getByRole("button", { name: /Meeting transcript or summary/ }).click();
  const meeting = page.getByRole("dialog", { name: "Paste meeting transcript or summary" });
  await meeting.locator("#meeting-ack").check();
  await meeting.getByLabel("Meeting title").fill("Synthetic source-integrity check");
  await meeting.locator('[data-meeting-segment][value="Integrated Air and Missile Defense"]').check();
  const source = meeting.locator("#meeting-source-text");
  await source.fill("First approved statement.\nSecond approved statement.");
  await source.evaluate(textarea => {
    textarea.focus();
    textarea.setSelectionRange(0, "First approved statement.".length);
  });
  await meeting.getByRole("button", { name: "Add highlighted excerpt" }).click();
  await expect(meeting.locator(".meeting-excerpt")).toHaveCount(1);

  await source.press("End");
  await source.pressSequentially(" changed");
  await expect(meeting.locator(".meeting-excerpt")).toHaveCount(0);
  await expect(meeting.getByRole("button", { name: /Stage selected excerpts for review/ })).toBeDisabled();
  await expect(page.getByText("The meeting source changed. Select the needed excerpts again before staging.", { exact: true })).toBeVisible();

  await source.fill("Short approved summary.");
  await source.evaluate(textarea => { textarea.focus(); textarea.select(); });
  await meeting.getByRole("button", { name: "Add highlighted excerpt" }).click();
  await expect(meeting.locator(".meeting-excerpt")).toHaveCount(1);
  await meeting.getByLabel("Content type").selectOption("Meeting summary");
  await expect(meeting.locator(".meeting-excerpt")).toHaveCount(0);
  await expect(page.getByText("The meeting content type changed. Select the needed excerpts again before staging.", { exact: true })).toBeVisible();
});
