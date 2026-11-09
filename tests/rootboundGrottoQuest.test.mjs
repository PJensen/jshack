import { assert, assertEquals } from "jsr:@std/assert";
import { getUnderworldRegionTemplate } from "../src/rules/environment/dungeon/underworldRegions.js";
import { getQuestDef } from "../src/rules/quests/registry.js";
import { ROOTBOUND_GROTTO_QUEST_ID, ROOTBOUND_GROTTO_TEMPLATE_ID } from "../src/rules/quests/definitions/rootboundGrotto.js";

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
