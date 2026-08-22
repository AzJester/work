import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, "..");
const roadmapPath = resolve(rootDir, "roadmap.html");
const migrationPath = resolve(rootDir, "supabase/migrations/20260821010000_roadmap_collaboration.sql");
const pagesWorkflowPath = resolve(rootDir, ".github/workflows/pages.yml");
const keepAliveWorkflowPath = resolve(rootDir, ".github/workflows/supabase-ping.yml");
const roadmap = readFileSync(roadmapPath, "utf8");
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const pagesWorkflow = readFileSync(pagesWorkflowPath, "utf8");
const keepAliveWorkflow = readFileSync(keepAliveWorkflowPath, "utf8");

function requireMigration() {
  assert.ok(existsSync(migrationPath), "Add the additive per-roadmap collaboration migration");
  return migration;
}

function functionWindow(source, name) {
  const start = source.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, "i"));
  assert.notEqual(start, -1, `Expected public.${name}()`);
  const remainder = source.slice(start);
  const delimiterMatch = /\bas\s+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/i.exec(remainder);
  assert.ok(delimiterMatch, `Expected a dollar-quoted body for public.${name}()`);
  const delimiter = delimiterMatch[1];
  const bodyStart = delimiterMatch.index + delimiterMatch[0].length;
  const bodyEnd = remainder.indexOf(delimiter, bodyStart);
  assert.notEqual(bodyEnd, -1, `Expected the closing ${delimiter} for public.${name}()`);
  return remainder.slice(0, bodyEnd + delimiter.length);
}

function jsBlockEnd(source, openIndex) {
  assert.equal(source[openIndex], "{", "Expected an opening brace");
  let depth = 0, quote = null, lineComment = false, blockComment = false, escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index], next = source[index + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return index + 1;
  }
  throw new Error(`Unterminated JavaScript function at ${openIndex}`);
}

function jsFunctionWindow(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
  assert.ok(match, `Expected ${name}()`);
  const openIndex = source.indexOf("{", match.index);
  return source.slice(match.index, jsBlockEnd(source, openIndex));
}

test("the collaboration migration is additive, role-constrained, and closed to direct browser access", () => {
  const sql = requireMigration();

  assert.match(sql, /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.roadmap_collaborators\b/i);
  for (const column of ["roadmap_id", "invite_email", "claimed_user_id", "role", "invited_by", "revoked_at"]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, "i"), `Expected roadmap_collaborators.${column}`);
  }
  assert.match(sql, /check\s*\([^)]*role[^)]*(?:editor[^)]*viewer|viewer[^)]*editor)[^)]*\)/i, "Only editor/viewer collaborator roles are valid");
  assert.match(
    sql,
    /create\s+unique\s+index[^;]+\(\s*roadmap_id\s*,\s*invite_email\s*\)[^;]+where\s+revoked_at\s+is\s+null/i,
    "An email may have only one active invitation per roadmap while revoked history remains auditable",
  );
  assert.match(
    sql,
    /create\s+unique\s+index[^;]+\(\s*roadmap_id\s*,\s*claimed_user_id\s*\)[^;]+where\s+claimed_user_id\s+is\s+not\s+null\s+and\s+revoked_at\s+is\s+null/i,
    "An account may have only one effective active role per roadmap",
  );
  assert.match(sql, /lower\s*\([^)]*invite_email/i, "Invitation email matching must be case-insensitive");
  assert.match(sql, /enable\s+row\s+level\s+security/i, "RLS must remain enabled even though access is RPC-only");
  assert.match(
    sql,
    /revoke\s+all(?:\s+privileges)?\s+on\s+table\s+public\.roadmap_collaborators\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    "Browser roles must not access the collaborator table directly",
  );
  assert.doesNotMatch(
    sql,
    /\b(?:drop\s+table|truncate\s+(?:table\s+)?|delete\s+from)\s+public\.(?:roadmaps|roadmap_shares|roadmap_revisions)\b/i,
    "Collaboration rollout must not delete existing roadmap data",
  );
});

test("the collaboration RPC surface is authenticated, security-definer, and narrowly granted", () => {
  const sql = requireMigration();
  const rpcNames = [
    "roadmap_accessible_portfolio",
    "roadmap_collaborator_list",
    "roadmap_collaborator_invite",
    "roadmap_collaborator_revoke",
  ];

  for (const name of rpcNames) {
    const fn = functionWindow(sql, name);
    assert.match(fn, /security\s+definer/i, `${name} must enforce access behind SECURITY DEFINER`);
    assert.match(fn, /set\s+search_path\s*=\s*(?:''|pg_catalog)/i, `${name} must pin a safe search_path`);
    assert.match(fn, /auth\.uid\s*\(\s*\)/i, `${name} must derive the caller from auth.uid()`);
  }

  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.roadmap_accessible_portfolio\s*\(\s*boolean\s*\)\s+to\s+authenticated/i);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.roadmap_collaborator_list\s*\(\s*text\s*\)\s+to\s+authenticated/i);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.roadmap_collaborator_invite\s*\(\s*text\s*,\s*text\s*,\s*text\s*\)\s+to\s+authenticated/i);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.roadmap_collaborator_revoke\s*\(\s*uuid\s*\)\s+to\s+authenticated/i);
  assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function\s+public\.roadmap_collaborator_(?:list|invite|revoke)[^;]*\s+to\s+(?:anon|public)\b/i);
});

test("accessible portfolio and collaborator management are scoped to active memberships and owners", () => {
  const sql = requireMigration();
  const portfolio = functionWindow(sql, "roadmap_accessible_portfolio");
  const accessJson = functionWindow(sql, "roadmap_access_json");
  assert.match(accessJson, /['"]access_role['"]/i, "Portfolio rows must tell the browser whether access is owner, editor, or viewer");
  assert.match(accessJson, /['"]owner_email['"]/i, "Portfolio rows must identify the roadmap owner");
  assert.match(portfolio, /roadmap_access_json/i, "Portfolio rows must pass through the access metadata builder");
  assert.match(portfolio, /(?:user_id\s*=\s*v_user_id|r\.user_id\s*=\s*v_user_id)/i, "Owners retain access to their roadmaps");
  assert.match(portfolio, /roadmap_collaborators/i, "Shared roadmaps must be included in the signed-in portfolio");
  assert.match(portfolio, /revoked_at\s+is\s+null/i, "Revoked memberships must never remain accessible");
  assert.match(portfolio, /claimed_user_id\s*=\s*v_user_id/i, "A collaboration row must be claimed by the signed-in user");

  for (const name of ["roadmap_collaborator_list", "roadmap_collaborator_invite", "roadmap_collaborator_revoke"]) {
    const fn = functionWindow(sql, name);
    assert.match(fn, /roadmaps/i, `${name} must resolve the target roadmap`);
    assert.match(fn, /user_id[^;]{0,500}(?:auth\.uid|v_user_id)|(?:auth\.uid|v_user_id)[^;]{0,500}user_id/i, `${name} must verify roadmap ownership`);
  }

  const invite = functionWindow(sql, "roadmap_collaborator_invite");
  assert.match(invite, /lower\s*\(\s*(?:pg_catalog\.)?(?:trim|btrim)\s*\(/i, "Invite email must be normalized before lookup/storage");
  assert.match(invite, /(?:editor|viewer)/i, "Invite must accept only the two collaborator roles");
  assert.match(invite, /from\s+auth\.users\s+u[\s\S]{0,300}where\s+u\.id\s*=\s*v_user_id/i, "Invite may inspect only the caller's Auth row to reject self-access");
  assert.doesNotMatch(invite, /where[\s\S]{0,200}(?:lower|btrim)\s*\([^;]*u\.email[^;]*=\s*v_email/i, "Invite must not expose whether an arbitrary target email has an Auth account");

  const revoke = functionWindow(sql, "roadmap_collaborator_revoke");
  assert.match(revoke, /revoked_at\s*=\s*(?:now|clock_timestamp)\s*\(/i, "Revocation must be durable rather than a client-only hide");
});

test("claiming a current-email invitation retires an older active grant for the same account", () => {
  const sql = requireMigration();
  const claim = functionWindow(sql, "roadmap_claim_pending_invitation", 12_000);
  const roadmapLock = claim.search(/from\s+public\.roadmaps\s+r[\s\S]{0,300}for\s+update/i);
  const collaboratorLock = claim.search(/from\s+public\.roadmap_collaborators\s+c[\s\S]{0,500}for\s+update/i);
  const revokeOlder = claim.search(/set\s+revoked_at\s*=\s*v_changed_at/i);
  const bindPending = claim.search(/set\s+claimed_user_id\s*=\s*p_user_id/i);
  assert.ok(roadmapLock >= 0 && collaboratorLock > roadmapLock, "Claims must lock the roadmap before a collaborator row");
  assert.ok(revokeOlder > collaboratorLock && bindPending > revokeOlder, "Claims must revoke an older role before binding the new role");

  const portfolio = functionWindow(sql, "roadmap_accessible_portfolio", 20_000);
  assert.match(portfolio, /select\s+distinct\s+c\.roadmap_id[\s\S]{0,800}order\s+by\s+c\.roadmap_id[\s\S]{0,800}roadmap_claim_pending_invitation/i, "Portfolio claims must use stable roadmap lock ordering");

  const save = functionWindow(sql, "roadmap_save_atomic", 20_000);
  const saveRoadmapLock = save.search(/from\s+public\.roadmaps\s+r[\s\S]{0,300}for\s+update/i);
  const saveClaim = save.search(/roadmap_claim_pending_invitation/i);
  const effectiveRole = save.search(/bool_or\s*\(\s*c\.role\s*=\s*['"]editor['"]\s*\)/i);
  assert.ok(saveRoadmapLock >= 0 && saveClaim > saveRoadmapLock, "Save must lock the roadmap before claiming or retiring collaborator rows");
  assert.ok(effectiveRole > saveClaim, "Save must compute Editor/Viewer only after the current-email grant supersedes older roles");

  const invite = functionWindow(sql, "roadmap_collaborator_invite", 20_000);
  const activeRoleUpdate = invite.match(/select\s+c\.\*[\s\S]+?if\s+found\s+then([\s\S]+?)else\s+insert\s+into\s+public\.roadmap_collaborators/i);
  assert.ok(activeRoleUpdate, "Invite must have an explicit active-email role-update branch");
  assert.doesNotMatch(activeRoleUpdate[1], /claimed_user_id\s*=/i, "A role update must not unclaim or transfer an already-bound account");
  assert.doesNotMatch(invite, /roadmap_claim_pending_invitation\s*\(/i, "Invites must remain pending until the target account claims them itself");

  const revoke = functionWindow(sql, "roadmap_collaborator_revoke", 12_000);
  const revokeRoadmapLock = revoke.search(/select\s+r\.id[\s\S]{0,800}for\s+update\s+of\s+r/i);
  const revokeCollaboratorLock = revoke.search(/select\s+c\.\*[\s\S]{0,500}for\s+update/i);
  assert.ok(revokeRoadmapLock >= 0 && revokeCollaboratorLock > revokeRoadmapLock, "Revocation must lock the roadmap before its collaborator row");
});

test("deleted Auth accounts are revoked before their claimed UUID is cleared", () => {
  const sql = requireMigration();
  const cleanup = functionWindow(sql, "roadmap_revoke_deleted_user_collaborations", 8_000);
  assert.match(cleanup, /security\s+definer/i, "Auth deletion cleanup must retain permission to update the private grant table");
  assert.match(cleanup, /set\s+revoked_at\s*=\s*v_changed_at/i, "Auth deletion must soft-revoke matching grants");
  assert.match(cleanup, /where\s+c\.revoked_at\s+is\s+null[\s\S]{0,300}c\.claimed_user_id\s*=\s*old\.id/i, "Active grants must be soft-revoked for the deleted Auth identity");
  assert.match(cleanup, /claimed_user_id\s+is\s+null[\s\S]{0,300}invite_email\s*=\s*pg_catalog\.lower\s*\([\s\S]{0,200}old\.email/i, "Pending grants for the deleted email must also be revoked to close a concurrent claim/delete race");
  assert.match(sql, /create\s+trigger\s+roadmap_revoke_deleted_user_collaborations\s+before\s+delete\s+on\s+auth\.users[\s\S]{0,300}execute\s+function\s+public\.roadmap_revoke_deleted_user_collaborations\s*\(\s*\)/i);
});

test("collaborator responses and invitations do not enumerate Auth accounts", () => {
  const sql = requireMigration();
  const collaboratorJson = functionWindow(sql, "roadmap_collaborator_json", 5_000);
  assert.doesNotMatch(collaboratorJson, /['"]claimed_user_id['"]\s*,/i, "Owner-facing JSON must not expose a target Auth UUID");
  assert.doesNotMatch(collaboratorJson, /['"]claimed_email['"]\s*,/i, "Owner-facing JSON must not expose a target's live Auth email");

  const invite = functionWindow(sql, "roadmap_collaborator_invite", 20_000);
  assert.doesNotMatch(invite, /select\s+u\.id[\s\S]{0,400}u\.email/i, "Invite must not resolve an arbitrary target email to an Auth UUID");
  assert.doesNotMatch(invite, /order\s+by\s+u\.created_at/i, "Invite must not scan Auth users for a target account");
  assert.doesNotMatch(invite, /claimed_user_id\s*=/i, "Only the signed-in target's claim path may bind an invitation to an Auth UUID");
});

test("atomic save authorizes owners and editors while rejecting viewers", () => {
  const sql = requireMigration();
  const save = functionWindow(sql, "roadmap_save_atomic", 18_000);
  assert.match(save, /roadmap_collaborators/i, "roadmap_save_atomic must enforce collaborator access itself");
  assert.match(save, /role\s*=\s*['"]editor['"]/i, "Editors may save shared roadmaps");
  assert.match(save, /revoked_at\s+is\s+null/i, "Revoked editors may not save");
  assert.match(save, /claimed_user_id/i, "Only the account that claimed the invitation may save");
  assert.match(save, /(?:viewer|edit access|permission denied|not authorized)/i, "Non-editors must receive an explicit rejection path");
  assert.match(save, /v_row\.user_id|r\.user_id|roadmaps\.user_id/i, "Collaborative saves must preserve the roadmap owner");
});

test("the browser uses only collaboration RPCs and exposes stable access-management hooks", () => {
  for (const rpc of [
    "roadmap_accessible_portfolio",
    "roadmap_collaborator_list",
    "roadmap_collaborator_invite",
    "roadmap_collaborator_revoke",
  ]) {
    assert.match(roadmap, new RegExp(`\\.rpc\\s*\\(\\s*["']${rpc}["']`), `Expected the ${rpc} RPC path`);
  }
  assert.doesNotMatch(
    roadmap,
    /\.from\s*\(\s*["']roadmap_collaborators["']\s*\)/,
    "The browser must not bypass collaboration RPC authorization",
  );
  assert.match(roadmap, /data-act\s*=\s*["']access["'][^>]*>\s*Manage collaborators…?\s*</i);
  for (const id of ["accessEmail", "accessRole", "accessInvite", "accessList"]) {
    assert.match(roadmap, new RegExp(`\\bid\\s*=\\s*["']${id}["']`), `Expected stable #${id} access dialog hook`);
  }
  assert.match(roadmap, /data-collaborator/i);
  assert.match(roadmap, /data-collaborator-role/i);
  assert.match(roadmap, /data-revoke-collaborator/i);
  assert.match(roadmap, /access-badge/i);
  assert.match(roadmap, /data-access-role/i);
});

test("frontend access guards make viewers read-only and keep owner management owner-only", () => {
  assert.match(roadmap, /access_role|accessRole/i, "The client must retain each roadmap's server-derived access role");
  assert.match(roadmap, /(?:viewer[^\n]{0,240}readOnly|readOnly[^\n]{0,240}viewer)/i, "Viewer access must activate the existing read-only boundary");
  assert.match(roadmap, /(?:owner[^\n]{0,400}(?:data-act|access)|(?:data-act|access)[^\n]{0,400}owner)/i, "Manage access must be restricted to owners in the UI");

  const save = jsFunctionWindow(roadmap, "cloudSaveCore");
  assert.match(save, /(?:editor|owner|canEdit|accessRole)/i, "Cloud saving must fail locally for a viewer as well as at the database boundary");

  const menu = jsFunctionWindow(roadmap, "runMenuAction");
  assert.match(menu, /access\s*:/i, "The Manage access menu action must be wired");
});

test("every in-place viewer mutation path has a function-level guard, not only hidden controls", () => {
  for (const name of ["onEditorInput", "onEditorChange", "onEditorClick", "onCalloutInput", "onCalloutClick", "applyTemplate"]) {
    assert.match(
      jsFunctionWindow(roadmap, name),
      /currentRoadmapReadOnly\s*\(\s*\)/,
      `${name} must reject viewer mutations even when invoked outside the visible UI`,
    );
  }

  for (const name of ["deleteRoadmapById", "toggleArchiveById", "togglePublic", "shareFlow", "manageAccessFlow"] ) {
    assert.match(
      jsFunctionWindow(roadmap, name),
      /isRoadmapOwner\s*\(/,
      `${name} must be restricted to the roadmap owner`,
    );
  }

  const wire = jsFunctionWindow(roadmap, "wire", 14_000);
  assert.match(wire, /titleIn[\s\S]{0,300}currentRoadmapReadOnly/, "Programmatic title input must not mutate a viewer document");
  assert.match(wire, /subIn[\s\S]{0,300}currentRoadmapReadOnly/, "Programmatic subtitle input must not mutate a viewer document");
  assert.match(wire, /rmNotes[\s\S]{0,300}currentRoadmapReadOnly/, "Programmatic notes input must not mutate a viewer document");
});

test("viewer-safe creation paths make a new owner roadmap instead of mutating the shared source", () => {
  for (const name of ["importJsonFile", "importJiraCsv", "generateFromDescription"]) {
    const source = jsFunctionWindow(roadmap, name, 12_000);
    assert.doesNotMatch(source, /currentRoadmapReadOnly\s*\(\s*\)/, `${name} must remain available while a viewer is looking at a shared roadmap`);
    assert.match(source, /markOwnedLocalRoadmap\s*\(/, `${name} must label its new roadmap as owned by the signed-in creator`);
  }
  assert.doesNotMatch(jsFunctionWindow(roadmap, "openAi"), /currentRoadmapReadOnly\s*\(\s*\)/, "A viewer may open the AI builder to create a separate owned roadmap");
});

test("accessible-portfolio reconciliation removes revoked shared cache only after a successful response", () => {
  const merge = jsFunctionWindow(roadmap, "mergeCloudRoadmaps");
  const reconcile = jsFunctionWindow(roadmap, "reconcileRevokedSharedRoadmaps");
  assert.match(merge, /roadmap_accessible_portfolio/, "Signed-in reconciliation must use the access-aware portfolio RPC");
  assert.match(reconcile, /accessRole[\s\S]{0,800}delete\s+store\.roadmaps/i, "Successful reconciliation must evict shared roadmaps that are no longer accessible");

  const requestIndex = merge.search(/roadmap_accessible_portfolio/);
  const errorIndex = merge.search(/catch\s*\(/);
  const evictionIndex = merge.search(/reconcileRevokedSharedRoadmaps\s*\(/);
  assert.ok(requestIndex >= 0 && errorIndex > requestIndex, "The accessible portfolio request must have an explicit offline/error path");
  assert.ok(evictionIndex > errorIndex, "Cache eviction must happen after the RPC succeeds, never in the error path");
});

test("revocation preserves unsynced or diverged shared work as a private owned copy", () => {
  const recover = jsFunctionWindow(roadmap, "recoverSharedRoadmapBeforeRemoval");
  const reconcile = jsFunctionWindow(roadmap, "reconcileRevokedSharedRoadmaps");
  assert.match(recover, /meta\.pending/);
  assert.match(recover, /meta\.saveOutbox/);
  assert.match(recover, /docFingerprint\s*\(\s*local\s*\)\s*!==\s*base/);
  assert.match(recover, /copy\.public\s*=\s*false/, "A recovered copy must never inherit publication state");
  assert.match(recover, /markOwnedLocalRoadmap\s*\(/, "The preserved copy must belong to the former collaborator");
  assert.match(recover, /queueCloudSync\s*\(\s*copy\.id\s*\)/, "The preserved copy must be queued for durable cloud persistence");
  assert.ok(
    reconcile.indexOf("recoverSharedRoadmapBeforeRemoval") < reconcile.indexOf("delete store.roadmaps"),
    "Recovery must happen before the revoked shared source is evicted",
  );
});

test("Pages backend detection covers every commit in a push before publishing", () => {
  assert.match(pagesWorkflow, /fetch-depth:\s*0/, "The push's before commit must be available locally");
  assert.match(pagesWorkflow, /BEFORE_SHA:\s*\$\{\{\s*github\.event\.before\s*\}\}/);
  assert.match(pagesWorkflow, /CURRENT_SHA:\s*\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(pagesWorkflow, /0000000000000000000000000000000000000000/, "A new branch's zero before-SHA must fail safe");
  assert.match(pagesWorkflow, /git diff --name-only "\$BEFORE_SHA" "\$CURRENT_SHA"/, "Inspect the complete push range");
  assert.doesNotMatch(pagesWorkflow, /git diff --name-only HEAD\^ HEAD/, "Checking only the final commit can skip an earlier migration");
});

test("Supabase keep-alive uses a successful data-path RPC with the opaque key in the apikey header only", () => {
  assert.match(keepAliveWorkflow, /\/rest\/v1\/rpc\/secure_shared_dashboard/);
  assert.match(keepAliveWorkflow, /p_token[^\n]+00000000-0000-0000-0000-000000000000/);
  assert.match(keepAliveWorkflow, /apikey:\s*\$KEY/);
  assert.doesNotMatch(
    keepAliveWorkflow,
    /Authorization:\s*Bearer\s*\$KEY/i,
    "Opaque sb_publishable keys are not JWTs and must never be sent as Bearer tokens",
  );
  assert.match(keepAliveWorkflow, /case\s+"\$code"\s+in[\s\S]{0,120}2\?\?/);
});
