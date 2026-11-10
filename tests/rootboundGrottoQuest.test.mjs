import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Player } from "../src/rules/components/Player.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { getUnderworldRegionTemplate } from "../src/rules/environment/dungeon/underworldRegions.js";
import { getQuestDef } from "../src/rules/quests/registry.js";
import { getQuestRecord, installQuestRuntime } from "../src/rules/quests/runtime.js";
import { ensureRootboundGrottoQuest, ROOTBOUND_GROTTO_QUEST_ID, ROOTBOUND_GROTTO_TEMPLATE_ID } from "../src/rules/quests/definitions/rootboundGrotto.js";

Deno.test("rootbound grotto is an authored healer destination", () => {
  const template = getUnderworldRegionTemplate(ROOTBOUND_GROTTO_TEMPLATE_ID);
  assert(template, "rootbound grotto template should be registered");
  assertEquals(template.questId, ROOTBOUND_GROTTO_QUEST_ID);
  const healerIds = template.content.monsters.map((entry) => entry.id);
  for (const id of ["goblin_mosscaller", "kobold_cairnkeeper", "orc_bloodspeaker", "druid"]) {
    assert(healerIds.includes(id), `${id} should appear in the authored healer destination`);
  }
});

Deno.test("rootbound grotto quest is offered as a returnable side quest", () => {
  const quest = getQuestDef(ROOTBOUND_GROTTO_QUEST_ID);
  assert(quest, "rootbound grotto quest should be registered");
  assert(quest.nodes.offer && quest.nodes.hunt && quest.nodes.report, "quest should have offer, hunt, and report stages");
});

Deno.test("rootbound grotto quest can be seeded before dialogue for discovery markers", () => {
  const world = new World({ seed: 0xBEEF });
  installQuestRuntime(world);
  const player = world.create();
  world.add(player, Player, {});
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  const herbalist = world.create();
  world.add(herbalist, NamedIdentity, { name: "Herbalist", identity: "townfolk_herbalist" });

  const questId = ensureRootboundGrottoQuest(world);
  const quest = getQuestRecord(world, ROOTBOUND_GROTTO_QUEST_ID, player);
  assert(questId > 0);
  assertEquals(quest?.bindings?.giver, herbalist);
  assertEquals(quest?.state?.node, "offer");
});
