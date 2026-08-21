import { test, expect } from "@playwright/test";

const USER_ID = "collaboration-test-user";
const USER_EMAIL = "member@example.com";

function roadmapRow({ id = "shared-roadmap", title = "Shared delivery roadmap", accessRole = "owner", ownerId = USER_ID } = {}) {
  const doc = {
    schema: "roadmap.v1",
    id,
    title,
    subtitle: "Collaboration browser contract",
    premise: "Only authorized teammates can change this roadmap.",
    notes: "",
    public: false,
    archived: false,
    templateType: "custom",
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-21T12:00:00.000Z",
    lanes: [{
      id: `${id}-lane`,
      name: "Delivery",
      color: "#0073ea",
      items: [{
        id: `${id}-phase`,
        kind: "bar",
        label: "Ship collaboration",
        start: "2026-08-21",
        end: "2026-09-04",
        status: "in_progress",
        note: "",
      }],
    }],
    callouts: [],
  };
  return {
    id,
    user_id: ownerId,
    owner_user_id: ownerId,
    owner_email: ownerId === USER_ID ? USER_EMAIL : "owner@example.com",
    title,
    subtitle: doc.subtitle,
    template_type: "custom",
    public: false,
    revision: 3,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    deleted_at: null,
    access_role: accessRole,
    doc,
  };
}

function supabaseMock({ accessRole = "owner", portfolio, collaborators = [] } = {}) {
  const rows = portfolio || [roadmapRow({ accessRole, ownerId: accessRole === "owner" ? USER_ID : "roadmap-owner" })];
  const aiRoadmap = Object.assign({}, rows[0].doc, { id: "ai-personal-roadmap", title: "AI-created personal roadmap" });
  return `
    (() => {
      if (!sessionStorage.getItem("__roadmap_collaboration_initialized")) {
        localStorage.clear();
        sessionStorage.setItem("__roadmap_collaboration_initialized", "1");
      }
      const session = {
        access_token: "collaboration-test-token",
        user: { id: ${JSON.stringify(USER_ID)}, email: ${JSON.stringify(USER_EMAIL)}, app_metadata: {}, user_metadata: {} }
      };
      const portfolioKey = "__roadmap_collaboration_portfolio";
      const errorKey = "__roadmap_collaboration_error";
      if (!localStorage.getItem(portfolioKey)) localStorage.setItem(portfolioKey, JSON.stringify(${JSON.stringify(rows)}));
      let portfolio = JSON.parse(localStorage.getItem(portfolioKey) || "[]");
      let collaborators = ${JSON.stringify(collaborators)};
      window.__roadmapRpcCalls = [];
      window.__roadmapCollaborators = collaborators;
      window.__setAccessiblePortfolio = rows => {
        portfolio = rows;
        localStorage.setItem(portfolioKey, JSON.stringify(rows));
      };
      window.__setAccessiblePortfolioError = message => {
        if (message) localStorage.setItem(errorKey, String(message));
        else localStorage.removeItem(errorKey);
      };

      const result = data => ({ data, error: null });
      const mockSupabase = {
        createClient() {
          return {
            auth: {
              getSession: async () => ({ data: { session } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }),
              updateUser: async () => ({ data: { user: session.user }, error: null })
            },
            rpc: async (name, args = {}) => {
              window.__roadmapRpcCalls.push({ name, args: JSON.parse(JSON.stringify(args || {})) });
              if (name === "roadmap_accessible_portfolio" || name === "roadmap_owner_portfolio") {
                const failure = localStorage.getItem(errorKey);
                if (failure) return { data: null, error: { message: failure } };
                portfolio = JSON.parse(localStorage.getItem(portfolioKey) || "[]");
                return result(portfolio);
              }
              if (name === "roadmap_collaborator_list") {
                return result(collaborators);
              }
              if (name === "roadmap_collaborator_invite") {
                const email = String(args.p_email || "").trim().toLowerCase();
                const existing = collaborators.find(row => row.invite_email === email);
                const active = existing?.status === "active";
                const collaborator = Object.assign(existing || {}, {
                  id: existing?.id || "collab-" + (collaborators.length + 1),
                  roadmap_id: args.p_roadmap_id,
                  invite_email: email,
                  role: args.p_role,
                  status: active ? "active" : "pending",
                  created_at: existing?.created_at || "2026-08-21T12:10:00.000Z",
                  updated_at: "2026-08-21T12:10:00.000Z",
                  revoked_at: null,
                });
                if (!existing) collaborators.push(collaborator);
                window.__roadmapCollaborators = collaborators;
                return result({ ok: true, reason: collaborator.status, collaborator });
              }
              if (name === "roadmap_collaborator_revoke") {
                const collaborator = collaborators.find(row => row.id === args.p_collaborator_id);
                if (collaborator) collaborator.revoked_at = "2026-08-21T12:15:00.000Z";
                window.__roadmapCollaborators = collaborators;
                return result({ ok: true, collaborator });
              }
              if (name === "roadmap_save_atomic") {
                const failure = localStorage.getItem(errorKey);
                if (failure) return { data: null, error: { message: failure } };
                const index = portfolio.findIndex(row => row.id === args.p_id);
                const current = index >= 0 ? portfolio[index] : roadmapRow({ id: args.p_id, accessRole: "owner" });
                const saved = Object.assign({}, current, {
                  title: args.p_title,
                  subtitle: args.p_subtitle,
                  template_type: args.p_template_type,
                  public: args.p_public,
                  revision: Number(current.revision || 0) + 1,
                  updated_at: "2026-08-21T12:20:00.000Z",
                  doc: args.p_doc,
                });
                if (index >= 0) portfolio[index] = saved;
                else portfolio.push(saved);
                return result({ ok: true, conflict: false, reason: "saved", roadmap: saved });
              }
              if (name === "roadmap_share_list" || name === "roadmap_public_list") return result([]);
              return result([]);
            },
            functions: {
              invoke: async (name, options = {}) => {
                window.__roadmapRpcCalls.push({ name: "functions:" + name, args: options });
                return result({ roadmap: ${JSON.stringify(aiRoadmap)} });
              }
            }
          };
        }
      };
      Object.defineProperty(window, "supabase", { value: mockSupabase, writable: false, configurable: false });
    })();
  `;
}

async function openRoadmap(page, options = {}) {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript({ content: supabaseMock(options) });
  await page.route("**/assets/vendor/supabase-js-2.110.2.umd.js", route => route.fulfill({
    contentType: "application/javascript",
    body: "/* Supabase is mocked by the test init script. */",
  }));
  await page.route("**/sw.js", route => route.abort());
  await page.goto("../roadmap.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mainContent")).toHaveAttribute("aria-busy", "false");
  return pageErrors;
}

async function openCloudMenu(page) {
  await page.locator("#cloudMenu .menu-btn").click();
  await expect(page.locator("#cloudMenu .menu-list")).toBeVisible();
}

async function rpcCalls(page, name) {
  return page.evaluate(rpcName => window.__roadmapRpcCalls.filter(call => call.name === rpcName), name);
}

test("owner can invite, change a collaborator role, and revoke roadmap access", async ({ page }) => {
  const pageErrors = await openRoadmap(page, {
    accessRole: "owner",
    collaborators: [{
      id: "existing-editor",
      roadmap_id: "shared-roadmap",
      invite_email: "editor@example.com",
      role: "editor",
      status: "active",
      created_at: "2026-08-20T12:00:00.000Z",
      updated_at: "2026-08-20T12:00:00.000Z",
      revoked_at: null,
    }, {
      id: "revoked-viewer",
      roadmap_id: "shared-roadmap",
      invite_email: "revoked@example.com",
      role: "viewer",
      status: "revoked",
      created_at: "2026-08-19T12:00:00.000Z",
      updated_at: "2026-08-20T12:00:00.000Z",
      revoked_at: "2026-08-20T12:00:00.000Z",
    }],
  });

  await expect(page.locator('.access-badge[data-access-role="owner"]')).toBeVisible();
  await openCloudMenu(page);
  const manageAccess = page.locator('#cloudMenu [data-act="access"]');
  await expect(manageAccess).toBeVisible();
  await expect(manageAccess).toHaveText(/Manage access/i);
  await manageAccess.click();

  await expect(page.locator("#accessEmail")).toBeVisible();
  await expect(page.locator("#accessRole")).toHaveValue("editor");
  await expect(page.locator('#accessList [data-collaborator="existing-editor"]')).toContainText("editor@example.com");
  await expect(page.locator('#accessList [data-collaborator="existing-editor"]')).toContainText(/active|joined/i);
  await expect(page.locator('#accessList [data-collaborator="revoked-viewer"]')).toHaveCount(0);

  await page.locator("#accessEmail").fill("New.Viewer@Example.com");
  await page.locator("#accessRole").selectOption("viewer");
  await page.locator("#accessInvite").click();
  await expect.poll(async () => (await rpcCalls(page, "roadmap_collaborator_invite")).some(call =>
    call.args.p_roadmap_id === "shared-roadmap" &&
    call.args.p_email === "new.viewer@example.com" &&
    call.args.p_role === "viewer"
  )).toBe(true);
  await expect(page.locator("#accessList")).toContainText("new.viewer@example.com");

  const existing = page.locator('#accessList [data-collaborator="existing-editor"]');
  await existing.locator("[data-collaborator-role]").selectOption("viewer");
  await expect.poll(async () => (await rpcCalls(page, "roadmap_collaborator_invite")).some(call =>
    call.args.p_email === "editor@example.com" && call.args.p_role === "viewer"
  )).toBe(true);

  page.once("dialog", dialog => dialog.accept());
  await existing.locator("[data-revoke-collaborator]").click();
  await expect.poll(async () => (await rpcCalls(page, "roadmap_collaborator_revoke")).some(call =>
    call.args.p_collaborator_id === "existing-editor"
  )).toBe(true);
  await expect(page.locator('#accessList [data-collaborator="existing-editor"]')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("editor can change and cloud-save a shared roadmap without owner access controls", async ({ page }) => {
  const pageErrors = await openRoadmap(page, { accessRole: "editor" });

  await expect(page.locator('.access-badge[data-access-role="editor"]')).toBeVisible();
  await expect(page.locator("body")).not.toHaveClass(/readonly/);
  await expect(page.locator("#editorCard")).toBeVisible();
  await expect(page.locator("#titleIn")).not.toHaveAttribute("readonly", "");

  await openCloudMenu(page);
  await expect(page.locator('#cloudMenu [data-act="access"]')).toBeHidden();
  await expect(page.locator('#cloudMenu [data-act="share"]')).toBeHidden();
  await expect(page.locator('#cloudMenu [data-act="public"]')).toBeHidden();
  await page.keyboard.press("Escape");

  await page.locator("#titleIn").fill("Editor-updated roadmap");
  await expect.poll(async () => (await rpcCalls(page, "roadmap_save_atomic")).some(call =>
    call.args.p_id === "shared-roadmap" && call.args.p_title === "Editor-updated roadmap"
  ), { timeout: 6_000 }).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("viewer receives the shared roadmap in read-only mode and cannot reach owner controls", async ({ page }) => {
  const pageErrors = await openRoadmap(page, { accessRole: "viewer" });

  await expect(page.locator('.access-badge[data-access-role="viewer"]')).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/access-viewer/);
  await expect(page.locator("body")).not.toHaveClass(/readonly/);
  await expect(page.locator("#titleIn")).toHaveAttribute("readonly", "");
  await expect(page.locator("#subIn")).toHaveAttribute("readonly", "");
  await expect(page.locator("#premiseIn")).toHaveAttribute("readonly", "");
  await expect(page.locator("#rmNotes")).toHaveAttribute("readonly", "");
  await expect(page.locator("#editorCard")).toBeHidden();
  await expect(page.locator('#cloudMenu [data-act="access"]')).toBeHidden();
  await expect(page.locator('#cloudMenu [data-act="share"]')).toBeHidden();
  await expect(page.locator('#cloudMenu [data-act="public"]')).toBeHidden();

  await page.waitForTimeout(1_800);
  expect(await rpcCalls(page, "roadmap_save_atomic")).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("viewer in-place mutation handlers remain inert even when hidden controls are invoked programmatically", async ({ page }) => {
  const pageErrors = await openRoadmap(page, {
    portfolio: [
      roadmapRow({ id: "shared-roadmap", title: "Shared delivery roadmap", accessRole: "viewer", ownerId: "roadmap-owner" }),
      roadmapRow({ id: "second-shared-roadmap", title: "Second shared roadmap", accessRole: "viewer", ownerId: "roadmap-owner" }),
    ],
  });
  await expect(page.locator('.access-badge[data-access-role="viewer"]')).toBeVisible();
  await expect(page.locator("#gantt")).toContainText("Ship collaboration");
  const initialOptions = await page.locator("#rmPicker option").count();

  page.on("dialog", dialog => dialog.accept());
  await page.evaluate(() => {
    const label = document.querySelector('[data-item="shared-roadmap-phase"] [data-role="label"]');
    label.value = "Viewer changed item";
    label.dispatchEvent(new Event("input", { bubbles: true }));

    const template = document.getElementById("tmplPicker");
    template.value = "software";
    template.dispatchEvent(new Event("change", { bubbles: true }));

    for (const action of ["arch", "del", "public", "share", "access"]) {
      document.querySelector(`[data-act="${action}"]`)?.click();
    }
  });

  await page.waitForTimeout(1_800);
  await expect(page.locator("#gantt")).toContainText("Ship collaboration");
  await expect(page.locator("#gantt")).not.toContainText("Viewer changed item");
  await expect(page.locator("#rmPicker option")).toHaveCount(initialOptions);
  await expect(page.locator("#accessEmail")).toHaveCount(0);
  const calls = await page.evaluate(() => window.__roadmapRpcCalls.map(call => call.name));
  for (const forbidden of ["roadmap_save_atomic", "roadmap_soft_delete", "roadmap_share_create", "roadmap_collaborator_invite"]) {
    expect(calls, `${forbidden} is blocked for viewers`).not.toContain(forbidden);
  }
  expect(pageErrors).toEqual([]);
});

test("viewer can use AI to create an owned roadmap without changing the shared source", async ({ page }) => {
  const pageErrors = await openRoadmap(page, { accessRole: "viewer" });
  await expect(page.locator('.access-badge[data-access-role="viewer"]')).toBeVisible();
  await expect(page.locator("#aiBtn")).toBeEnabled();
  await page.locator("#aiBtn").click();
  await expect(page.locator("#aiModal")).toBeVisible();
  await page.locator("#aiText").fill("Create a separate personal delivery plan");
  await page.locator("#aiGen").click();

  await expect(page.locator("#titleIn")).toHaveValue("AI-created personal roadmap");
  await expect(page.locator('.access-badge[data-access-role="owner"]')).toBeVisible();
  await expect.poll(async () => (await rpcCalls(page, "functions:build-roadmap")).length).toBe(1);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("roadmap_builder_v2:collaboration-test-user")));
  expect(state.roadmaps["shared-roadmap"].title).toBe("Shared delivery roadmap");
  expect(state.roadmaps["shared-roadmap"].lanes[0].items[0].label).toBe("Ship collaboration");
  expect((await rpcCalls(page, "roadmap_save_atomic")).some(call => call.args.p_id === "shared-roadmap")).toBe(false);
  expect(pageErrors).toEqual([]);
});

test("viewer can import an owned roadmap without changing the shared source", async ({ page }) => {
  const pageErrors = await openRoadmap(page, { accessRole: "viewer" });
  const imported = roadmapRow({ id: "personal-import", title: "Personal imported roadmap", accessRole: "owner" }).doc;
  await page.setInputFiles("#fileIn", {
    name: "personal-import.roadmap.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });

  await expect(page.locator("#titleIn")).toHaveValue("Personal imported roadmap");
  await expect(page.locator('.access-badge[data-access-role="owner"]')).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("roadmap_builder_v2:collaboration-test-user")));
  expect(state.roadmaps["shared-roadmap"].title).toBe("Shared delivery roadmap");
  expect(state.roadmaps["shared-roadmap"].lanes[0].items[0].label).toBe("Ship collaboration");
  expect((await rpcCalls(page, "roadmap_save_atomic")).some(call => call.args.p_id === "shared-roadmap")).toBe(false);
  expect(pageErrors).toEqual([]);
});

test("revoked shared roadmap stays cached offline and is evicted only after a successful access sync", async ({ page }) => {
  const pageErrors = await openRoadmap(page, { accessRole: "editor" });
  await expect(page.locator("#titleIn")).toHaveValue("Shared delivery roadmap");

  await page.evaluate(() => {
    window.__setAccessiblePortfolio([]);
    window.__setAccessiblePortfolioError("offline during access refresh");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#mainContent")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#titleIn")).toHaveValue("Shared delivery roadmap");
  expect(await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("roadmap_builder_v2:collaboration-test-user"));
    return Boolean(saved.roadmaps["shared-roadmap"]);
  })).toBe(true);

  await page.evaluate(() => window.__setAccessiblePortfolioError(""));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#mainContent")).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("roadmap_builder_v2:collaboration-test-user"));
    return Boolean(saved.roadmaps["shared-roadmap"]);
  })).toBe(false);
  expect(pageErrors).toEqual([]);
});

test("revocation preserves an editor's unsynced offline work as a private owned roadmap", async ({ page }) => {
  const pageErrors = await openRoadmap(page, { accessRole: "editor" });
  await page.evaluate(() => {
    window.__setAccessiblePortfolio([]);
    window.__setAccessiblePortfolioError("offline while editing");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#mainContent")).toHaveAttribute("aria-busy", "false");
  await page.locator("#titleIn").fill("Offline collaborator update");
  await page.waitForTimeout(1_800);

  await page.evaluate(() => window.__setAccessiblePortfolioError(""));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#mainContent")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#titleIn")).toHaveValue(/Offline collaborator update \(Recovered after access ended\)/);

  const recovery = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("roadmap_builder_v2:collaboration-test-user"));
    const recovered = Object.values(saved.roadmaps).find(roadmap => /Recovered after access ended/.test(roadmap.title));
    return {
      originalPresent: Boolean(saved.roadmaps["shared-roadmap"]),
      recovered,
      role: recovered ? saved.sync[recovered.id]?.accessRole : null,
    };
  });
  expect(recovery.originalPresent).toBe(false);
  expect(recovery.recovered?.public).toBe(false);
  expect(recovery.role).toBe("owner");
  expect(pageErrors).toEqual([]);
});

test("signed-in portfolio is loaded through the accessible RPC and labels every access level", async ({ page }) => {
  const portfolio = [
    roadmapRow({ id: "owned-roadmap", title: "Owned roadmap", accessRole: "owner", ownerId: USER_ID }),
    roadmapRow({ id: "editor-roadmap", title: "Editor roadmap", accessRole: "editor", ownerId: "owner-one" }),
    roadmapRow({ id: "viewer-roadmap", title: "Viewer roadmap", accessRole: "viewer", ownerId: "owner-two" }),
  ];
  const pageErrors = await openRoadmap(page, { portfolio });

  await expect.poll(async () => (await rpcCalls(page, "roadmap_accessible_portfolio")).length).toBeGreaterThan(0);
  await page.locator("#segOverview").click();
  await expect(page.locator("#overviewView")).toBeVisible();
  for (const [id, role] of [["owned-roadmap", "owner"], ["editor-roadmap", "editor"], ["viewer-roadmap", "viewer"]]) {
    const card = page.locator(`article.rm-card[data-id="${id}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator(`.access-badge[data-access-role="${role}"]`)).toBeVisible();
  }
  expect(pageErrors).toEqual([]);
});
