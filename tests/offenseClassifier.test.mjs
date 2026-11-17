import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Faction } from "../src/rules/components/Faction.js";
import { AggroState, AGGRO_LEVELS } from "../src/rules/components/AggroState.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import {
  classifyActorTargetAction,
  classifyShopClaimOffense,
} from "../src/rules/utils/offenseClassifier.js";

function addFactionActor(world, faction, name) {
  const id = world.create();
  world.add(id, Faction, { key: faction });
  world.add(id, NamedIdentity, { name, identity: name.toLowerCase() });
  return id;
}

Deno.test("actor-target classifier marks direct attacks on social NPCs as confirmable assault", () => {
  const world = new World({ seed: 3101 });
  const player = addFactionActor(world, "player", "Player");
  const villager = addFactionActor(world, "townfolk", "Villager");

  const offense = classifyActorTargetAction(world, {
    actorId: player,
    targetId: villager,
    actionKind: "melee_attack",
  });

  assertEquals(offense.protectedTarget, true);
  assertEquals(offense.offenseKind, "assault");
  assertEquals(offense.severityName, "serious");
  assertEquals(offense.requiresConfirm, true);
});

Deno.test("shop claim classifier maps shop-law reasons into shared offense vocabulary", () => {
  const theft = classifyShopClaimOffense({
    claimKind: "consumed_unpaid",
    reason: "consumption_theft",
    severity: 2,
  });
  const fraud = classifyShopClaimOffense({
    claimKind: "learned_unpaid",
    reason: "knowledge_theft",
    severity: 2,
  });

  assertEquals(theft.source, "shop_law");
  assertEquals(theft.offenseKind, "theft");
  assertEquals(fraud.offenseKind, "fraud");
});

Deno.test("already hostile protected targets do not require repeated confirmation", () => {
  const world = new World({ seed: 3103 });
  const player = addFactionActor(world, "player", "Player");
  const villager = addFactionActor(world, "townfolk", "Villager");
  world.add(villager, AggroState, { alertLevel: AGGRO_LEVELS.hunting, targetId: player });

  const offense = classifyActorTargetAction(world, {
    actorId: player,
    targetId: villager,
    actionKind: "melee_attack",
  });

  assertEquals(offense.protectedTarget, true);
  assertEquals(offense.requiresConfirm, false);
});

Deno.test("peaceful protected targets still require confirmation after hostility ends", () => {
  const world = new World({ seed: 3104 });
  const player = addFactionActor(world, "player", "Player");
  const villager = addFactionActor(world, "townfolk", "Villager");
  world.add(villager, AggroState, { alertLevel: AGGRO_LEVELS.unaware, targetId: 0 });

  const offense = classifyActorTargetAction(world, {
    actorId: player,
    targetId: villager,
    actionKind: "melee_attack",
  });

  assertEquals(offense.requiresConfirm, true);
});
