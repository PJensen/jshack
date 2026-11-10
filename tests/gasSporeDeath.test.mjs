import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Position } from "../src/rules/components/Position.js";
import { gasSporeExplodeOnDeath } from "../src/rules/data/callbacks/death.js";
import { hazardSystem } from "../src/rules/systems/hazardSystem.js";
import { spawnHazard } from "../src/rules/utils/hazardSpawn.js";
import { spawnPlasmaCloud } from "../src/rules/utils/spawnPlasmaCloud.js";

Deno.test("gasSporeExplodeOnDeath spawns one explosive_gas hazard with euclidean metric", () => {
  const world = new World({ seed: 4401 });
  const spawned = [];
  world.on("hazard:spawned", (event) => spawned.push(event));

  const onDeath = gasSporeExplodeOnDeath({ turnsLeft: 3, tickDamage: 6, radius: 2 });
  onDeath({
    world,
    deadId: 99,
    pos: { x: 10, y: 10 },
    identity: "gas_spore",
  });

  let found = 0;
  for (const [id, pos, hazard] of world.query(Position, HazardArea)) {
    found++;
    assertEquals(id > 0, true);
    assertEquals(pos.x | 0, 10);
    assertEquals(pos.y | 0, 10);
    assertEquals(String(hazard.kind || ""), "gas");
    assertEquals(String(hazard.medium || ""), "air");
    assertEquals(hazard.radius | 0, 2);
    assertEquals(String(hazard.damageType || ""), "poison");
    assertEquals(String(hazard.cause || ""), "monster:death:gas_spore");
    assertEquals((hazard.tickDamage | 0), 6);
    assertEquals((hazard.turnsLeft | 0), 3);
    assertEquals(String(hazard.meta?.distanceMetric || ""), "euclidean");
    const ni = world.get(id, NamedIdentity);
    assertEquals(String(ni?.identity || ""), "explosive_gas");
  }
  assertEquals(found, 1);
  assertEquals(spawned.length, 1, "should emit one hazard:spawned event");
});

Deno.test("gas hazards ignite into fire hazards when exposed to fire", () => {
  const world = new World({ seed: 4402 });
  const spawned = [];
  world.on("hazard:spawned", (event) => spawned.push(event));

  const gasId = spawnHazard(world, {
    x: 6,
    y: 6,
    kind: "gas",
    medium: "air",
    turnsLeft: 4,
    radius: 0,
    tickDamage: 2,
    damageType: "poison",
    cause: "test:gas",
    meta: { ignitable: true },
  });
  assert(gasId > 0, "gas hazard should spawn");

  const fireId = spawnHazard(world, {
    x: 6,
    y: 6,
    kind: "fire",
    medium: "air",
    turnsLeft: 3,
    radius: 0,
    tickDamage: 1,
    damageType: "fire",
    cause: "test:fire",
  });
  assert(fireId > 0, "fire hazard should spawn");

  hazardSystem(world);

  const atCell = [];
  for (const [, pos, hazard] of world.query(Position, HazardArea)) {
    if ((pos.x | 0) !== 6 || (pos.y | 0) !== 6) continue;
    atCell.push(String(hazard.kind || ""));
  }
  assert(!atCell.includes("gas"), "gas hazard should be consumed by ignition");
  const ignitedFire = spawned.filter((event) =>
    String(event.kind || "") === "fire" &&
    String(event.cause || "").includes("ignited")
  );
  assert(ignitedFire.length >= 1, "ignition should spawn at least one fire hazard");
});

Deno.test("equipped torch ignites explosive gas cloud", () => {
  const world = new World({ seed: 4403 });
  const spawned = [];
  world.on("hazard:spawned", (event) => spawned.push(event));

  const torch = world.create();
  world.add(torch, ItemInfo, {
    id: "torch",
    type: "equip",
    slot: "offhand",
    tags: [],
  });
  const actor = world.create();
  world.add(actor, Position, { x: 8, y: 8 });
  world.add(actor, Equipment, { offhand: torch });

  const gasId = spawnHazard(world, {
    x: 8,
    y: 8,
    kind: "gas",
    medium: "air",
    turnsLeft: 4,
    radius: 2,
    tickDamage: 2,
    damageType: "poison",
    cause: "test:gas",
    identity: "explosive_gas",
    meta: { distanceMetric: "euclidean" },
  });
  assert(gasId > 0, "gas hazard should spawn");

  hazardSystem(world);

  const atCell = [];
  let fireTurns = 0;
  for (const [, pos, hazard] of world.query(Position, HazardArea)) {
    if ((pos.x | 0) !== 8 || (pos.y | 0) !== 8) continue;
    atCell.push(String(hazard.kind || ""));
    if (String(hazard.kind || "") === "fire") fireTurns = Number(hazard.turnsLeft || 0) | 0;
  }
  assert(!atCell.includes("gas"), "gas should ignite when torch carrier is inside cloud");
  assert(atCell.includes("fire"), "ignition should leave fire hazard at the cloud origin");
  assertEquals(fireTurns, 4, "explosive gas ignition should preserve area-denial duration");
});

Deno.test("electric plasma cloud ignites explosive gas cloud", () => {
  const world = new World({ seed: 4404 });
  const spawned = [];
  world.on("hazard:spawned", (event) => spawned.push(event));

  const gasId = spawnHazard(world, {
    x: 8,
    y: 8,
    kind: "gas",
    medium: "air",
    turnsLeft: 4,
    radius: 1,
    tickDamage: 2,
    damageType: "poison",
    cause: "test:gas",
    identity: "explosive_gas",
  });
  assert(gasId > 0, "gas hazard should spawn");

  const plasmaId = spawnPlasmaCloud(world, {
    x: 8,
    y: 8,
    turnsLeft: 2,
    radius: 0,
    damage: 1,
  });
  assert(plasmaId > 0, "plasma hazard should spawn");

  hazardSystem(world);

  const atCell = [];
  for (const [, pos, hazard] of world.query(Position, HazardArea)) {
    if ((pos.x | 0) !== 8 || (pos.y | 0) !== 8) continue;
    atCell.push(String(hazard.kind || ""));
  }
  assert(!atCell.includes("gas"), "gas should ignite when exposed to an electric plasma cloud");
  assert(atCell.includes("fire"), "electric ignition should leave fire hazard at the cloud origin");
  assert(
    spawned.some((event) => String(event.kind || "") === "fire" && String(event.cause || "").includes("ignited")),
    "electric ignition should spawn a fire hazard",
  );
});
