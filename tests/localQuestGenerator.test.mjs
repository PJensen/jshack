import { assert, assertEquals } from "jsr:@std/assert";
import { World, composeScheduler } from "../src/lib/ecs-js/index.js";
import { Player } from "../src/rules/components/Player.js";
import { QuestDefRef } from "../src/rules/components/QuestDefRef.js";
import { getQuestDef } from "../src/rules/quests/registry.js";
import {
  acceptNoticeBoardOffer,
  buildLocalGeneratedQuest,
  buildNoticeBoardPayload,
  buildNoticeBoardQuestData,
  ensureLocalGeneratedQuest,
} from "../src/rules/quests/localGenerator.js";
import { DistrictProfile } from "../src/rules/components/DistrictProfile.js";
import { DistrictState } from "../src/rules/components/DistrictState.js";
import { installVirtuals } from "../src/rules/utils/inventoryVirtuals.js";
import { defineTownInterpretationVirtuals } from "../src/rules/utils/townInterpretationVirtuals.js";
import { getQuestRecord, installQuestRuntime } from "../src/rules/quests/runtime.js";

function setupWorld(seed = 0xC0FFEE) {
  const world = new World({ seed });
  world.setScheduler(composeScheduler("scripts"));
  installQuestRuntime(world);
  const playerId = world.create();
  world.add(playerId, Player);
  return { world, playerId };
}

Deno.test("local quest generator is deterministic for same seed + player", () => {
  const left = setupWorld(0xA77A77);
  const right = setupWorld(0xA77A77);

  const leftQuest = buildLocalGeneratedQuest(left.world, { playerId: left.playerId });
  const rightQuest = buildLocalGeneratedQuest(right.world, { playerId: right.playerId });

  assert(leftQuest && rightQuest, "generated quest should exist when a player is present");
  assertEquals(leftQuest.def.id, rightQuest.def.id);
  assertEquals(leftQuest.def.title, rightQuest.def.title);
  assertEquals(leftQuest.def.vars.target, rightQuest.def.vars.target);
  assertEquals(leftQuest.startNode, "survey");
});

Deno.test("ensureLocalGeneratedQuest registers, instantiates, and completes from moved events", () => {
  const { world, playerId } = setupWorld(12345);

  const first = ensureLocalGeneratedQuest(world);
  const second = ensureLocalGeneratedQuest(world);
  assert(first > 0, "quest instance should be created");
  assertEquals(second, first);

  const defRef = world.get(first, QuestDefRef);
  assert(defRef?.id, "quest should have QuestDefRef id");
  const def = getQuestDef(defRef.id);
  assert(def, "quest definition should be registered");

  let record = getQuestRecord(world, defRef.id, playerId);
  assert(record, "quest record should exist");
  assertEquals(record.state.status, "active");
  const target = Number(record.vars?.data?.target || 0) | 0;
  assert(target > 0, "quest target must be positive");

  for (let i = 0; i < target; i++) {
    world.emit("moved", { id: playerId, from: { x: i, y: 0 }, to: { x: i + 1, y: 0 } });
  }

  record = getQuestRecord(world, defRef.id, playerId);
  assert(record, "quest record should still exist");
  assertEquals(record.state.status, "complete");
  assertEquals(record.vars.data.completed, true);
});

Deno.test("buildNoticeBoardQuestData returns active quests and district-driven offers", () => {
  const { world, playerId } = setupWorld(0x12345678);
  const qid = ensureLocalGeneratedQuest(world);
  assert(qid > 0, "expected local generated quest instance");

  const districts = [
    {
      district: "workshop_row",
      label: "Workshop Row",
      opportunities: ["smith_repairs"],
      shortages: ["iron_and_lumber_short"],
      shortageBand: "scarce",
      pressureBand: "active",
      dangerBand: "safe",
    },
    {
      district: "market_green",
      label: "Market Green",
      opportunities: ["escort_work"],
      shortages: [],
      shortageBand: "stable",
      pressureBand: "quiet",
      dangerBand: "dangerous",
    },
  ];
  const opportunityView = {
    profitableSectors: ["smith_repairs", "escort_work"],
    highLeverageActions: ["inspect_crypt_stairs"],
  };

  const board = buildNoticeBoardQuestData(world, playerId, districts, opportunityView);
  assert(Array.isArray(board.offers), "offer list should exist");
  assertEquals("active" in board, false, "notice board should not include quest-log entries");
  assertEquals(board.offers.length, 2);
  assertEquals(board.offers[0].sourceLabel, "Workshop Row");
  assertEquals(Array.isArray(board.sectors), true);
  assertEquals(board.sectors.includes("escort_work"), true);
});

Deno.test("buildNoticeBoardQuestData provides fallback offers when districts are quiet", () => {
  const { world, playerId } = setupWorld(0x445566);
  const board = buildNoticeBoardQuestData(world, playerId, [], { profitableSectors: [] });
  assert(Array.isArray(board.offers), "offers should be an array");
  assert(board.offers.length >= 1, "board should have at least one generated offer at outset");
  assertEquals(typeof board.offers[0].title, "string");
  assertEquals(board.offers[0].accepted, false);
});

Deno.test("acceptNoticeBoardOffer creates and deduplicates offer-backed quests", () => {
  const { world, playerId } = setupWorld(0x13579);
  const offer = {
    offerId: "workshop_row:smith_repairs",
    sourceDistrict: "workshop_row",
    sourceLabel: "Workshop Row",
    tag: "smith_repairs",
    title: "Supply the Smithy",
    objective: "Deliver repair supplies where shortages are rising.",
    urgency: "medium",
  };

  const first = acceptNoticeBoardOffer(world, playerId, offer);
  const second = acceptNoticeBoardOffer(world, playerId, offer);
  assert(first > 0, "offer should create a quest instance");
  assertEquals(second, first);

  const rec = [...world.query(QuestDefRef)]
    .map(([id, def]) => ({ id, defId: String(def?.id || "") }))
    .find((row) => row.id === first);
  assert(rec, "expected quest instance to be queryable");
  assert(rec.defId.includes("local.offer.workshop_row.smith_repairs"), "offer quest id should include offer source");

  const board = buildNoticeBoardQuestData(world, playerId, [{
    district: "workshop_row",
    label: "Workshop Row",
    opportunities: ["smith_repairs"],
    shortages: [],
    shortageBand: "scarce",
    pressureBand: "active",
    dangerBand: "safe",
  }], { profitableSectors: [] });
  assertEquals(board.offers.length, 1);
  assertEquals(board.offers[0].accepted, true);
});

Deno.test("buildNoticeBoardPayload includes virtual bulletin + generated quest board", () => {
  const { world, playerId } = setupWorld(0x2468);
  installVirtuals(world);
  defineTownInterpretationVirtuals(world);

  const districtId = world.create();
  world.add(districtId, DistrictProfile, {
    key: "workshop_row",
    label: "Workshop Row",
    tags: ["craft"],
    laborDemand: ["smith_repairs"],
    districtEffects: [],
  });
  world.add(districtId, DistrictState, {
    pressureBand: "active",
    shortageBand: "scarce",
    dangerBand: "safe",
    shortageScore: 0.8,
    topEntrance: "town",
  });

  const payload = buildNoticeBoardPayload(world, playerId);
  assert(Array.isArray(payload.districts), "district bulletin list should exist");
  assert(Array.isArray(payload.questBoard.offers), "quest board offers should exist");
  assert(payload.questBoard.offers.length >= 1, "district opportunities should produce at least one offer");
});
