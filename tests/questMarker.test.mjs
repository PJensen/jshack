import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { buildWorldView } from "../src/bridge/schema/worldView.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { BaseStats } from "../src/rules/components/BaseStats.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { QuestBindings } from "../src/rules/components/QuestBindings.js";
import { QuestState } from "../src/rules/components/QuestState.js";

function addNpc(world, name, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, NamedIdentity, { name, identity: name.toLowerCase() });
  world.add(id, Vitality, { hp: 20, maxHp: 20 });
  world.add(id, Faction, { key: "townfolk" });
  return id;
}

function addQuest(world, node, giver) {
  const id = world.create();
  world.add(id, QuestState, { node, status: "active" });
  world.add(id, QuestBindings, { player: 1, giver });
}

Deno.test("WorldView marks quest givers with !, accepted quests with grey ?, and ready turn-ins with ?", () => {
  const world = new World({ seed: 0x51 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, BaseStats, { perception: 5 });
  world.add(player, Faction, { key: "player" });

  const availableGiver = addNpc(world, "Available", 11, 10);
  const activeGiver = addNpc(world, "Active", 11, 11);
  const turnInGiver = addNpc(world, "TurnIn", 12, 10);
  addQuest(world, "offer", availableGiver);
  addQuest(world, "hunt", activeGiver);
  addQuest(world, "report", turnInGiver);

  const entities = buildWorldView(world).entities;
  const available = entities.find((entity) => entity.id === availableGiver);
  const active = entities.find((entity) => entity.id === activeGiver);
  const turnIn = entities.find((entity) => entity.id === turnInGiver);

  assert(available, "available quest giver should be visible");
  assert(active, "active quest giver should be visible");
  assert(turnIn, "turn-in quest giver should be visible");
  assertEquals(available.tags.includes("quest_giver"), true);
  assertEquals(available.tags.includes("quest_turn_in"), false);
  assertEquals(available.tags.includes("quest_in_progress"), false);
  assertEquals(active.tags.includes("quest_giver"), true);
  assertEquals(active.tags.includes("quest_in_progress"), true);
  assertEquals(turnIn.tags.includes("quest_giver"), true);
  assertEquals(turnIn.tags.includes("quest_turn_in"), true);
  assertEquals(turnIn.tags.includes("quest_in_progress"), false);
});

Deno.test("WorldView does not mark terminal quests as active quest givers", () => {
  const world = new World({ seed: 0x52 });
  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, BaseStats, { perception: 5 });
  world.add(player, Faction, { key: "player" });

  const giver = addNpc(world, "Done", 11, 10);
  const quest = world.create();
  world.add(quest, QuestState, { node: "complete", status: "complete" });
  world.add(quest, QuestBindings, { player, giver });

  const entity = buildWorldView(world).entities.find((entry) => entry.id === giver);
  assert(entity, "completed quest giver should be visible");
  assertEquals(entity.tags.includes("quest_giver"), false);
  assertEquals(entity.tags.includes("quest_turn_in"), false);
});
