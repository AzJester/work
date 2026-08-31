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

function minimalPdf(text) {
  const escaped = text.replace(/([\\()])/g, "\\$1");
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n(${escaped}) Tj\nET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "ascii");
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function storedZip(records) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const record of records) {
    const name = Buffer.from(record.name, "utf8");
    const content = Buffer.from(record.content, "utf8");
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, name);
    localOffset += local.length + name.length + content.length;
  }
  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(records.length, 8);
  end.writeUInt16LE(records.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, end]);
}

function minimalOfficeSources() {
  const relationships = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  return {
    docx: storedZip([
      { name: "[Content_Types].xml", content: `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
      { name: "_rels/.rels", content: relationships },
      { name: "word/document.xml", content: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic DOCX interface evidence</w:t></w:r></w:p></w:body></w:document>` }
    ]),
    pptx: storedZip([
      { name: "[Content_Types].xml", content: `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>` },
      { name: "_rels/.rels", content: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>` },
      { name: "ppt/presentation.xml", content: `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>` },
      { name: "ppt/_rels/presentation.xml.rels", content: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>` },
      { name: "ppt/slides/slide1.xml", content: `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Synthetic PPTX transition evidence</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>` }
    ])
  };
}

test("Quick Capture stays separate until explicit review and materializes a conservative record", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await gotoFresh(page);

  await page.getByRole("button", { name: /Capture$/ }).click();
  const quick = page.getByRole("dialog", { name: "Quick capture" });
  await quick.getByLabel("Proposed record type").selectOption("hotButton");
  await quick.getByLabel("Source / interaction").fill("Synthetic customer exchange, 2026-08-31");
  await quick.getByLabel("Short title or statement").fill("Minimize platform modification");
  await quick.getByLabel("Context, excerpt, or rationale").fill("Customer asked the team to preserve the existing host safety envelope.");
  await quick.getByRole("button", { name: "Save & review inbox" }).click();

  const inbox = page.getByRole("dialog", { name: "Review capture inbox" });
  await expect(inbox).toContainText("Minimize platform modification");
  const before = await page.evaluate(({ workspaceKey, capturePrefix }) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const key = `${capturePrefix}${workspace.activeSolutionId}`;
    const capture = JSON.parse(localStorage.getItem(key));
    return { hotButtons: workspace.hotButtons.length, capture, key };
  }, { workspaceKey: WORKSPACE_KEY, capturePrefix: CAPTURE_PREFIX });
  expect(before.capture.items).toHaveLength(1);
  expect(before.capture.items[0]).toMatchObject({ target: "hotButton", status: "pending" });

  await inbox.getByRole("button", { name: "Commit selected proposals" }).click();
  await expect(page.getByText("1 capture proposal committed.", { exact: true })).toBeVisible();
  const after = await page.evaluate(({ workspaceKey, key }) => {
    const workspace = JSON.parse(localStorage.getItem(workspaceKey));
    const capture = JSON.parse(localStorage.getItem(key));
    return {
      records: workspace.hotButtons.filter(item => item.title === "Minimize platform modification"),
      capture
    };
  }, { workspaceKey: WORKSPACE_KEY, key: before.key });
  expect(after.records).toHaveLength(1);
  expect(after.records[0]).toMatchObject({ confidence: "Unverified", status: "Captured", source: "Synthetic customer exchange, 2026-08-31" });
  expect(after.capture.items[0].status).toBe("materialized");
  await expect(page.getByRole("button", { name: /Review capture inbox, 0 pending/ })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("local text extraction creates linked source evidence and requirement only after review", async ({ page }) => {
  const externalRequests = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") externalRequests.push(request.url());
  });
  await gotoFresh(page);

  await page.getByRole("button", { name: "Open local files", exact: true }).click();
  const intake = page.getByRole("dialog", { name: "Open local files" });
  await intake.locator("#intake-ack").check();
  await intake.locator("#source-files").setInputFiles({
    name: "customer-need.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("<img src=x onerror=alert(1)>\nThe solution shall preserve operations during an intermittent transport loss.", "utf8")
  });

  const card = intake.locator(".intake-card").first();
  await expect(card).toContainText("customer-need.txt");
  await card.locator("[data-intake-target]").selectOption("requirement");
  await card.locator("[data-intake-title]").fill("Preserve operations during intermittent transport loss");
  await intake.getByRole("button", { name: "Add selected excerpts to review inbox" }).click();

  const inbox = page.getByRole("dialog", { name: "Review capture inbox" });
  await expect(inbox.locator(".capture-card")).toHaveCount(2);
  await expect(inbox).toContainText(/source evidence will be committed/i);
  expect(await inbox.locator("img").count()).toBe(0);
  await inbox.getByRole("button", { name: "Commit selected proposals" }).click();

  const records = await page.evaluate(key => {
    const workspace = JSON.parse(localStorage.getItem(key));
    const requirement = workspace.requirements.find(item => item.title === "Preserve operations during intermittent transport loss");
    const evidence = workspace.evidence.find(item => item.id === requirement?.sourceEvidenceId);
    return { requirement, evidence, serialized: localStorage.getItem(key) };
  }, WORKSPACE_KEY);
  expect(records.requirement).toBeTruthy();
  expect(records.evidence).toBeTruthy();
  expect(records.requirement.solutionId).toBe(records.evidence.solutionId);
  expect(records.evidence.notes).toContain("<img src=x onerror=alert(1)>");
  expect(records.serialized).not.toContain("data:application");
  expect(externalRequests).toEqual([]);
});

test("local image preview requires a manual caption and discards the object URL after inbox staging", async ({ page }) => {
  await gotoFresh(page);
  await page.evaluate(() => {
    globalThis.__revokedSourceUrls = [];
    const original = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = url => { globalThis.__revokedSourceUrls.push(url); original(url); };
  });

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await page.getByRole("button", { name: "Open local files", exact: true }).click();
  const intake = page.getByRole("dialog", { name: "Open local files" });
  await intake.locator("#intake-ack").check();
  await intake.locator("#source-files").setInputFiles({ name: "mission-context.png", mimeType: "image/png", buffer: png });

  const card = intake.locator(".intake-card").first();
  await expect(card.locator(".intake-image-preview")).toBeVisible();
  await expect(card).toContainText(/no OCR/i);
  const add = intake.getByRole("button", { name: "Add selected excerpts to review inbox" });
  await add.click();
  await expect(page.getByText("Every selected source needs an excerpt or a verified manual image caption.", { exact: true })).toBeVisible();
  await card.locator("[data-intake-excerpt]").fill("Verified manual caption: one synthetic context marker on a blank background.");
  await add.click();

  const inbox = page.getByRole("dialog", { name: "Review capture inbox" });
  await expect(inbox).toContainText("Verified manual caption");
  expect(await page.evaluate(() => globalThis.__revokedSourceUrls.length)).toBeGreaterThan(0);
  await inbox.getByRole("button", { name: "Commit selected proposals" }).click();
  const stored = await page.evaluate(key => localStorage.getItem(key), WORKSPACE_KEY);
  expect(stored).toContain("Verified manual caption");
  expect(stored).not.toContain("iVBORw0KGgo");
  expect(stored).not.toContain("data:image");
});

test("the pinned local PDF reader extracts page text without an outbound request or retained bytes", async ({ page }) => {
  const externalRequests = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") externalRequests.push(request.url());
  });
  await gotoFresh(page);

  const statement = "Synthetic PDF evidence supports the modular interface review.";
  const pdf = minimalPdf(statement);
  await page.getByRole("button", { name: "Open local files", exact: true }).click();
  const intake = page.getByRole("dialog", { name: "Open local files" });
  await intake.locator("#intake-ack").check();
  await intake.locator("#source-files").setInputFiles({ name: "synthetic-review.pdf", mimeType: "application/pdf", buffer: pdf });

  const card = intake.locator(".intake-card").first();
  await expect(card).toContainText("synthetic-review.pdf");
  await expect(card.locator("[data-intake-excerpt]")).toHaveValue(new RegExp(statement));
  await card.locator("[data-intake-title]").fill("Synthetic PDF review evidence");
  await intake.getByRole("button", { name: "Add selected excerpts to review inbox" }).click();
  const inbox = page.getByRole("dialog", { name: "Review capture inbox" });
  await expect(inbox).toContainText(statement);

  const persisted = await page.evaluate(() => Object.values(localStorage).join("\n"));
  expect(persisted).toContain(statement);
  expect(persisted).not.toContain(pdf.toString("base64"));
  expect(externalRequests).toEqual([]);
});

test("the isolated browser worker extracts DOCX and PPTX text into reviewed excerpts", async ({ page }) => {
  const externalRequests = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") externalRequests.push(request.url());
  });
  await gotoFresh(page);

  const sources = minimalOfficeSources();
  await page.getByRole("button", { name: "Open local files", exact: true }).click();
  const intake = page.getByRole("dialog", { name: "Open local files" });
  await intake.locator("#intake-ack").check();
  await intake.locator("#source-files").setInputFiles([
    { name: "synthetic-brief.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: sources.docx },
    { name: "synthetic-review.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: sources.pptx }
  ]);

  const cards = intake.locator(".intake-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator("[data-intake-excerpt]")).toHaveValue(/Synthetic DOCX interface evidence/);
  await expect(cards.nth(1).locator("[data-intake-excerpt]")).toHaveValue(/Synthetic PPTX transition evidence/);
  await intake.getByRole("button", { name: "Add selected excerpts to review inbox" }).click();

  const inbox = page.getByRole("dialog", { name: "Review capture inbox" });
  await expect(inbox.locator(".capture-card")).toHaveCount(2);
  await expect(inbox).toContainText("Synthetic DOCX interface evidence");
  await expect(inbox).toContainText("Synthetic PPTX transition evidence");
  const persisted = await page.evaluate(() => Object.values(localStorage).join("\n"));
  expect(persisted).not.toContain(sources.docx.toString("base64"));
  expect(persisted).not.toContain(sources.pptx.toString("base64"));
  expect(externalRequests).toEqual([]);
});

test("file intake stages non-linkable targets with separate evidence and commits them safely", async ({ page }) => {
  await gotoFresh(page);
  await page.getByRole("button", { name: "Open local files", exact: true }).click();
  const intake = page.getByRole("dialog", { name: "Open local files" });
  await intake.locator("#intake-ack").check();
  await intake.locator("#source-files").setInputFiles([
    { name: "customer-signal.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic customer signal") },
    { name: "working-assumption.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic working assumption") },
    { name: "delivery-risk.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic delivery risk") }
  ]);

  const cards = intake.locator(".intake-card");
  await expect(cards).toHaveCount(3);
  for (const [index, target] of ["hotButton", "assumption", "risk"].entries()) {
    await cards.nth(index).locator("[data-intake-target]").selectOption(target);
    await cards.nth(index).locator("[data-intake-title]").fill(["Preserve existing platform", "Interface data will be available", "R".repeat(280)][index]);
  }
  await intake.getByRole("button", { name: "Add selected excerpts to review inbox" }).click();

  const inbox = page.getByRole("dialog", { name: "Review capture inbox" });
  await expect(inbox.locator(".capture-card")).toHaveCount(6);
  await inbox.getByRole("button", { name: "Commit selected proposals" }).click();
  const materialized = await page.evaluate(key => {
    const workspace = JSON.parse(localStorage.getItem(key));
    return {
      hotButton: workspace.hotButtons.find(item => item.title === "Preserve existing platform"),
      assumption: workspace.assumptions.find(item => item.statement === "Interface data will be available"),
      risk: workspace.risks.find(item => item.title === "R".repeat(280)),
      evidenceCount: workspace.evidence.filter(item => /source excerpt$/.test(item.title)).length
    };
  }, WORKSPACE_KEY);
  expect(materialized.hotButton).toBeTruthy();
  expect(materialized.assumption).toBeTruthy();
  expect(materialized.risk).toBeTruthy();
  expect(materialized.evidenceCount).toBeGreaterThanOrEqual(3);
});

test("remapping a linked proposal clears unsupported evidence links and enforces title limits", async ({ page }) => {
  await gotoFresh(page);
  await page.getByRole("button", { name: "Open local files", exact: true }).click();
  const intake = page.getByRole("dialog", { name: "Open local files" });
  await intake.locator("#intake-ack").check();
  await intake.locator("#source-files").setInputFiles({ name: "candidate-need.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic candidate need") });
  const card = intake.locator(".intake-card");
  await card.locator("[data-intake-target]").selectOption("requirement");
  await card.locator("[data-intake-title]").fill("Candidate need");
  await intake.getByRole("button", { name: "Add selected excerpts to review inbox" }).click();

  const inbox = page.getByRole("dialog", { name: "Review capture inbox" });
  const proposal = inbox.locator(".capture-card").nth(1);
  await expect(proposal.locator("[data-capture-target]")).toHaveValue("requirement");
  await proposal.locator("[data-capture-target]").selectOption("risk");
  const riskTitle = inbox.locator(".capture-card").nth(1).locator("[data-capture-title]");
  await expect(riskTitle).toHaveAttribute("maxlength", "2000");
  await inbox.getByRole("button", { name: "Commit selected proposals" }).click();
  const workspace = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), WORKSPACE_KEY);
  expect(workspace.risks.some(item => item.title === "Candidate need")).toBe(true);

  await page.getByRole("button", { name: /Capture$/ }).click();
  const quick = page.getByRole("dialog", { name: "Quick capture" });
  await expect(quick.getByLabel("Short title or statement")).toHaveAttribute("maxlength", "280");
  await expect(quick.getByLabel("Source / interaction")).toHaveAttribute("maxlength", "300");
});

test("replacing a file dialog aborts in-flight work and concurrent drops are serialized", async ({ page }) => {
  await page.route("**/solutions-architect/vendor/pdf-6.3.289.min.mjs", async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.continue();
  });
  await gotoFresh(page);
  await page.getByRole("button", { name: "Open local files", exact: true }).click();
  const intake = page.getByRole("dialog", { name: "Open local files" });
  await intake.locator("#intake-ack").check();
  await intake.locator("#source-files").setInputFiles({ name: "slow-source.pdf", mimeType: "application/pdf", buffer: minimalPdf("TRANSIENT_SLOW_SOURCE") });
  await expect(intake.locator("#file-intake-workflow")).toHaveAttribute("aria-busy", "true");

  await page.locator("#source-drop-zone").evaluate(zone => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["second source"], "second-source.txt", { type: "text/plain" }));
    zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.getByText("Wait for the current local files to finish opening before adding more.", { exact: true })).toBeVisible();

  await page.keyboard.press("Alt+Q");
  await expect(intake).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Quick capture" })).toBeVisible();
  await page.waitForTimeout(1_200);
  await expect(page.getByRole("dialog", { name: "Open local files" })).toBeHidden();
  const persisted = await page.evaluate(() => Object.values(localStorage).join("\n"));
  expect(persisted).not.toContain("TRANSIENT_SLOW_SOURCE");
  expect(persisted).not.toContain("second source");
});
