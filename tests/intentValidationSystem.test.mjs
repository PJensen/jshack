import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { Status } from "../src/rules/components/Status.js";
import { MoveIntent } from "../src/rules/components/Intents/MoveIntent.js";
import { AttackIntent } from "../src/rules/components/Intents/AttackIntent.js";
import { WaitIntent } from "../src/rules/components/Intents/WaitIntent.js";
import { DrinkIntent } from "../src/rules/components/Intents/DrinkIntent.js";
import { CastSpellIntent } from "../src/rules/components/Intents/CastSpellIntent.js";
import { intentValidationSystem } from "../src/rules/systems/intentValidationSystem.js";
import { applyStatusEffect } from "../src/rules/utils/effects.js";

// ── dead actors ─────────────────────────────────────────────────────

Deno.test("intentValidation: strips all intents from dead actors", () => {
  const world = new World({ seed: 42 });
  const id = world.create();
  world.add(id, Position, { x: 1, y: 1 });
  world.add(id, Vitality, { maxHp: 10, hp: 0 });
  world.add(id, MoveIntent, { dx: 1, dy: 0 });
  world.add(id, AttackIntent, { targetId: 99 });

  intentValidationSystem(world);

  assertEquals(world.has(id, MoveIntent), false, "dead actor should not have MoveIntent");
  assertEquals(world.has(id, AttackIntent), false, "dead actor should not have AttackIntent");
});

Deno.test("intentValidation: does NOT strip intents from living actors", () => {
  const world = new World({ seed: 42 });
  const id = world.create();
  world.add(id, Position, { x: 1, y: 1 });
  world.add(id, Vitality, { maxHp: 10, hp: 10 });
  world.add(id, MoveIntent, { dx: 1, dy: 0 });

  intentValidationSystem(world);

  assertEquals(world.has(id, MoveIntent), true, "living actor should keep MoveIntent");
});

// ── stunned actors ──────────────────────────────────────────────────

Deno.test("intentValidation: stunned actors keep WaitIntent but lose other intents", () => {
  const world = new World({ seed: 42 });
  const id = world.create();
  world.add(id, Position, { x: 1, y: 1 });
  world.add(id, Vitality, { maxHp: 10, hp: 10 });
  world.add(id, Status, {
    statuses: [{ type: "stunned", duration: 2, potency: 1, stacks: 1 }],
  });
  world.add(id, MoveIntent, { dx: 1, dy: 0 });
  world.add(id, WaitIntent, {});

  intentValidationSystem(world);

  assertEquals(world.has(id, MoveIntent), false, "stunned actor should not have MoveIntent");
  assertEquals(world.has(id, WaitIntent), true, "stunned actor should keep WaitIntent");
});

Deno.test("intentValidation: emits intent:blocked for stunned actors", () => {
  const world = new World({ seed: 42 });
  const id = world.create();
  world.add(id, Vitality, { maxHp: 10, hp: 10 });
  world.add(id, Status, {
    statuses: [{ type: "stunned", duration: 2, potency: 1, stacks: 1 }],
  });
  world.add(id, MoveIntent, { dx: 0, dy: 1 });

  let blockedEvent = null;
  world.on("intent:blocked", (ev) => { blockedEvent = ev; });

  intentValidationSystem(world);

  assert(blockedEvent, "should emit intent:blocked");
  assertEquals(blockedEvent.actor, id);
  assertEquals(blockedEvent.reason, "stunned");
});

Deno.test("intentValidation: marks stasis movement as cancelled with a reason", () => {
  const world = new World({ seed: 42 });
  const id = world.create();
  world.add(id, Vitality, { maxHp: 10, hp: 10 });
  applyStatusEffect(world, id, { key: "stasis", turnsLeft: 8 });
  world.add(id, MoveIntent, { dx: 1, dy: 0 });

  intentValidationSystem(world);

  assertEquals(world.get(id, MoveIntent)?.cancelled, true);
  assertEquals(world.get(id, MoveIntent)?.cancelReason, "stasis");
});

// ── multiple actors ─────────────────────────────────────────────────

Deno.test("intentValidation: processes multiple actors independently", () => {
  const world = new World({ seed: 42 });

  const alive = world.create();
  world.add(alive, Vitality, { maxHp: 10, hp: 10 });
  world.add(alive, MoveIntent, { dx: 1, dy: 0 });

  const dead = world.create();
  world.add(dead, Vitality, { maxHp: 10, hp: 0 });
  world.add(dead, MoveIntent, { dx: -1, dy: 0 });

  intentValidationSystem(world);

  assertEquals(world.has(alive, MoveIntent), true, "alive actor keeps intent");
  assertEquals(world.has(dead, MoveIntent), false, "dead actor loses intent");
});

// ── multiple intent types ───────────────────────────────────────────

Deno.test("intentValidation: strips all intent types from dead actor", () => {
  const world = new World({ seed: 42 });
  const id = world.create();
  world.add(id, Vitality, { maxHp: 10, hp: 0 });
  world.add(id, MoveIntent, { dx: 1, dy: 0 });
  world.add(id, CastSpellIntent, { spellId: "fireball" });
  world.add(id, DrinkIntent, { itemId: 5 });

  intentValidationSystem(world);

  assertEquals(world.has(id, MoveIntent), false);
  assertEquals(world.has(id, CastSpellIntent), false);
  assertEquals(world.has(id, DrinkIntent), false);
});

// ── entities without Vitality are unaffected ────────────────────────

Deno.test("intentValidation: entities without Vitality are not touched", () => {
  const world = new World({ seed: 42 });
  const id = world.create();
  world.add(id, Position, { x: 1, y: 1 });
  world.add(id, MoveIntent, { dx: 1, dy: 0 });
  // No Vitality — system iterates Vitality query so this entity is skipped

  intentValidationSystem(world);

  assertEquals(world.has(id, MoveIntent), true, "entity without Vitality should keep intents");
});
