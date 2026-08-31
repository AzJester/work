import assert from "node:assert/strict";
import test from "node:test";

import {
  MISSION_SEGMENTS,
  buildAiPayload,
  buildDecisionPackageMarkdown,
  createBlankSolution,
  createWorkspace,
  validateWorkspace
} from "../solutions-architect/engine.js";

test("company mission segments are canonical, optional for legacy v1 workspaces, and strictly validated when present", () => {
  assert.deepEqual(MISSION_SEGMENTS.map(segment => segment.name), [
    "Integrated Air and Missile Defense",
    "Lifecycle Management and Cyber Warfare",
    "Layered Defense, Autonomous Warfare & Integrated Fires",
    "Space Warfighting",
    "Critical Infrastructure Protection",
    "Exploration and Lunar Presence"
  ]);

  const blank = createBlankSolution("Segmented solution");
  assert.deepEqual(blank.missionSegments, []);

  const legacy = createWorkspace();
  delete legacy.solutions[0].missionSegments;
  assert.equal(validateWorkspace(legacy).valid, true);

  const unsupported = createWorkspace();
  unsupported.solutions[0].missionSegments = ["Invented segment"];
  assert.match(validateWorkspace(unsupported).errors.join("\n"), /missionSegments\[0\] is unsupported/i);

  const duplicate = createWorkspace();
  duplicate.solutions[0].missionSegments = [MISSION_SEGMENTS[0].name, MISSION_SEGMENTS[0].name];
  assert.match(validateWorkspace(duplicate).errors.join("\n"), /duplicated/i);
});

test("mission segments flow into decision packages and reviewed AI facts", () => {
  const workspace = createWorkspace();
  const solution = workspace.solutions[0];
  solution.missionSegments = [MISSION_SEGMENTS[0].name, MISSION_SEGMENTS[2].name];

  const markdown = buildDecisionPackageMarkdown(workspace, solution.id);
  assert.match(markdown, /Company mission segments/);
  assert.match(markdown, /Integrated Air and Missile Defense/);
  assert.match(markdown, /Layered Defense, Autonomous Warfare & Integrated Fires/);

  const payload = buildAiPayload(workspace, solution.id, "find_gaps", "Discover");
  const mission = JSON.parse(payload.facts.find(fact => fact.record_type === "mission_context").content);
  assert.deepEqual(mission.mission_segments, solution.missionSegments);
});
