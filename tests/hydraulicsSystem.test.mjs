import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Collider } from "../src/rules/components/Collider.js";
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { HydraulicsLink } from "../src/rules/components/HydraulicsLink.js";
import { Interactable } from "../src/rules/components/Interactable.js";
import { KnockbackPending } from "../src/rules/components/KnockbackPending.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { ObjectState } from "../src/rules/components/ObjectState.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Weight } from "../src/rules/components/Weight.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { materializeSpawn } from "../src/rules/environment/dungeon/populate.js";
import { clearAll as clearTileMap, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";
import { INTERACT_PAYLOADS } from "../src/rules/content/interaction/interactPayloads.js";
import { hydraulicsSystem } from "../src/rules/systems/hydraulicsSystem.js";
import { knockbackSystem } from "../src/rules/systems/knockbackSystem.js";
import { applyStatusEffect } from "../src/rules/utils/effects.js";

Deno.test("materializeSpawn propagates hydraulics params into simple archetypes", () => {
  const world = new World({ seed: 7 });
  const gateId = materializeSpawn(world, {
    x: 3,
    y: 4,
    kind: "portcullis",
    params: { linkId: "hyd:test" },
  });
  assert(gateId > 0);
  assertEquals(world.get(gateId, HydraulicsLink)?.linkId, "hyd:test");
  assertEquals(world.get(gateId, ObjectState)?.state, "lowered");
});

Deno.test("hydraulicsSystem presses plinth and opens linked portcullis", () => {
  const world = new World({ seed: 9 });

  const gateId = world.create();
  world.add(gateId, Position, { x: 5, y: 5 });
  world.add(gateId, NamedIdentity, { name: "Portcullis", identity: "portcullis" });
  world.add(gateId, HydraulicsLink, { linkId: "hyd:a", role: "portcullis" });
  world.add(gateId, ObjectState, { state: "lowered" });
  world.add(gateId, Collider, { solid: true, blocksSight: true });

  const plinthId = world.create();
  world.add(plinthId, Position, { x: 2, y: 2 });
  world.add(plinthId, HydraulicsLink, { linkId: "hyd:a", role: "plinth" });
  world.add(plinthId, ObjectState, { state: "unpressed" });
  world.add(plinthId, Interactable, {
    action: "inspectPressurePlinth",
    params: { linkId: "hyd:a", thresholdWeight: 25 },
  });

  const actorId = world.create();
  world.add(actorId, Position, { x: 2, y: 2 });
  world.add(actorId, Weight, { self: 70, total: 70 });
  world.add(actorId, Vitality, { hp: 10, maxHp: 10 });

  hydraulicsSystem(world);

  assertEquals(world.get(plinthId, ObjectState)?.state, "pressed");
  assertEquals(world.get(gateId, ObjectState)?.state, "raised");
  assertEquals(world.get(gateId, Collider)?.solid, false);
});

Deno.test("hydraulicsSystem unpressed plinth re-closes linked portcullis", () => {
  const world = new World({ seed: 10 });

  const gateId = world.create();
  world.add(gateId, Position, { x: 5, y: 5 });
  world.add(gateId, NamedIdentity, { name: "Portcullis", identity: "portcullis" });
  world.add(gateId, HydraulicsLink, { linkId: "hyd:b", role: "portcullis" });
  world.add(gateId, ObjectState, { state: "raised" });
  world.add(gateId, Collider, { solid: false, blocksSight: false });

  const plinthId = world.create();
  world.add(plinthId, Position, { x: 2, y: 2 });
  world.add(plinthId, HydraulicsLink, { linkId: "hyd:b", role: "plinth" });
  world.add(plinthId, ObjectState, { state: "pressed" });
  world.add(plinthId, Interactable, {
    action: "inspectPressurePlinth",
    params: { linkId: "hyd:b", thresholdWeight: 25 },
  });

  hydraulicsSystem(world);

  assertEquals(world.get(plinthId, ObjectState)?.state, "unpressed");
  assertEquals(world.get(gateId, ObjectState)?.state, "lowered");
  assertEquals(world.get(gateId, Collider)?.solid, true);
});

Deno.test("operateChainWinch toggles linked portcullis state", () => {
  const world = new World({ seed: 11 });

  const gateId = world.create();
  world.add(gateId, Position, { x: 6, y: 3 });
  world.add(gateId, HydraulicsLink, { linkId: "hyd:c", role: "portcullis" });
  world.add(gateId, ObjectState, { state: "lowered" });
  world.add(gateId, Collider, { solid: true, blocksSight: true });

  const winchId = world.create();
  world.add(winchId, Position, { x: 2, y: 2 });
  world.add(winchId, Interactable, {
    action: "operateChainWinch",
    params: { linkId: "hyd:c" },
  });
  world.add(winchId, ObjectState, { state: "idle" });

  INTERACT_PAYLOADS.operateChainWinch.onInteract({
    world,
    actor: 0,
    targetId: winchId,
  });
  assertEquals(world.get(gateId, ObjectState)?.state, "raised");

  INTERACT_PAYLOADS.operateChainWinch.onInteract({
    world,
    actor: 0,
    targetId: winchId,
  });
  assertEquals(world.get(gateId, ObjectState)?.state, "lowered");
});

Deno.test("hydraulicsSystem steam vent emits hazards and knockback in vent line", () => {
  const world = new World({ seed: 12 });
  world.step = 1;
  clearTileMap();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);

  const ventId = world.create();
  world.add(ventId, Position, { x: 4, y: 4 });
  world.add(ventId, NamedIdentity, { name: "Steam Vent", identity: "steam_vent" });
  world.add(ventId, Interactable, {
    action: "inspectSteamVent",
    params: {
      periodTurns: 6,
      activeTurns: 2,
      range: 3,
      dirX: 1,
      dirY: 0,
      pushForce: 1,
      damage: 2,
    },
  });

  const targetId = world.create();
  world.add(targetId, Position, { x: 6, y: 4 });
  world.add(targetId, Vitality, { hp: 10, maxHp: 10 });

  hydraulicsSystem(world);

  const hazards = [];
  for (const [id, pos, hz] of world.query(Position, HazardArea)) {
    if (String(hz?.kind || "") !== "steam") continue;
    hazards.push(`${id}:${pos.x},${pos.y}`);
  }
  assert(hazards.length >= 2, "expected vent to emit steam hazards downrange");
  assert(world.has(targetId, KnockbackPending), "target in vent line should be pushed");
});

Deno.test("knockbackSystem does not displace a stasis target", () => {
  const world = new World({ seed: 13 });
  clearTileMap();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  tiles.fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);

  try {
    const targetId = world.create();
    world.add(targetId, Position, { x: 6, y: 4 });
    world.add(targetId, Vitality, { hp: 10, maxHp: 10 });
    applyStatusEffect(world, targetId, { key: "stasis", turnsLeft: 8 });
    world.add(targetId, KnockbackPending, { dx: 1, dy: 0, force: 2 });

    knockbackSystem(world);

    assertEquals(world.get(targetId, Position), { x: 6, y: 4 });
    assertEquals(world.has(targetId, KnockbackPending), false);
  } finally { clearTileMap(); }
});
