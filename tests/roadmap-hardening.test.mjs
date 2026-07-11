import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, "..");
const roadmapPath = resolve(rootDir, "roadmap.html");
const roadmap = readFileSync(roadmapPath, "utf8");
const roadmapMigration = readFileSync(resolve(rootDir, "supabase/migrations/20260711180000_roadmap_data_safety.sql"), "utf8");

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ?? null;
}

function openingTagById(id) {
  const match = roadmap.match(new RegExp(`<[^>]+\\bid\\s*=\\s*(["'])${id}\\1[^>]*>`, "i"));
  assert.ok(match, `Expected an element with id="${id}"`);
  return match[0];
}

// Return the end of a JavaScript block while ignoring braces inside strings and
// comments. This is intentionally small, but sufficient for the inline app.
function blockEnd(source, openIndex) {
  assert.equal(source[openIndex], "{", "Expected an opening brace");
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error("Unterminated JavaScript block");
}

function extractFunctionSource(source, name) {
  const startMatch = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
  assert.ok(startMatch, `Expected function ${name}()`);
  const openIndex = source.indexOf("{", startMatch.index);
  return source.slice(startMatch.index, blockEnd(source, openIndex));
}

function braceDepthAt(source, stopIndex) {
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let escaped = false;
  for (let index = 0; index < stopIndex; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
  }
  return depth;
}

function namedSanitizer(kind) {
  const capitalized = `${kind[0].toUpperCase()}${kind.slice(1)}`;
  const namePattern = `(?:safe|sanitize|normal(?:ize)?|norm|clean|valid)[A-Za-z0-9_$]*${capitalized}[A-Za-z0-9_$]*`;
  const declaration = roadmap.match(new RegExp(`function\\s+(${namePattern})\\s*\\(`, "i"));
  const arrow = roadmap.match(new RegExp(`(?:const|let)\\s+(${namePattern})\\s*=`, "i"));
  return declaration?.[1] ?? arrow?.[1] ?? null;
}

test("the inline roadmap module parses as JavaScript", () => {
  const scripts = [...roadmap.matchAll(/<script\b[^>]*\btype\s*=\s*(["'])module\1[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1, "Expected one inline module script");
  assert.doesNotThrow(
    () => new vm.Script(scripts[0][2], { filename: "roadmap-inline.mjs" }),
    "The inline roadmap module must be valid JavaScript",
  );
});

test("Supabase is loaded from the pinned local vendor asset, never esm.sh", () => {
  assert.doesNotMatch(roadmap, /https:\/\/esm\.sh\/@supabase\/supabase-js/i, "Remove the remote esm.sh import");
  const script = roadmap.match(/<script\b[^>]*\bsrc\s*=\s*(["'])assets\/vendor\/supabase-js-(\d+\.\d+\.\d+)\.umd\.js\1[^>]*>/i);
  assert.ok(script, "Expected an exact-version, self-hosted Supabase browser client");
  assert.ok(
    existsSync(resolve(rootDir, `assets/vendor/supabase-js-${script[2]}.umd.js`)),
    `Expected the vendored Supabase ${script[2]} bundle to exist`,
  );
});

test("the legacy localStorage portfolio is preserved as a copy-on-write recovery source", () => {
  assert.match(roadmap, /const\s+LS_KEY\s*=\s*["']roadmap_builder_v1["']\s*;/, "Keep the existing roadmap_builder_v1 key");
  assert.match(roadmap, /ACCOUNT_KEY_PREFIX\s*=\s*["']roadmap_builder_v2:/, "Use an account-scoped v2 storage key");
  const loadStore = extractFunctionSource(roadmap, "loadStore");
  const persist = extractFunctionSource(roadmap, "persist");
  assert.match(loadStore, /localStorage\.getItem\s*\(\s*LS_KEY\s*\)/, "Startup must read the legacy portfolio");
  assert.match(persist, /localStorage\.setItem\s*\(\s*storageKey\s*,/, "Saves must write the account-scoped working copy");
  assert.doesNotMatch(persist, /localStorage\.setItem\s*\(\s*LS_KEY\s*,/, "The v1 recovery source must remain byte-for-byte untouched");
  assert.doesNotMatch(roadmap, /localStorage\.removeItem\s*\(\s*LS_KEY\s*\)/, "Never delete the only local portfolio copy");
});

test("SVG attributes, document IDs, and lane colors have explicit sanitization", () => {
  const svgEl = extractFunctionSource(roadmap, "svgEl");
  assert.match(
    svgEl,
    /(?:esc(?:ape)?(?:Attr)?|sanitize[A-Za-z0-9_$]*|safe[A-Za-z0-9_$]*)\s*\(\s*attrs\s*\[\s*k\s*\]\s*\)|\.setAttribute\s*\(/i,
    "svgEl() must not interpolate a raw attribute value",
  );

  for (const kind of ["id", "color"]) {
    const helper = namedSanitizer(kind);
    assert.ok(helper, `Define a dedicated ${kind} allow-listing/sanitization helper`);
    const uses = roadmap.match(new RegExp(`\\b${helper}\\s*\\(`, "g")) ?? [];
    assert.ok(uses.length >= 2, `${helper} must be used by document normalization, not merely declared`);
  }

  assert.match(
    roadmap,
    /#\[0-9a-fA-F\]|0-9a-fA-F\]\{6\}|(?:HEX|COLOR)[A-Za-z0-9_$]*RE/i,
    "Lane colors need a strict hexadecimal allow list",
  );
  assert.match(
    roadmap,
    /A-Za-z0-9|a-zA-Z0-9|(?:SAFE|VALID|ID)[A-Za-z0-9_$]*RE/i,
    "Persisted IDs need a restricted character allow list",
  );
});

test("cloud merging always rebinds the active doc after replacing store entries", () => {
  const merge = extractFunctionSource(roadmap, "mergeCloudRoadmaps");
  const overwriteIndex = merge.indexOf("store.roadmaps[d.id] = d");
  assert.notEqual(overwriteIndex, -1, "Expected the cloud merge to install normalized rows");

  const rebind = /\bdoc\s*=\s*store\.roadmaps\s*\[\s*store\.activeId\s*\]/g;
  const matches = [...merge.matchAll(rebind)].filter((match) => match.index > overwriteIndex);
  assert.ok(matches.length, "Rebind doc after a same-ID cloud row replaces the active object");
  assert.ok(
    matches.some((match) => braceDepthAt(merge, match.index) === 1),
    "The post-merge doc rebind must be unconditional, not only inside the missing-active-ID branch",
  );
});

test("cloud saves use the atomic RPC and propagate failures", () => {
  const cloudSave = extractFunctionSource(roadmap, "cloudSave");
  const cloudSaveCore = extractFunctionSource(roadmap, "cloudSaveCore");
  assert.match(cloudSave, /cloudSaveCore\s*\(/, "cloudSave() must serialize through the core save implementation");
  assert.match(cloudSaveCore, /\.rpc\s*\(\s*["']roadmap_save_atomic["']/, "cloudSaveCore() must use the revision-aware save RPC");

  const catches = [...cloudSaveCore.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{/g)];
  for (const caught of catches) {
    const openIndex = cloudSaveCore.indexOf("{", caught.index);
    const catchBlock = cloudSaveCore.slice(openIndex, blockEnd(cloudSaveCore, openIndex));
    assert.match(catchBlock, /\bthrow\b/, "cloudSave() may report an error, but must rethrow it to its caller");
  }

  const togglePublic = extractFunctionSource(roadmap, "togglePublic");
  assert.doesNotMatch(
    togglePublic,
    /catch\s*\([^)]*\)\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?\}/,
    "Publishing must not swallow a failed cloud save and announce false success",
  );
});

test("cloud retries reuse a durable mutation outbox and schedule per roadmap", () => {
  const core = extractFunctionSource(roadmap, "cloudSaveCore");
  assert.match(core, /meta\.saveOutbox\s*=\s*\{[\s\S]{0,300}mutationId\s*:\s*mutationId\s*\(/, "Create one durable save operation before sending");
  assert.match(core, /p_mutation_id\s*:\s*operation\.mutationId/, "Retries must reuse the stored mutation UUID");
  assert.match(core, /p_expected_revision\s*:\s*operation\.expectedRevision/, "Retries must reuse the matching expected revision");
  assert.match(core, /if\s*\(\s*!persist\s*\(\s*\)\s*\)[\s\S]{0,180}throw\s+new\s+Error/, "Never send a mutation whose outbox was not verified locally");
  for (const name of ["cloudSoftDeleteCore", "cloudRestoreCore"]) {
    const source = extractFunctionSource(roadmap, name);
    assert.match(source, /if\s*\(\s*!persist\s*\(\s*\)\s*\)[\s\S]{0,180}throw\s+new\s+Error/, `${name} must abort when its outbox is not durable`);
  }
  assert.match(roadmap, /const\s+cloudSyncTimers\s*=\s*new\s+Map\s*\(/, "Use one debounce timer per roadmap");
  const queue = extractFunctionSource(roadmap, "queueCloudSync");
  assert.match(queue, /cloudSyncTimers\.get\s*\(\s*id\s*\)/, "Debouncing one roadmap must not cancel another roadmap");
});

test("legacy migration is claimed once and cloud Trash is cross-device", () => {
  assert.match(roadmap, /LEGACY_CLAIM_KEY\s*=\s*["']roadmap_builder_v1_claimed_by["']/, "Claim the legacy browser copy to exactly one account");
  const loadStore = extractFunctionSource(roadmap, "loadStore");
  assert.match(loadStore, /legacyClaim[\s\S]{0,500}userId/, "Only the account that claimed v1 may inherit it");
  const ownerReads = roadmap.match(/roadmap_owner_portfolio[\s\S]{0,160}p_include_deleted\s*:\s*true/g) ?? [];
  assert.ok(ownerReads.length >= 2, "Both owner load paths must include soft-deleted roadmaps for cross-device Trash");
  const merge = extractFunctionSource(roadmap, "mergeCloudRoadmaps");
  assert.match(merge, /r\.deleted_at[\s\S]{0,800}store\.trash/, "Deleted server rows must be installed into local Trash");
  assert.match(merge, /r\.deleted_at[\s\S]{0,900}activeLocal[\s\S]{0,900}Recovered before cloud deletion/, "Unsynced active edits must be copied before accepting another device's deletion");
  const deleteConflict = extractFunctionSource(roadmap, "preserveDeleteConflict");
  assert.match(deleteConflict, /activeLocal[\s\S]{0,800}Recovered local changes/, "Delete conflicts must preserve an Undo-restored active copy");
});

test("destructive edits require a verified recovery checkpoint", () => {
  const checkpoint = extractFunctionSource(roadmap, "checkpointUndo");
  assert.match(checkpoint, /if\s*\(\s*!persist\s*\(\s*\)\s*\)\s*\{[\s\S]{0,160}return\s+false/, "Abort when the recovery snapshot cannot be verified");
  for (const label of ["Template replaced", "Lane deleted", "Item deleted", "Analysis card deleted", "Roadmap moved to Trash"]) {
    assert.match(roadmap, new RegExp(`if\\s*\\(\\s*!checkpointUndo\\s*\\(\\s*["']${label}`), `${label} must stop when checkpointing fails`);
  }
});

test("the additive migration snapshots existing rows and exposes only bounded RPCs", () => {
  assert.match(roadmapMigration, /insert\s+into\s+public\.roadmap_revisions[\s\S]{0,1800}'baseline'/i, "Create a revision-zero recovery snapshot before writes");
  assert.doesNotMatch(roadmapMigration, /delete\s+from\s+public\.(?:roadmaps|roadmap_shares)|truncate\s+(?:table\s+)?public\.(?:roadmaps|roadmap_shares)/i, "Never delete existing roadmap/share rows in the additive migration");
  assert.match(roadmapMigration, /set\s+revoked\s*=\s*true[\s\S]{0,180}where\s+revoked\s+is\s+null/i, "Legacy unknown share state must fail closed");
  assert.match(roadmapMigration, /schema allowlist/i, "Public documents must use a schema allowlist");
  assert.match(roadmapMigration, /limit\s+100[\s\S]{0,5000}limit\s+500/i, "Public lane/item arrays must be bounded");
  assert.match(roadmapMigration, /before\s+delete\s+on\s+public\.roadmaps/i, "Hard deletes must be blocked");
});

test("owner, save, delete, public, and share traffic uses the hardened RPC surface", () => {
  const requiredRpcs = [
    "roadmap_owner_portfolio",
    "roadmap_save_atomic",
    "roadmap_soft_delete",
    "roadmap_restore",
    "roadmap_public_list",
    "roadmap_public_get",
    "roadmap_share_create",
    "roadmap_share_list",
    "roadmap_share_revoke",
    "roadmap_shared_get",
  ];
  for (const rpc of requiredRpcs) {
    assert.match(roadmap, new RegExp(`\\.rpc\\s*\\(\\s*["']${rpc}["']`), `Expected the ${rpc} RPC path`);
  }
  assert.doesNotMatch(
    roadmap,
    /\.from\s*\(\s*["'](?:roadmaps|roadmap_shares)["']\s*\)/,
    "The browser must not bypass the safe roadmap RPCs with direct table access",
  );
});

test("users can download one recovery file containing the complete local portfolio", () => {
  const functionNames = [...roadmap.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]);
  const exportName = functionNames.find((name) =>
    /(?:export|download).*(?:portfolio|all)|(?:portfolio|all).*(?:export|download)/i.test(name),
  );
  assert.ok(exportName, "Add a clearly named full-portfolio download/export function");
  const exporter = extractFunctionSource(roadmap, exportName);
  assert.match(exporter, /store\.roadmaps/, "The portfolio export must include every roadmap, not only doc");
  assert.match(exporter, /JSON\.stringify/, "The portfolio export needs a portable JSON recovery payload");
  assert.match(exporter, /\b(?:download|Blob)\b/, "The portfolio export must create a downloadable file");
  const invocations = roadmap.match(new RegExp(`\\b${exportName}\\b`, "g")) ?? [];
  assert.ok(invocations.length >= 2, "Expose the full-portfolio export through the UI");
});

test("the app has navigation landmarks, a skip link, and real dialog semantics", () => {
  const skip = roadmap.match(/<a\b[^>]*\bhref\s*=\s*(["'])#([^"']+)\1[^>]*>[^<]*(?:skip|content)/i);
  assert.ok(skip, "Add a keyboard-visible skip link to the main content");
  openingTagById(skip[2]);

  assert.match(roadmap, /<header\b/i, "Use a header landmark");
  assert.match(roadmap, /<nav\b[^>]*(?:aria-label|aria-labelledby)\s*=/i, "Give the primary navigation an accessible name");
  assert.match(roadmap, /<main\b[^>]*\bid\s*=/i, "Wrap the application content in a main landmark");
  assert.match(roadmap, /<h1\b/i, "Expose the page title as an h1");

  const modalTags = [...roadmap.matchAll(/<(?:div|dialog)\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => (attribute(tag, "class") ?? "").split(/\s+/).includes("modal"));
  assert.ok(modalTags.length >= 2, "Expected the roadmap dialogs to be present");
  for (const tag of modalTags) {
    const id = attribute(tag, "id") ?? tag;
    if (!/^<dialog\b/i.test(tag)) assert.equal(attribute(tag, "role"), "dialog", `${id} needs role=dialog`);
    assert.equal(attribute(tag, "aria-modal"), "true", `${id} needs aria-modal=true`);
    const label = attribute(tag, "aria-label");
    const labelledBy = attribute(tag, "aria-labelledby");
    assert.ok(label || labelledBy, `${id} needs aria-label or aria-labelledby`);
    if (labelledBy) openingTagById(labelledBy);
  }
  assert.match(roadmap, /(?:Escape|["']Escape["'])/, "Dialogs must support the Escape key");
  assert.match(roadmap, /(?:previous|prior|return|restore)[A-Za-z0-9_$]*(?:Focus|focus)|\.focus\s*\(\)/, "Dialogs must restore or deliberately manage focus");
});

test("narrow screens receive an explicit responsive layout", () => {
  const media = [...roadmap.matchAll(/@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)\s*\{/gi)]
    .find((match) => Number(match[1]) <= 768);
  assert.ok(media, "Add a phone-width @media (max-width: 768px or narrower) rule");
  const openIndex = roadmap.indexOf("{", media.index);
  const body = roadmap.slice(openIndex, blockEnd(roadmap, openIndex));
  assert.match(body, /\.(?:topbar|toolbar|portfolio|portfolio-grid|app-shell|tl-scroll|timeline)/, "The mobile rule must target primary app layout");
  assert.match(body, /(?:grid-template-columns|flex-wrap|overflow-x|width\s*:|display\s*:)/, "The mobile rule must materially reflow or contain the layout");
});

test("the one-time database backup workflow and certificate are not published", () => {
  assert.equal(
    existsSync(resolve(rootDir, ".github/workflows/backup-roadmap-data.yml")),
    false,
    "Remove the one-time roadmap backup workflow after the verified backup is retained offline",
  );
  assert.equal(
    existsSync(resolve(rootDir, ".github/roadmap-backup-certificate.pem")),
    false,
    "Remove the one-time backup certificate from the repository",
  );
});
