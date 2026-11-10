import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World, composeScheduler } from "../src/lib/ecs-js/index.js";
import { DungeonState } from "../src/rules/components/DungeonState.js";
import { Inventory } from "../src/rules/components/Inventory.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { RunObjectiveTarget } from "../src/rules/components/RunObjectiveTarget.js";
import { addToInventory } from "../src/rules/utils/inventoryFacade.js";
import { getQuestRecord, installQuestRuntime } from "../src/rules/quests/runtime.js";
import {
  buildRunContractSpec,
  ensureRunContractQuest,
  ensureRunContractTargets,
  installRunContractHooks,
  runContractDeathSystem,
  RUN_CONTRACT_QUEST_ID,
} from "../src/rules/quests/definitions/runContract.js";
import { recordDeathApplied } from "../src/rules/utils/deathApplied.js";
import { inventoryHasIdentity } from "../src/rules/utils/townEconomy.js";

function setupWorld(seed = 0xC0FFEE) {
  const world = new World({ seed });
  world.setScheduler(composeScheduler("scripts"));
  installQuestRuntime(world);
  installRunContractHooks(world);

  const playerId = world.create();
  world.add(playerId, Player);
  world.add(playerId, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(playerId, Position, { x: 0, y: 0 });
  world.add(playerId, Inventory, { capacity: 12 });

  const masonId = world.create();
  world.add(masonId, NamedIdentity, { name: "Mason", identity: "townfolk_mason" });
  world.add(masonId, Position, { x: 2, y: 2 });

  const dsId = world.create();
  world.add(dsId, DungeonState, {
    currentDepth: 0,
    profileType: "overworld",
    downStairPositions: [],
    floorEntityIds: [playerId],
  });

  return { world, playerId, masonId, dsId };
}

function setDepth(world, dsId, depth, downStair = { x: 5, y: 5 }, activeTemplateId = "") {
  world.set(dsId, DungeonState, {
    currentDepth: depth,
    profileType: depth === 0 ? "overworld" : "default",
    activeTemplateId,
    downStairPositions: depth > 0 ? [downStair] : [],
    floorEntityIds: [1],
  });
}

function findObjective(world, role) {
  for (const [id, marker] of world.query(RunObjectiveTarget)) {
    if (String(marker?.questId || "") !== RUN_CONTRACT_QUEST_ID) continue;
    if (String(marker?.role || "") !== String(role || "")) continue;
    return id;
  }
  return 0;
}

Deno.test("run contract spec is deterministic for the same seed", () => {
  const left = setupWorld(0xA77A77);
  const right = setupWorld(0xA77A77);

  const a = buildRunContractSpec(left.world, { playerId: left.playerId });
  const b = buildRunContractSpec(right.world, { playerId: right.playerId });

  assertEquals(a.bossMonsterId, b.bossMonsterId);
  assertEquals(a.bossDepth, b.bossDepth);
  assertEquals(a.bossName, b.bossName);
  assertEquals(a.relicItemId, b.relicItemId);
  assertEquals(a.relicTitle, b.relicTitle);
});

Deno.test("run contract is accepted from and turned in to the mason in its authored dungeon", () => {
  const { world, playerId, masonId, dsId } = setupWorld(0x1234ABCD);
  const qid = ensureRunContractQuest(world, { playerId });
  assert(qid > 0, "run contract should instantiate");

  let quest = getQuestRecord(world, RUN_CONTRACT_QUEST_ID, playerId);
  assert(quest, "quest record should exist");
  assertEquals(quest.state.node, "offer");
  assertEquals(quest.bindings.giver, masonId);
  world.emit("dialog:accepted", { questId: RUN_CONTRACT_QUEST_ID, playerId, speakerId: masonId });
  quest = getQuestRecord(world, RUN_CONTRACT_QUEST_ID, playerId);
  assertEquals(quest.state.node, "hunt");
  const spec = quest.vars?.data;
  assert(spec, "quest spec should exist");

  setDepth(world, dsId, Number(spec.bossDepth || 1) | 0, { x: 5, y: 5 }, "wrong_authored_region");
  assertEquals(ensureRunContractTargets(world), 0, "boss should not leak into a different authored region on the same depth");
  setDepth(world, dsId, Number(spec.bossDepth || 1) | 0, { x: 5, y: 5 }, spec.entranceTemplateId);
  const bossId = ensureRunContractTargets(world);
  assert(bossId > 0, "boss target should spawn on its seeded floor");
  assertEquals(findObjective(world, "boss"), bossId);

  const bossPos = world.get(bossId, Position);
  recordDeathApplied(world, {
    target: bossId,
    at: { x: bossPos.x | 0, y: bossPos.y | 0 },
  });
  runContractDeathSystem(world);

  quest = getQuestRecord(world, RUN_CONTRACT_QUEST_ID, playerId);
  assertEquals(quest.state.node, "recover");
  assertEquals(quest.vars.data.bossKilled, true);
  assertEquals(quest.vars.data.progress, 1);

  const relicId = findObjective(world, "relic");
  assert(relicId > 0, "boss death should drop the relic");
  assert(addToInventory(world, playerId, relicId), "player should be able to pick the relic up");
  world.emit("item:pickup", { actor: playerId, itemId: relicId, count: 1, itemX: bossPos.x | 0, itemY: bossPos.y | 0 });

  quest = getQuestRecord(world, RUN_CONTRACT_QUEST_ID, playerId);
  assertEquals(quest.state.node, "return");
  assertEquals(quest.vars.data.relicRecovered, true);

  setDepth(world, dsId, 0);
  world.emit("dialog:reported", { questId: RUN_CONTRACT_QUEST_ID, playerId, speakerId: masonId });
  world.emit("quest:reward_selected", {
    questId: RUN_CONTRACT_QUEST_ID,
    playerId,
    speakerId: masonId,
    rewardId: spec.rewardChoices[0].id,
  });

  quest = getQuestRecord(world, RUN_CONTRACT_QUEST_ID, playerId);
  assertEquals(quest.state.status, "complete");
  assertEquals(quest.vars.data.relicDelivered, true);
  assertEquals(quest.vars.data.progress, 2);
  assertEquals(inventoryHasIdentity(world, playerId, spec.relicItemId, 1), false);
  assert(Array.isArray(quest.vars.data.checklist), "quest checklist should be preserved");
  assertEquals(quest.vars.data.checklist.every((entry) => entry.done === true), true);
  assert(inventoryHasIdentity(world, playerId, spec.rewardChoices[0].items[0].itemId, 1));
});
