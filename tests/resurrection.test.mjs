import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { createCorpse } from "../src/rules/archetypes/Food.js";
import { Faction } from "../src/rules/components/Faction.js";
import { CreatureType, CREATURE_TYPES } from "../src/rules/components/CreatureType.js";
import { Lifespan } from "../src/rules/components/Lifespan.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Owner } from "../src/rules/components/Owner.js";
import { Position } from "../src/rules/components/Position.js";
import { Player } from "../src/rules/components/Player.js";
import { Reanimated } from "../src/rules/components/Reanimated.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { getSpell } from "../src/rules/data/spells.js";
import { ResurrectionCast } from "../src/events/ResurrectionCast.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { cleanupSystem } from "../src/rules/systems/cleanupSystem.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";

function loadFlatFloor() {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
}

function makeCaster(world) {
  const caster = world.create();
  world.add(caster, Player);
  world.add(caster, Position, { x: 4, y: 4 });
  world.add(caster, Faction, { key: "player" });
  return caster;
}

Deno.test("resurrection raises an eligible corpse as a temporary allied monster", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0xC0FFEE });
    const caster = makeCaster(world);
    const corpse = createCorpse(world, { id: "goblin", name: "Goblin", sizeClass: "S", massKg: 30, tier: 0 }, { x: 6, y: 4 });
    const events = [];
    world.on(ResurrectionCast, (event) => events.push(event));

    runSpellScript(world, caster, getSpell("resurrection"), { x: 6, y: 4 });

    assert(!world.isAlive(corpse), "the corpse should be consumed");
    const risen = [...world.query(Position, Faction, NamedIdentity, Lifespan, Owner)]
      .map(([id]) => id)
      .find((id) => id !== caster);
    assert(risen, "a risen creature should exist");
    assertEquals(world.get(risen, Faction).key, "summoned");
    assertEquals(world.get(risen, CreatureType).type, CREATURE_TYPES.undead);
    assertEquals(world.get(risen, NamedIdentity).name, "Reanimated Goblin");
    assertEquals(world.get(risen, Owner).ownerId, caster);
    assertEquals(world.get(risen, Lifespan).turnsLeft, 80);
    assertEquals(events.length, 1);
    assertEquals(events[0].identity, "goblin");
    assertEquals(events[0].fizzle, false);
  } finally {
    clearAll();
  }
});

Deno.test("resurrection raises powerful corpses briefly", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0xBAD5EED });
    const caster = makeCaster(world);
    const corpse = createCorpse(world, { id: "dragon", name: "Dragon", sizeClass: "L", massKg: 400, tier: 3 }, { x: 6, y: 4 });
    const events = [];
    world.on(ResurrectionCast, (event) => events.push(event));

    runSpellScript(world, caster, getSpell("resurrection"), { x: 6, y: 4 });

    assert(!world.isAlive(corpse), "a successful resurrection should consume the corpse");
    assertEquals(events.length, 1);
    assertEquals(events[0].fizzle, false);
    assertEquals(events[0].durationTurns, 10);
    const risen = [...world.query(Lifespan, Owner)].map(([id]) => id).find((id) => id !== caster);
    assert(risen, "a powerful corpse should still produce an ally");
    assertEquals(world.get(risen, Lifespan).turnsLeft, 10);
  } finally {
    clearAll();
  }
});

Deno.test("resurrection fizzles when the target tile has no corpse", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0x515151 });
    const caster = makeCaster(world);
    const events = [];
    world.on(ResurrectionCast, (event) => events.push(event));

    runSpellScript(world, caster, getSpell("resurrection"), { x: 6, y: 4 });

    assertEquals(events.length, 1);
    assertEquals(events[0].fizzle, true);
    assertEquals(events[0].reason, "no_corpse");
  } finally {
    clearAll();
  }
});

Deno.test("a slain resurrected ally drops bones instead of another corpse", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0xB00E });
    const caster = makeCaster(world);
    createCorpse(world, { id: "goblin", name: "Goblin", sizeClass: "S", massKg: 30, tier: 0 }, { x: 6, y: 4 });
    runSpellScript(world, caster, getSpell("resurrection"), { x: 6, y: 4 });

    const risen = [...world.query(Reanimated, Vitality)].map(([id]) => id).find((id) => id !== caster);
    assert(risen, "a resurrected ally should exist");
    world.get(risen, Vitality).hp = 0;
    cleanupSystem(world);

    const remains = [...world.query(NamedIdentity)].map(([id, identity]) => ({ id, identity }))
      .find((entry) => entry.identity.identity === "bone");
    assert(remains, "resurrected allies should leave bones");
    assert(![...world.query(NamedIdentity)].some(([, identity]) => identity.identity === "corpse_goblin"), "resurrected allies must not leave edible corpses");
  } finally {
    clearAll();
  }
});
