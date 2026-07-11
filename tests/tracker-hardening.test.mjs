import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, "..");
const tracker = readFileSync(resolve(rootDir, "tracker.html"), "utf8");
const dashboard = readFileSync(resolve(rootDir, "dashboard.html"), "utf8");
const serviceWorker = readFileSync(resolve(rootDir, "sw.js"), "utf8");
const migration = readFileSync(resolve(rootDir, "supabase/migrations/20260711060000_tracker_hardening.sql"), "utf8");
const pagesWorkflow = readFileSync(resolve(rootDir, ".github/workflows/pages.yml"), "utf8");
const edgeNames = ["weekly-summary", "extract-tasks", "task-actions", "plan-day", "build-roadmap", "roadmap-summary"];
const edgeSources = Object.fromEntries(edgeNames.map((name) => [
  name,
  readFileSync(resolve(rootDir, `supabase/functions/${name}/index.ts`), "utf8"),
]));

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2] ?? null;
}

function openingTagById(id) {
  const match = tracker.match(new RegExp(`<[^>]+\\bid\\s*=\\s*(["'])${id}\\1[^>]*>`, "i"));
  assert.ok(match, `Expected an element with id="${id}"`);
  return match[0];
}

function hasAccessibleName(tag) {
  return Boolean(attribute(tag, "aria-label") || attribute(tag, "aria-labelledby"));
}

function extractFunctionSource(source, name) {
  const startMatch = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
  assert.ok(startMatch, `Expected function ${name}()`);
  const remainder = source.slice(startMatch.index + startMatch[0].length);
  const nextFunction = remainder.search(/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/);
  assert.notEqual(nextFunction, -1, `Could not find the end of function ${name}()`);
  return source.slice(startMatch.index, startMatch.index + startMatch[0].length + nextFunction).trim();
}

test("legacy esc helper is absent or performs real HTML escaping", () => {
  const identityEsc = /function\s+esc\s*\([^)]*\)\s*\{\s*return\s+String\([^;]+\);?\s*\}/;
  assert.doesNotMatch(
    tracker,
    identityEsc,
    "esc() must not return user-controlled text unchanged; remove it or delegate to escHtml()",
  );

  const escDefinition = tracker.match(/(?:function\s+esc\s*\([^)]*\)\s*\{[\s\S]{0,240}?\}|const\s+esc\s*=\s*[^;]+;)/);
  if (escDefinition) {
    assert.match(
      escDefinition[0],
      /escHtml|replace\s*\(/,
      "Any remaining esc helper must encode HTML metacharacters",
    );
  }
});

test("the HTML hidden attribute always wins over component display rules", () => {
  assert.match(
    tracker,
    /(?:^|})\s*(?:\*|:where\()?\[hidden\]\)?\s*\{[^}]*display\s*:\s*none\s*!important\s*;?[^}]*\}/m,
    "Add a global [hidden] { display: none !important; } rule",
  );
});

test("primary tabs and insight launchers expose complete ARIA relationships", () => {
  const tabList = openingTagById("nav-tabs");
  assert.equal(attribute(tabList, "role"), "tablist");

  const tabIds = [
    "today",
    "week",
    "portfolio",
    "projects",
    "insights",
  ];
  for (const name of tabIds) {
    const tabId = `tab-${name}`;
    const panelId = `v-${name}`;
    const tab = openingTagById(tabId);
    const panel = openingTagById(panelId);

    assert.equal(attribute(tab, "role"), "tab", `${tabId} needs role="tab"`);
    assert.equal(attribute(tab, "aria-controls"), panelId, `${tabId} must control ${panelId}`);
    assert.match(attribute(tab, "aria-selected") ?? "", /^(?:true|false)$/, `${tabId} needs aria-selected`);
    assert.equal(attribute(panel, "role"), "tabpanel", `${panelId} needs role="tabpanel"`);
    assert.equal(attribute(panel, "aria-labelledby"), tabId, `${panelId} must be labelled by ${tabId}`);
  }

  for (const name of ["history", "completed", "kudos", "kpis"]) {
    const launcherId = `tab-${name}`;
    const panelId = `v-${name}`;
    const launcher = openingTagById(launcherId);
    const panel = openingTagById(panelId);

    assert.match(launcher, /^<button\b/i, `${launcherId} should be a native button`);
    assert.equal(attribute(launcher, "aria-controls"), panelId, `${launcherId} must control ${panelId}`);
    assert.equal(attribute(panel, "role"), "region", `${panelId} needs role="region"`);
    assert.equal(attribute(panel, "aria-labelledby"), launcherId, `${panelId} must be labelled by ${launcherId}`);
  }

  assert.match(tracker, /setAttribute\s*\(\s*["']aria-selected["']/, "Tab selection must be updated in JavaScript");
  assert.match(tracker, /\.tabIndex\s*=|setAttribute\s*\(\s*["']tabindex["']/, "Tabs need roving tabindex state");
});

test("every modal is an accessible, named dialog", () => {
  const modalTags = [...tracker.matchAll(/<(?:div|dialog)\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => (attribute(tag, "class") ?? "").split(/\s+/).includes("modal"));
  assert.ok(modalTags.length >= 7, "Expected all tracker modals to be present");

  for (const tag of modalTags) {
    const id = attribute(tag, "id") ?? tag;
    if (!/^<dialog\b/i.test(tag)) assert.equal(attribute(tag, "role"), "dialog", `${id} needs role="dialog"`);
    assert.equal(attribute(tag, "aria-modal"), "true", `${id} needs aria-modal="true"`);
    assert.ok(hasAccessibleName(tag), `${id} needs aria-label or aria-labelledby`);
    const labelledBy = attribute(tag, "aria-labelledby");
    if (labelledBy) openingTagById(labelledBy);
  }

  for (const closeId of ["aiClose", "dayClose", "qcClose", "ckClose", "planClose", "notesClose", "tnClose"]) {
    assert.match(attribute(openingTagById(closeId), "aria-label") ?? "", /close/i, `${closeId} needs a descriptive aria-label`);
  }
});

test("primary editors have labels and asynchronous feedback has live-region semantics", () => {
  for (const id of ["qcInput", "ckInput", "notesInput", "tnInput"]) {
    const tag = openingTagById(id);
    const labelled = hasAccessibleName(tag) || new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*(["'])${id}\\1`, "i").test(tracker);
    assert.ok(labelled, `${id} needs a persistent accessible label; a placeholder is not enough`);
  }

  for (const [id, allowedRoles] of [
    ["authNote", /^(?:alert|status)$/],
    ["savestate", /^status$/],
    ["toast", /^(?:alert|status)$/],
  ]) {
    const tag = openingTagById(id);
    const role = attribute(tag, "role") ?? "";
    const ariaLive = attribute(tag, "aria-live") ?? "";
    assert.ok(allowedRoles.test(role) || /^(?:polite|assertive)$/.test(ariaLive), `${id} needs status/alert live-region semantics`);
  }

  for (const variable of ["task", "sel", "pri", "rng"]) {
    assert.match(
      tracker,
      new RegExp(`${variable}\\.(?:ariaLabel\\s*=|setAttribute\\s*\\(\\s*["']aria-label["'])`),
      `The dynamic ${variable} task control needs an accessible name`,
    );
  }
  assert.match(tracker, /el\.setAttribute\s*\(\s*["']role["']\s*,\s*["']textbox["']/, "The rich-text editor needs role=textbox");
  assert.match(tracker, /el\.setAttribute\s*\(\s*["']aria-multiline["']\s*,\s*["']true["']/, "The rich-text editor needs aria-multiline=true");
});

test("external links pass through one allow-listing URL helper", () => {
  const helperDefinition = tracker.match(
    /(?:function\s+|const\s+)([A-Za-z_$][\w$]*(?:safe|sanitize)[\w$]*(?:url|href)|(?:safe|sanitize)[\w$]*(?:url|href))\b/i,
  );
  assert.ok(helperDefinition, "Define a clearly named safe URL/href helper");
  const helperName = helperDefinition[1];
  const occurrences = tracker.match(new RegExp(`\\b${helperName}\\s*\\(`, "g")) ?? [];
  assert.ok(occurrences.length >= 3, `${helperName} should be used at every user-controlled link sink`);
  assert.match(tracker, /https\?\s*:|https\?:|https?:.*mailto:|mailto:.*https?:/i, "The URL policy must allow-list expected protocols");
});

test("Supabase browser client is self-hosted and pinned to an exact version", () => {
  assert.doesNotMatch(tracker, /https:\/\/esm\.sh\/@supabase\/supabase-js@/i, "Do not load the browser client from a third-party CDN");
  const script = tracker.match(/<script\b[^>]*\bsrc\s*=\s*(["'])assets\/vendor\/supabase-js-(\d+\.\d+\.\d+)\.umd\.js\1[^>]*>/i);
  assert.ok(script, "Expected one exact-version, self-hosted Supabase browser client");
  assert.ok(
    existsSync(resolve(rootDir, `assets/vendor/supabase-js-${script[2]}.umd.js`)),
    `Expected the vendored Supabase ${script[2]} bundle to exist`,
  );
});

test("CSV escaping neutralizes spreadsheet formulas before quoting", () => {
  const functionSource = extractFunctionSource(tracker, "csvEscape");
  const csvEscape = vm.runInNewContext(`(${functionSource})`, Object.create(null));

  const decodeCell = (cell) => {
    if (cell.startsWith('"') && cell.endsWith('"')) return cell.slice(1, -1).replaceAll('""', '"');
    return cell;
  };
  for (const dangerous of ["=2+2", "+SUM(A1:A2)", "-1+1", "@SUM(A1:A2)"]) {
    assert.match(decodeCell(csvEscape(dangerous)), /^'/, `CSV value ${dangerous} must be prefixed with an apostrophe`);
  }
  assert.equal(decodeCell(csvEscape("ordinary text")), "ordinary text", "Ordinary cells should not be modified");
});

test("week saves are serialized and persisted through an atomic RPC", () => {
  assert.match(
    tracker,
    /\b(?:saveChain|saveQueue|saveInFlight|savePromise|queuedSave|pendingSave)\b/,
    "Add an explicit save queue, promise chain, or in-flight lock",
  );
  assert.match(
    tracker,
    /\.rpc\s*\(\s*["']save_week_atomic["']/,
    "Persist a complete week through the transactional save_week_atomic RPC",
  );

  const saveDeclaration = /(?:async\s+)?function\s+saveWeek\s*\(/.exec(tracker);
  const saveStart = saveDeclaration?.index ?? -1;
  const nextSection = tracker.indexOf('\n$("del")', saveStart);
  const saveBlock = saveStart >= 0 ? tracker.slice(saveStart, nextSection > saveStart ? nextSection : saveStart + 5000) : "";
  assert.ok(saveBlock, "Expected saveWeek() implementation");
  assert.doesNotMatch(saveBlock, /from\s*\(\s*["']tasks["']\s*\)\.delete/, "saveWeek() must not delete task rows outside the atomic RPC");
  assert.doesNotMatch(saveBlock, /from\s*\(\s*["']tasks["']\s*\)\.insert/, "saveWeek() must not insert task rows outside the atomic RPC");
});

test("service worker installs, serves, and refreshes an offline app shell", () => {
  assert.match(serviceWorker, /\b(?:CACHE_NAME|CACHE_VERSION|CACHE_KEY)\b/, "Version the service-worker cache");
  assert.match(serviceWorker, /tracker\.html/, "Precache the tracker shell");
  assert.match(serviceWorker, /addEventListener\s*\(\s*["']install["'][\s\S]*caches\.open[\s\S]*\.addAll\s*\(/, "Install must precache the app shell");
  assert.match(serviceWorker, /addEventListener\s*\(\s*["']activate["'][\s\S]*caches\.keys\s*\([\s\S]*caches\.delete\s*\(/, "Activate must remove stale caches");
  assert.match(serviceWorker, /addEventListener\s*\(\s*["']fetch["'][\s\S]*respondWith\s*\(/, "Fetch events must provide a cached response strategy");
  assert.match(serviceWorker, /caches\.match\s*\(/, "Fetch strategy must read cached responses");
  assert.match(serviceWorker, /\bfetch\s*\(/, "Fetch strategy must refresh from the network when available");
});

test("offline replay advances the local revision before the queue is cleared", () => {
  assert.match(tracker, /const\s+response\s*=\s*await[\s\S]{0,1400}sendSnapshot\s*\(\s*snapshot\s*\)/, "Offline replay must retain the RPC response");
  assert.match(tracker, /state\.revision\s*=\s*next\.revision/, "Offline replay must adopt the server revision");
  assert.match(tracker, /state\.revision\s*=\s*null;\s*state\.deletedUpdates\s*=\s*\[\];\s*dirty\s*=\s*false/, "Deleting a week must reset its revision, tombstone ledger, and dirty state");
  assert.match(tracker, /await\s+applySession\s*\(\s*data\.session\s*\)/, "Startup must finish session loading before flushing offline work");
  assert.match(tracker, /deletedUpdateIds\s*:\s*normDeletedUpdateIds\s*\(\s*t\.deleted_update_ids\s*\)/, "Cached rows must retain update-deletion tombstones");
  assert.match(tracker, /r\.deleted_update_ids\.length/, "Rows carrying only deletion tombstones must remain in queued snapshots");
  assert.match(tracker, /currentMatchesQueued[\s\S]{0,500}!dirty[\s\S]{0,500}snapshot\.tasks[\s\S]{0,500}map\s*\(\s*rowFromDb\s*\)/, "Replay must restore the queued snapshot when no newer local edit exists");
  assert.match(tracker, /function\s+applyAcknowledgedUpdateDeletions[\s\S]{0,900}deletedUpdateIds[\s\S]{0,900}row\.updates/, "Replay must remove acknowledged tombstones and their deleted updates from local state");
  const flushStart=tracker.indexOf("async function flushOfflineSnapshots");
  const flushEnd=tracker.indexOf("\nasync function fetchCarryForward",flushStart);
  const flushBlock=tracker.slice(flushStart,flushEnd);
  assert.ok(flushBlock.indexOf("state.revision=next.revision")<flushBlock.lastIndexOf("reconcilePendingSnapshotAfterSave"), "Active replay must adopt the server revision before reconciling the successfully synced queue");
  assert.match(tracker, /function\s+reconcilePendingSnapshotAfterSave[\s\S]{0,900}snapshotKey\(current\)===snapshotKey\(savedSnapshot\)[\s\S]{0,500}localStorage\.removeItem\(key\)/, "A successful save may clear only the matching or older queued snapshot");
  assert.match(tracker, /pendingDeletedUpdateIds\.length\s*>\s*100[\s\S]{0,180}return/, "The UI must not silently discard a deletion beyond the RPC limit");
  assert.doesNotMatch(tracker, /function\s+normDeletedUpdateIds[^\n]*slice\s*\(\s*0\s*,\s*100\s*\)/, "Tombstone normalization must not silently truncate pending deletions");
  assert.match(tracker, /let\s+snapshot\s*=\s*\{\.\.\.saveSnapshot\(\),clientVersion:nextSnapshotVersion\(\)\}[\s\S]{0,180}storePendingSnapshot\(snapshot\)[\s\S]{0,180}!navigator\.onLine/, "Every save needs a versioned write-ahead snapshot before network work begins");
  assert.match(tracker, /latestPending[\s\S]{0,180}snapshotVersion\(latestPending\)\s*>\s*version[\s\S]{0,80}return true/, "An older chained save must yield to a newer queued snapshot");
  assert.match(flushBlock, /saveChain[\s\S]{0,250}then\(\(\)=>\{[\s\S]{0,900}snapshot=rebaseSnapshotRevision\(current\)[\s\S]{0,180}sendSnapshot\(snapshot\)/, "Replay must re-check and rebase the exact queued snapshot when its chain turn begins");
});

test("acknowledged update deletions are retired without losing newer tombstones", () => {
  const normStart=tracker.indexOf("function normUpdates");
  const normEnd=tracker.indexOf("function latestUpdateText",normStart);
  const helperStart=tracker.indexOf("function snapshotKey");
  const helperEnd=tracker.indexOf("function restoreCachedWeek",helperStart);
  assert.ok(normStart>=0 && normEnd>normStart && helperStart>=0 && helperEnd>helperStart, "Expected tombstone and queue helper sources");
  const storage=new class{
    constructor(){this.values=new Map();}
    get length(){return this.values.size;}
    key(index){return [...this.values.keys()][index]??null;}
    getItem(key){return this.values.has(key)?this.values.get(key):null;}
    setItem(key,value){this.values.set(key,String(value));}
    removeItem(key){this.values.delete(key);}
  }();
  const context={newLogicalId:()=>"generated-id",todayIso:()=>"2026-07-11",clientSnapshotVersion:1,confirmedRevisions:new Map(),confirmedSnapshotVersions:new Map(),session:null,state:{week:"",revision:null},localStorage:storage};
  vm.runInNewContext(`${tracker.slice(normStart,normEnd)}\n${tracker.slice(helperStart,helperEnd)}\nthis.helpers={normDeletedUpdateIds,normDeletedUpdateGroups,collectDeletedUpdateGroups,retainRowTombstones,acknowledgedSnapshot,applyAcknowledgedUpdateDeletions,storePendingSnapshot,reconcilePendingSnapshotAfterSave,rememberConfirmedRevision,forgetConfirmedSnapshot,rebaseSnapshotRevision,pendingSaveKey};`,context);

  const pendingIds=Array.from({length:101},(_,index)=>`update-${index}`);
  assert.equal(context.helpers.normDeletedUpdateIds(pendingIds).length,101,"Normalization must retain every unsynced deletion");

  const rows=[{logicalId:"task-1",deletedUpdateIds:["update-old","update-new"],updates:[
    {id:"update-old",date:"2026-07-10",text:"Delete me"},
    {id:"update-new",date:"2026-07-11",text:"Keep me"},
  ]}];
  const snapshot={tasks:[{logical_id:"task-1",deleted_update_ids:["update-old"]}]};
  context.helpers.applyAcknowledgedUpdateDeletions(rows,snapshot);
  assert.equal(rows[0].deletedUpdateIds.join(","),"update-new","Only the acknowledged tombstone should be cleared");
  assert.equal(rows[0].updates.map(update=>update.id).join(","),"update-new","The acknowledged deletion must still win over a stale local update");
  assert.equal(context.helpers.acknowledgedSnapshot(snapshot,7).tasks[0].deleted_update_ids.length,0,"Cached confirmed snapshots must not retain acknowledged tombstones");

  const saved={userId:"user-1",week:"2026-07-11",revision:1,clientVersion:10,tasks:[{logical_id:"task-1",deleted_update_ids:["update-old"],updates:[]}],deletedUpdates:[{logical_id:"task-1",update_ids:["update-old"]}]};
  const newer={userId:"user-1",week:"2026-07-11",revision:1,clientVersion:11,tasks:[],deletedUpdates:[{logical_id:"task-1",update_ids:["update-old","update-new"]}]};
  context.helpers.storePendingSnapshot(newer);
  context.helpers.storePendingSnapshot(saved);
  const key=context.helpers.pendingSaveKey(saved);
  assert.equal(JSON.parse(storage.getItem(key)).clientVersion,11,"An older in-flight snapshot must not overwrite a newer queued edit");
  const reconciled=context.helpers.reconcilePendingSnapshotAfterSave(saved,2,key);
  assert.equal(reconciled.revision,2,"A newer queued snapshot must adopt the confirmed server revision");
  assert.equal(reconciled.tasks.length,0,"The newer snapshot may still delete the entire task row");
  assert.equal(reconciled.deletedUpdates[0].update_ids.join(","),"update-new","The independent ledger must retain the newer tombstone after its task row disappears");
  context.helpers.rememberConfirmedRevision(saved,2);
  assert.equal(context.helpers.rebaseSnapshotRevision({...newer,revision:1}).revision,2,"A chained save must rebase onto the latest confirmed revision");
  context.helpers.forgetConfirmedSnapshot(saved);
  assert.equal(context.helpers.rebaseSnapshotRevision({...newer,revision:null}).revision,null,"Deleting a week must forget its confirmed revision before an undo recreates it");
  assert.match(tracker, /deleteSnapshot=\{[\s\S]{0,180}deleteWeek:true[\s\S]{0,500}sendSnapshot\(deleteSnapshot,true\)/, "Week deletion must send pending tombstones through the atomic RPC");
  assert.match(migration, /if\s+coalesce\(p_delete_week,\s*false\)\s+then\s+if\s+v_ledger_only[\s\S]{0,1800}delete\s+from\s+public\.reports[\s\S]{0,500}'deleted',\s*true/i, "The RPC must process tombstones and delete the week in one transaction");
  assert.match(tracker, /p_expected_report_id\s*:\s*snapshot\.reportId\s*\|\|\s*null/, "Delete requests must carry the original report identity");
  assert.match(migration, /v_report\.id\s*<>\s*p_expected_report_id[\s\S]{0,500}v_ledger_only/i, "A replay must preserve a different report that later reused the same week");
  assert.match(migration, /delete\s+from\s+public\.reports[\s\S]{0,120}r\.id\s*=\s*p_expected_report_id/i, "Atomic deletion must target the original report ID, not just week and revision");
  assert.match(migration, /p_expected_report_id\s+is\s+null[\s\S]{0,160}p_expected_report_id\s*<>\s*v_report\.id[\s\S]{0,160}p_expected_revision\s+is\s+null/i, "Ordinary updates must conflict on both immutable report ID and revision");
  assert.match(migration, /if\s+not\s+v_report_exists\s+then\s+if\s+p_expected_report_id\s+is\s+not\s+null[\s\S]{0,160}p_expected_revision\s+is\s+not\s+null/i, "A missing report may be created only when the client did not expect an older report ID");
  assert.match(tracker, /reportId\s*=\s*snapshot\.reportId\s*\|\|\s*null/, "Offline cache restoration must recover the server report identity");
  assert.doesNotMatch(tracker, /reportId\s*=\s*outcome\.preserved_report_id/, "Replacement identity must not bind to stale local rows before reload succeeds");
  const deleteStart=tracker.indexOf('$("del").addEventListener');
  const deleteEnd=tracker.indexOf("\n// display order",deleteStart);
  const deleteBlock=tracker.slice(deleteStart,deleteEnd);
  assert.ok(deleteBlock.indexOf("!navigator.onLine")<deleteBlock.indexOf("!reportId&&!collectDeletedUpdateGroups().length"), "Week deletion must check connectivity before clearing a possibly server-backed cached week");
  context.helpers.reconcilePendingSnapshotAfterSave(reconciled,3,key);
  assert.equal(storage.getItem(key),null,"The queue may be cleared once the exact latest snapshot is acknowledged");
  assert.match(tracker, /retainRowTombstones\(removed\)[\s\S]{0,100}state\.rows\.splice/, "Deleting a task must transfer its pending tombstones before removing the row");
  assert.match(tracker, /p_deleted_updates\s*:\s*normDeletedUpdateGroups\(snapshot\.deletedUpdates\)/, "The independent tombstone ledger must be sent to the atomic RPC");
  context.state.deletedUpdates=[];context.state.rows=[{logicalId:"task-1",deletedUpdateIds:["update-immediate"]}];
  context.helpers.retainRowTombstones(context.state.rows[0]);context.state.rows=[];
  assert.equal(context.helpers.collectDeletedUpdateGroups()[0].update_ids.join(","),"update-immediate","Deleting a task or week before debounce must not discard its unsent tombstone");
});

test("share access is scoped and enforced by the server-side wrapper", () => {
  assert.match(dashboard, /location\.hash/, "New dashboard links must keep bearer tokens out of the request URL");
  assert.match(dashboard, /\.rpc\s*\(\s*["']secure_shared_dashboard["']/, "Dashboard data must use the scoped wrapper");
  assert.match(migration, /column\s+scope\s+jsonb|alter\s+column\s+scope\s+type\s+jsonb/i, "Share scope must be stored as JSONB");
  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.secure_shared_dashboard/i);
  assert.match(migration, /p\.proname\s*=\s*'shared_dashboard'[\s\S]*revoke all on function public\.%I\(%s\)/i, "Every legacy unscoped RPC overload must be revoked");
  assert.match(migration, /include_kudos[\s\S]*include_summaries[\s\S]*recent4/i, "Server wrapper must filter optional sections and week ranges");
});

test("shared dashboard keeps mobile data and exposes chart alternatives", () => {
  assert.match(dashboard, /<main\s+id=["']root["'][^>]*aria-live=/i, "Dashboard needs a live main landmark");
  assert.doesNotMatch(dashboard, /\.col-pri\s*,\s*\.prog-cell\s*\{\s*display\s*:\s*none/i, "Mobile styles must not remove priority and progress");
  assert.match(dashboard, /function\s+bandA11y[\s\S]*tabindex=/, "Chart weeks must be keyboard focusable");
  assert.match(dashboard, /function\s+chartDataTable/, "Charts need a semantic data-table alternative");
  assert.match(dashboard, /id=["']kpiHeading["']/, "The KPI region needs a level-two heading");
  assert.match(dashboard, /aria-pressed/, "Theme state must be announced");
  assert.match(dashboard, /prefers-reduced-motion/, "Dashboard must respect reduced motion");
});

test("rich-text sanitizers clean descendants before unwrapping unknown elements", () => {
  for (const [name, source] of [["tracker", tracker], ["dashboard", dashboard]]) {
    assert.match(
      source,
      /if\s*\(\s*!RT_ALLOWED\[tag\]\s*\)\s*\{\s*walk\s*\(\s*child\s*\)[\s\S]{0,180}child\.remove\s*\(\s*\)/,
      `${name} sanitizer must recursively clean unknown-element descendants before unwrapping`,
    );
  }
});

test("all Anthropic Edge Functions enforce auth, bounded requests, quotas, and timeouts", () => {
  for (const [name, source] of Object.entries(edgeSources)) {
    assert.doesNotMatch(source, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/, `${name} must not allow every origin`);
    assert.match(source, /consume(?:Ai)?Quota|consume_ai_quota/, `${name} needs a fail-closed quota check`);
    assert.match(source, /authorizeCaller|verifyUser|verifyJwt|auth\/v1\/user/, `${name} must verify the caller`);
    assert.match(source, /MAX_BODY_BYTES/, `${name} must cap request bodies`);
    assert.match(source, /upstreamTimeout|fetchWithTimeout/, `${name} must bound upstream time`);
  }
});

test("quota RPC accepts only known endpoints and canonical windows", () => {
  for (const name of edgeNames) assert.match(migration, new RegExp(`'${name}'`), `Migration must allow ${name}`);
  assert.match(migration, /p_window_seconds\s+not\s+in\s*\(\s*60,\s*300,\s*900,\s*3600,\s*21600,\s*86400\s*\)/i);
});

test("deleting a structured update purges its log and invalidates older snapshots", () => {
  assert.match(tracker, /deleted_update_ids\s*:\s*normDeletedUpdateIds/, "Client must send explicit update tombstones");
  assert.match(migration, /p_deleted_updates\s+jsonb/i, "RPC must accept tombstones independently of task rows");
  assert.match(migration, /jsonb_array_elements\s*\(\s*v_deleted_groups\s*\)/i, "RPC must process the independent tombstone ledger");
  assert.match(migration, /jsonb_array_elements_text\s*\(\s*v_deleted_updates\s*\)/, "RPC must process update tombstones");
  assert.match(migration, /with\s+changed\s+as\s*\(\s*update\s+public\.tasks[\s\S]*returning\s+t\.report_id::text/i, "Cross-week purge must collect the rows actually changed");
  assert.match(migration, /r\.id::text\s*=\s*any\s*\(\s*v_touched_report_ids\s*\)/, "Affected older reports must advance their revisions");
  assert.match(migration, /delete\s+from\s+public\.task_updates[\s\S]*v_deleted_update_id/i, "Independent update logs must be purged");
});

test("AI allowlists fail closed and clients stay within endpoint payload bounds", () => {
  const shared = readFileSync(resolve(rootDir, "supabase/functions/_shared/ai-edge.ts"), "utf8");
  assert.match(shared, /if\s*\(\s*!allowlist\.length\s*\)[\s\S]{0,220}service_unavailable/, "Shared AI auth must fail closed without an allowlist");
  assert.match(edgeSources["plan-day"], /if\s*\(\s*!allowlist\.length\s*\)[\s\S]{0,220}service_unavailable/, "Plan-day must fail closed without an allowlist");
  assert.match(tracker, /taskCandidates\.slice\s*\(\s*0\s*,\s*100\s*\)/, "Weekly summary must cap candidate tasks");
  assert.match(tracker, /kudosCandidates[\s\S]{0,240}12000/, "Weekly summary must budget kudos text");
  assert.match(tracker, /planCandidates\.slice\s*\(\s*0\s*,\s*50\s*\)/, "Day planning must cap candidate tasks");
  assert.match(tracker, /notes\.length\s*>\s*40000/g, "Notes AI actions must reject oversized transcripts");
});

test("legacy share rows are visible and revocable under one non-null lifecycle contract", () => {
  assert.match(migration, /update\s+public\.shares\s+set\s+revoked\s*=\s*false\s+where\s+revoked\s+is\s+null/i);
  assert.match(migration, /alter\s+column\s+revoked\s+set\s+not\s+null/i);
  assert.match(migration, /p\.proname\s*=\s*'shared_dashboard'[\s\S]*revoke\s+all\s+on\s+function/i, "Every legacy provider overload must lose direct access");
});

test("Pages publication is gated on backend deployment", () => {
  assert.match(pagesWorkflow, /SUPABASE_ACCESS_TOKEN:[\s\S]*SUPABASE_DB_PASSWORD:/);
  assert.match(pagesWorkflow, /ANTHROPIC_API_KEY[\s\S]*AI_ALLOWED_EMAILS[\s\S]*AI_ALLOWED_ORIGINS/, "Backend gate must verify every required Edge Function secret");
  assert.match(pagesWorkflow, /supabase functions deploy[\s\S]*supabase db push/);
  assert.match(pagesWorkflow, /deploy:\s*\r?\n\s+needs:\s*backend/, "Pages deploy job must wait for backend");
});

test("static IDs are unique and ARIA references resolve", () => {
  for (const [name, source] of [["tracker", tracker], ["dashboard", dashboard]]) {
    const markup = source.replace(/<script\b[\s\S]*?<\/script>/gi, "");
    const ids = [...markup.matchAll(/\bid\s*=\s*(["'])([^"'<>]+)\1/gi)].map((match) => match[2]);
    const seen = new Set();
    for (const id of ids) {
      assert.ok(!seen.has(id), `${name} contains duplicate id="${id}"`);
      seen.add(id);
    }
    for (const match of markup.matchAll(/\baria-(?:controls|labelledby|describedby)\s*=\s*(["'])([^"'<>]+)\1/gi)) {
      for (const target of match[2].trim().split(/\s+/)) {
        assert.ok(seen.has(target), `${name} ARIA reference "${target}" does not resolve`);
      }
    }
  }
});
