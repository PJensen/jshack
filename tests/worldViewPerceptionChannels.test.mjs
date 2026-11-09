import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { buildWorldView } from "../src/bridge/schema/worldView.js";
import { Player } from "../src/rules/components/Player.js";
import { Pet } from "../src/rules/components/Pet.js";
import { Position } from "../src/rules/components/Position.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Facing } from "../src/rules/components/Facing.js";
import { BaseStats } from "../src/rules/components/BaseStats.js";
import { Status } from "../src/rules/components/Status.js";
import { Traits } from "../src/rules/components/Traits.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Channeling } from "../src/rules/components/Channeling.js";
import { DoorState } from "../src/rules/components/DoorState.js";
import { Collider } from "../src/rules/components/Collider.js";
import { Faction } from "../src/rules/components/Faction.js";
import { SecretDoor } from "../src/rules/components/SecretDoor.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";
import { clearExplored } from "../src/rules/environment/dungeon/exploredMap.js";
import { clearPerceptionMemory } from "../src/rules/environment/dungeon/perceptionMemory.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";

function resetFloor() {
  clearAll();
  clearExplored();
  clearPerceptionMemory();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
}

Deno.test("WorldView projects town NPC names for actor nameplates", () => {
  resetFloor();
  const world = new World({ seed: 0x4e5043 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Facing, { dx: 1, dy: 0 });
  world.add(player, BaseStats, { perception: 5 });
  world.add(player, Faction, { key: "player" });

  const mason = world.create();
  world.add(mason, Position, { x: 11, y: 10 });
  world.add(mason, NamedIdentity, { name: "Marta the Mason", identity: "townfolk_mason" });
  world.add(mason, Vitality, { hp: 20, maxHp: 20 });
  world.add(mason, Faction, { key: "townfolk" });

  const rec = buildWorldView(world).entities.find((entity) => entity.id === mason);
  assert(rec, "town NPC should be visible");
  assertEquals(rec.isNpc, true);
  assertEquals(rec.displayName, "Marta the Mason");
  assertEquals(rec.showHealthBar, false, "friendly NPC nameplates should not require hostile health bars");
});

Deno.test("WorldView projects monster cast bars from channeling state", () => {
  resetFloor();
  const world = new World({ seed: 0xCA57 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Facing, { dx: 1, dy: 0 });
  world.add(player, BaseStats, { perception: 5 });
  world.add(player, Faction, { key: "player" });

  const priest = world.create();
  world.add(priest, Position, { x: 11, y: 10 });
  world.add(priest, NamedIdentity, { name: "Goblin Priest", identity: "goblin_priest" });
  world.add(priest, Vitality, { hp: 20, maxHp: 20 });
  world.add(priest, Faction, { key: "enemy" });
  world.add(priest, Channeling, { spellId: "heal", mode: "cast", turnsRemaining: 2, turnsTotal: 3 });

  const rec = buildWorldView(world).entities.find((entity) => entity.id === priest);
  assert(rec, "casting monster should be visible");
  assertEquals(rec.castBar, { mode: "cast", spellId: "heal", turnsRemaining: 2, turnsTotal: 3 });
});

Deno.test("WorldView projects authored nameplate labels for tagged neutral creatures", () => {
  resetFloor();
  const world = new World({ seed: 0x1abe1 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Facing, { dx: 1, dy: 0 });
  world.add(player, BaseStats, { perception: 5 });
  world.add(player, Faction, { key: "player" });

  const chick = world.create();
  world.add(chick, Position, { x: 11, y: 10 });
  world.add(chick, NamedIdentity, { name: "Chick", identity: "chick" });
  world.add(chick, Vitality, { hp: 2, maxHp: 2 });
  world.add(chick, Faction, { key: "neutral" });

  const ratatoskr = world.create();
  world.add(ratatoskr, Position, { x: 12, y: 10 });
  world.add(ratatoskr, NamedIdentity, { name: "Ratatoskr", identity: "ratatoskr" });
  world.add(ratatoskr, Vitality, { hp: 6, maxHp: 6 });
  world.add(ratatoskr, Faction, { key: "neutral" });

  const entities = buildWorldView(world).entities;
  for (const [id, name] of [[chick, "Chick"], [ratatoskr, "Ratatoskr"]]) {
    const rec = entities.find((entity) => entity.id === id);
    assert(rec, `${name} should be visible`);
    assertEquals(rec.displayName, name);
    assertEquals(rec.showNameLabel, true);
    assertEquals(rec.showHealthBar, false, `${name} label should not depend on a health bar`);
    assertEquals(rec.isNpc, false, `${name} should not masquerade as a town NPC`);
  }
});

Deno.test("WorldView keeps frozen recent-memory glyph when turning away", () => {
  resetFloor();
  const world = new World({ seed: 0xC0FFEE });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Facing, { dx: -1, dy: 0 }); // facing west first (monster in front)
  world.add(player, BaseStats, { perception: 5 });

  const monster = world.create();
  world.add(monster, Position, { x: 8, y: 10 });
  world.add(monster, NamedIdentity, { name: "Orc", identity: "orc" });
  world.add(monster, Vitality, { hp: 8, maxHp: 8 });

  let view = buildWorldView(world);
  let seen = view.entities.find((e) => e.id === monster);
  assert(seen, "monster should be visible before turning");
  assert(!seen.tags.includes("memory_recent"), "visible monster should not be memory-tagged");

  // Turn away and move the monster; memory should remain at last-seen location.
  world.set(player, Facing, { dx: 1, dy: 0 });
  world.set(monster, Position, { x: 7, y: 10 });
  view = buildWorldView(world);
  seen = view.entities.find((e) => e.id === monster);
  assert(seen, "monster should still render from recent memory when out of view");
  assert(seen.tags.includes("memory_recent"), "out-of-view monster should project as memory");
  assertEquals(seen.pos, { x: 8, y: 10 }, "memory echo should stay frozen at last seen tile");
});

Deno.test("WorldView hides unrevealed secret doors and exposes revealed ones", () => {
  resetFloor();
  const world = new World({ seed: 0x5EC0E7 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Facing, { dx: 1, dy: 0 });
  world.add(player, BaseStats, { perception: 5 });

  const door = world.create();
  world.add(door, Position, { x: 11, y: 10 });
  world.add(door, DoorState, { open: false, locked: false });
  world.add(door, Collider, { solid: true, blocksSight: true });
  world.add(door, SecretDoor, { fromRoomId: "main", toRoomId: "leaf", revealed: false, difficulty: 8, hintKind: "hollow" });

  let view = buildWorldView(world);
  assert(!view.entities.find((e) => e.id === door), "unrevealed secret door should not be projected");

  world.set(door, SecretDoor, { fromRoomId: "main", toRoomId: "leaf", revealed: true, difficulty: 8, hintKind: "hollow" });
  view = buildWorldView(world);
  const doorView = view.entities.find((e) => e.id === door);
  assert(doorView, "revealed secret door should be projected");
  assertEquals(doorView.kind, "door_closed");
});

Deno.test("WorldView projects thermal signatures for unseen monsters", () => {
  resetFloor();
  const world = new World({ seed: 0xA77A77 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Facing, { dx: 1, dy: 0 });
  world.add(player, BaseStats, { perception: 5 });
  world.add(player, Status, { statuses: [{ type: "thermal_sense", duration: 30, potency: 1 }] });

  const monster = world.create();
  world.add(monster, Position, { x: 8, y: 10 }); // behind player, never seen this facing
  world.add(monster, NamedIdentity, { name: "Bat", identity: "bat" });
  world.add(monster, Vitality, { hp: 3, maxHp: 3 });

  const view = buildWorldView(world);
  const sensed = view.entities.find((e) => e.id === monster);
  assert(sensed, "thermal sense should reveal unseen nearby monster");
  assert(sensed.tags.includes("thermal_sensed"), "expected thermal sensing tag");
  assert(!sensed.tags.includes("memory_recent"), "thermal contact should not masquerade as memory");
});

Deno.test("WorldView projects ESP contacts from third-eye trait", () => {
  resetFloor();
  const world = new World({ seed: 42 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Facing, { dx: 1, dy: 0 });
  world.add(player, BaseStats, { perception: 5 });
  world.add(player, Traits, { third_eye: true });

  const monster = world.create();
  world.add(monster, Position, { x: 8, y: 10 }); // behind player
  world.add(monster, NamedIdentity, { name: "Goblin", identity: "goblin" });
  world.add(monster, Vitality, { hp: 8, maxHp: 8 });

  const view = buildWorldView(world);
  const sensed = view.entities.find((e) => e.id === monster);
  assert(sensed, "third-eye should project unseen monster as ESP contact");
  assert(sensed.tags.includes("esp_sensed"), "expected ESP sensing tag");
  assert(!sensed.tags.includes("memory_recent"), "ESP contact should not be a memory echo");
});

Deno.test("mindwipe/hallucination can tamper recent memory projection", () => {
  resetFloor();
  const world = new World({ seed: 77 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Facing, { dx: -1, dy: 0 });
  world.add(player, BaseStats, { perception: 5 });

  const monster = world.create();
  world.add(monster, Position, { x: 8, y: 10 });
  world.add(monster, NamedIdentity, { name: "Orc", identity: "orc" });
  world.add(monster, Vitality, { hp: 8, maxHp: 8 });

  buildWorldView(world); // remember monster while visible
  world.step = (world.step | 0) + 1; // ensure memory age > 0 without scheduler wiring
  world.set(player, Facing, { dx: 1, dy: 0 });
  world.add(player, Status, {
    statuses: [{ type: "mindwiped", duration: 20, potency: 3, stacks: 2 }],
  });

  const view = buildWorldView(world);
  const memory = view.entities.find((e) => e.id === monster);
  assert(memory, "recent memory should still render");
  assert(memory.tags.includes("memory_recent"), "expected memory channel");
  assert(memory.tags.includes("memory_tampered"), "high mindwipe should tamper recent memory");
});

Deno.test("touch-range monsters are fully resolved even behind facing", () => {
  resetFloor();
  const world = new World({ seed: 1234 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Facing, { dx: 1, dy: 0 }); // facing east
  world.add(player, BaseStats, { perception: 5 });

  const monster = world.create();
  world.add(monster, Position, { x: 9, y: 10 }); // directly behind, adjacent
  world.add(monster, NamedIdentity, { name: "Orc", identity: "orc" });
  world.add(monster, Vitality, { hp: 8, maxHp: 8 });

  const view = buildWorldView(world);
  const resolved = view.entities.find((e) => e.id === monster);
  assert(resolved, "adjacent monster should render as fully resolved contact");
  assertEquals(resolved.pos, { x: 9, y: 10 }, "touch-resolution should use current true position");
  assert(!resolved.tags.includes("memory_recent"), "touch-resolution should not be downgraded to memory");
  assert(!resolved.tags.includes("esp_sensed"), "touch-resolution should not be downgraded to ESP");
  assert(!resolved.tags.includes("thermal_sensed"), "touch-resolution should not be downgraded to thermal");
});

Deno.test("pet is always tracked at true position even outside FOV query radius", () => {
  resetFloor();
  const world = new World({ seed: 0x5150 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Facing, { dx: 1, dy: 0 });
  world.add(player, BaseStats, { perception: 5 });

  const pet = world.create();
  world.add(pet, Pet, {});
  world.add(pet, Position, { x: 30, y: 10 }); // well outside default near-player entity query window
  world.add(pet, NamedIdentity, { name: "Kitty", identity: "cat" });
  world.add(pet, Vitality, { hp: 12, maxHp: 12 });

  const view = buildWorldView(world);
  const petView = view.entities.find((e) => e.id === pet);
  assert(petView, "pet should always be projected into worldView");
  assertEquals(petView.pos, { x: 30, y: 10 }, "pet tracking should use true current location");
  assert(!petView.tags.includes("memory_recent"), "pet should not be downgraded to memory");
  assert(!petView.tags.includes("esp_sensed"), "pet should not be downgraded to ESP");
  assert(!petView.tags.includes("thermal_sensed"), "pet should not be downgraded to thermal");
});

Deno.test("fixed decorations remain as gray remembered glyphs after turning away", () => {
  resetFloor();
  const world = new World({ seed: 0x7788 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Facing, { dx: -1, dy: 0 }); // face door first
  world.add(player, BaseStats, { perception: 5 });

  const door = world.create();
  world.add(door, Position, { x: 8, y: 10 });
  world.add(door, NamedIdentity, { name: "Door", identity: "door" });
  world.add(door, DoorState, { open: false });

  let view = buildWorldView(world);
  let doorView = view.entities.find((e) => e.id === door);
  assert(doorView, "door should be visible before turning away");

  world.set(player, Facing, { dx: 1, dy: 0 }); // face away from door
  view = buildWorldView(world);
  doorView = view.entities.find((e) => e.id === door);
  assert(doorView, "door should still render from explored fixed-memory");
  assert(doorView.tags.includes("memory_recent"), "fixed decoration should use remembered-glyph channel");
  assert(doorView.tags.includes("memory_fixed"), "fixed decoration should be tagged as fixed memory");
  assertEquals(doorView.pos, { x: 8, y: 10 }, "fixed decoration memory should stay at true tile");
});

Deno.test("perception priority resolves as visible > memory > esp > thermal", () => {
  resetFloor();
  const world = new World({ seed: 0x9090 });

  const player = world.create();
  world.add(player, Player, {});
  world.add(player, Position, { x: 10, y: 10 });
  world.add(player, NamedIdentity, { name: "Hero", identity: "player" });
  world.add(player, Facing, { dx: -1, dy: 0 }); // prep memory from west
  world.add(player, BaseStats, { perception: 5 });
  world.add(player, Status, {
    statuses: [
      { type: "thermal_sense", duration: 40, potency: 1 },
      { type: "esp_sense", duration: 40, potency: 1 },
    ],
  });

  const memoryTarget = world.create();
  world.add(memoryTarget, Position, { x: 8, y: 10 });
  world.add(memoryTarget, NamedIdentity, { name: "Orc", identity: "orc" });
  world.add(memoryTarget, Vitality, { hp: 8, maxHp: 8 });

  const visibleTarget = world.create();
  world.add(visibleTarget, Position, { x: 12, y: 10 });
  world.add(visibleTarget, NamedIdentity, { name: "Front", identity: "bandit" });
  world.add(visibleTarget, Vitality, { hp: 8, maxHp: 8 });

  buildWorldView(world); // capture memory target while visible

  world.step = (world.step | 0) + 1;
  world.set(player, Facing, { dx: 1, dy: 0 }); // now looking east
  world.set(memoryTarget, Position, { x: 7, y: 10 }); // unseen movement after memory capture

  // Create ESP and thermal targets AFTER the first buildWorldView so they have
  // no perception memory — they must be detected purely via sense channels.
  const espTarget = world.create();
  world.add(espTarget, Position, { x: 3, y: 10 });
  world.add(espTarget, NamedIdentity, { name: "Goblin", identity: "goblin" });
  world.add(espTarget, Vitality, { hp: 8, maxHp: 8 });

  const thermalTarget = world.create();
  world.add(thermalTarget, Position, { x: 2, y: 10 });
  world.add(thermalTarget, NamedIdentity, { name: "Shade", identity: "shade" });
  world.add(thermalTarget, Vitality, { hp: 8, maxHp: 8 });
  world.add(thermalTarget, Traits, { mindless: true });

  const view = buildWorldView(world);
  const mem = view.entities.find((e) => e.id === memoryTarget);
  const esp = view.entities.find((e) => e.id === espTarget);
  const therm = view.entities.find((e) => e.id === thermalTarget);
  const vis = view.entities.find((e) => e.id === visibleTarget);

  assert(mem && mem.tags.includes("memory_recent"), "memory target should resolve to memory channel");
  assert(!mem.tags.includes("esp_sensed"), "memory should win over esp");
  assert(!mem.tags.includes("thermal_sensed"), "memory should win over thermal");

  assert(esp && esp.tags.includes("esp_sensed"), "esp target should resolve to esp channel");
  assert(!esp.tags.includes("thermal_sensed"), "esp should win over thermal");

  assert(therm && therm.tags.includes("thermal_sensed"), "mindless target should fall back to thermal channel");
  assert(!therm.tags.includes("esp_sensed"), "mindless target should not get esp channel");

  assert(vis, "visible target should remain directly visible");
  assert(!vis.tags.includes("memory_recent"), "visible target should not use memory channel");
  assert(!vis.tags.includes("esp_sensed"), "visible target should not use esp channel");
  assert(!vis.tags.includes("thermal_sensed"), "visible target should not use thermal channel");
});
