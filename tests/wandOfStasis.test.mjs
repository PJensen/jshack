import { assert, assertEquals } from "jsr:@std/assert";
import { World } from '../src/lib/ecs-js/index.js';
import { Position } from '../src/rules/components/Position.js';
import { Player } from '../src/rules/components/Player.js';
import { NamedIdentity } from '../src/rules/components/NamedIdentity.js';
import { Faction } from '../src/rules/components/Faction.js';
import { Vitality } from '../src/rules/components/Vitality.js';
import { MoveIntent } from '../src/rules/components/Intents/MoveIntent.js';
import { Channeling } from '../src/rules/components/Channeling.js';
import { channelingSystem } from '../src/rules/systems/channelingSystem.js';
import { ActiveEffects } from '../src/rules/components/ActiveEffects.js';
import { Duration } from '../src/rules/components/Duration.js';
import { StatusEffectNode } from '../src/rules/components/StatusEffectNode.js';
import { TimedEffectNode } from '../src/rules/components/TimedEffectNode.js';
import { intentValidationSystem } from '../src/rules/systems/intentValidationSystem.js';
import { effectSystem } from '../src/rules/systems/effectSystem.js';
import { statusStrength } from '../src/rules/utils/statusFacade.js';
import { dealDamage } from '../src/rules/utils/dealDamage.js';
import { applyStatusEffect } from '../src/rules/utils/effects.js';
import { applyWandStasis } from '../src/rules/utils/stasis.js';

function makeWorld(seed = 1) {
  return new World({ seed });
}

function makePlayer(world, x, y) {
  const id = world.create();
  world.add(id, Player);
  world.add(id, Position, { x, y });
  world.add(id, NamedIdentity, { name: 'Hero', identity: 'player' });
  world.add(id, Vitality, { hp: 30, maxHp: 30 });
  return id;
}

function makeEnemyWithStasis(world, x, y, turnsLeft = 8) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, NamedIdentity, { name: 'Goblin', identity: 'goblin' });
  world.add(id, Faction, { key: 'enemy' });
  world.add(id, Vitality, { hp: 10, maxHp: 10 });
  applyStatusEffect(world, id, {
    key: 'stasis',
    turnsLeft,
    stacks: 1,
    potency: 1,
  });
  return id;
}

Deno.test("legacy ActiveEffects stasis is ignored", () => {
  const world = makeWorld();
  const enemy = world.create();
  world.add(enemy, Vitality, { hp: 10, maxHp: 10 });
  world.add(enemy, ActiveEffects, {
    effects: [{ key: 'stasis', turnsLeft: 8, stacks: 1, potency: 1 }],
  });

  assertEquals(statusStrength(world, enemy, 'stasis'), 0);
});

// ── Stasis intent blocking ──────────────────────────────────────────────────

Deno.test("stasis blocks MoveIntent", () => {
  const world = makeWorld();
  makePlayer(world, 5, 5);
  const enemy = makeEnemyWithStasis(world, 8, 5);

  // Give the enemy a MoveIntent
  world.add(enemy, MoveIntent, { dx: -1, dy: 0 });

  intentValidationSystem(world);

  assertEquals(world.get(enemy, MoveIntent), {
    dx: -1,
    dy: 0,
    cancelled: true,
    cancelReason: "stasis",
  });
});

Deno.test("stasis with zero turns is inactive", () => {
  const world = makeWorld();
  makePlayer(world, 5, 5);
  const enemy = makeEnemyWithStasis(world, 8, 5, 0);

  world.add(enemy, MoveIntent, { dx: -1, dy: 0 });

  intentValidationSystem(world);

  assertEquals(statusStrength(world, enemy, 'stasis'), 0);
  assertEquals(world.get(enemy, MoveIntent), {
    dx: -1,
    dy: 0,
    cancelled: false,
    cancelReason: "",
  });
});

// ── Stasis damage immunity ──────────────────────────────────────────────────

Deno.test("stasis blocks damage", () => {
  const world = makeWorld();
  const player = makePlayer(world, 5, 5);
  const enemy = makeEnemyWithStasis(world, 8, 5);

  const result = dealDamage(world, {
    source: player,
    target: enemy,
    amount: 5,
    type: "physical",
  });

  assertEquals(result.reason, "stasis", "damage should be blocked by stasis");
  const vit = world.get(enemy, Vitality);
  assertEquals(vit.hp, 10, "enemy HP should be unchanged");
});

Deno.test("stasis interrupts an active channel before it can complete", () => {
  const world = makeWorld();
  const enemy = makeEnemyWithStasis(world, 8, 5);
  const cancelled = [];
  world.on("channeling:cancelled", (event) => cancelled.push(event));
  world.add(enemy, Channeling, {
    mode: "cast",
    spellId: "shadow_bolt",
    targetId: enemy,
    turnsRemaining: 1,
    turnsTotal: 1,
  });

  channelingSystem(world);

  assert(!world.has(enemy, Channeling));
  assertEquals(cancelled[0]?.reason, "stasis");
});

Deno.test("finite stasis expires after its requested duration", () => {
  const world = makeWorld();
  const player = makePlayer(world, 5, 5);
  const enemy = makeEnemyWithStasis(world, 8, 5, 8);

  for (let i = 0; i < 7; i++) effectSystem(world);

  assertEquals(statusStrength(world, enemy, 'stasis'), 1);
  assertEquals(dealDamage(world, {
    source: player,
    target: enemy,
    amount: 5,
    type: "physical",
  }).reason, "stasis");

  effectSystem(world);

  assertEquals(statusStrength(world, enemy, 'stasis'), 0);
  const result = dealDamage(world, {
    source: player,
    target: enemy,
    amount: 5,
    type: "physical",
  });
  assert(result.reason !== "stasis", "stasis should expire");
  const vit = world.get(enemy, Vitality);
  assertEquals(vit.hp, 5, "enemy should take damage after stasis expires");
});

Deno.test("wand of stasis applies a topology-backed effect to a rat", () => {
  const world = makeWorld();
  const rat = world.create();
  world.add(rat, Position, { x: 8, y: 5 });
  world.add(rat, NamedIdentity, { name: 'Rat', identity: 'rat' });
  world.add(rat, Faction, { key: 'enemy' });
  world.add(rat, Vitality, { hp: 5, maxHp: 5 });
  world.add(rat, ActiveEffects, { effects: [] });

  assertEquals(applyWandStasis(world, rat), true);
  assertEquals(statusStrength(world, rat, 'stasis'), 1);
  assertEquals(world.get(rat, ActiveEffects).effects, [], 'stasis should not use the legacy effect array');
  const stasisNode = [...world.query(StatusEffectNode)]
    .find(([, effect]) => effect.key === 'stasis');
  assert(stasisNode, 'stasis should be stored as a runtime topology node');
  assertEquals(world.get(stasisNode[0], Duration).turnsLeft, 20, 'wand stasis should last 20 turns');
  assertEquals(world.get(stasisNode[0], TimedEffectNode), { key: 'stasis' });

  for (let i = 0; i < 19; i++) effectSystem(world);
  assertEquals(statusStrength(world, rat, 'stasis'), 1, 'wand stasis should remain active for 20 turns');

  world.add(rat, MoveIntent, { dx: -1, dy: 0 });
  intentValidationSystem(world);
  assertEquals(world.get(rat, MoveIntent)?.cancelReason, "stasis");
  assertEquals(world.get(rat, MoveIntent)?.cancelled, true);

  effectSystem(world);
  assertEquals(statusStrength(world, rat, 'stasis'), 0, 'wand stasis should expire after 20 turns');
});
