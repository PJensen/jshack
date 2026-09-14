import { assert, assertEquals } from "jsr:@std/assert";
import { World } from '../src/lib/ecs-js/index.js';
import { Died } from "../src/events/Died.js";
import { Vitality } from '../src/rules/components/Vitality.js';
import { ActiveEffects } from '../src/rules/components/ActiveEffects.js';
import { StatusEffectNode } from '../src/rules/components/StatusEffectNode.js';
import { applyStatusEffect } from '../src/rules/utils/effects.js';
import { Resistances } from '../src/rules/components/Resistences.js';
import { dealDamage, resolveResistance } from '../src/rules/utils/dealDamage.js';

function makeTarget(world, opts = {}) {
  const id = world.create();
  world.add(id, Vitality, { maxHp: opts.maxHp ?? 20, hp: opts.hp ?? 20 });
  return id;
}

// ── Basic pipeline ───────────────────────────────────────────────────

Deno.test("dealDamage: applies damage and returns applied result", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  const result = dealDamage(world, { target: id, amount: 5, source: 0, type: 'physical' });
  assertEquals(result.applied, true);
  assertEquals(result.killed, false);
  assertEquals(result.amount, 5);
  assertEquals(result.rawAmount, 5);
  assertEquals(result.reason, 'applied');
  assertEquals(world.get(id, Vitality).hp, 15);
});

Deno.test("dealDamage: invalid target returns invalid-target", () => {
  const world = new World({ seed: 1 });
  const result = dealDamage(world, { target: 999, amount: 5 });
  assertEquals(result.applied, false);
  assertEquals(result.reason, 'invalid-target');
});

Deno.test("dealDamage: zero amount returns zero-amount", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  const result = dealDamage(world, { target: id, amount: 0 });
  assertEquals(result.applied, false);
  assertEquals(result.reason, 'zero-amount');
  assertEquals(world.get(id, Vitality).hp, 20);
});

Deno.test("dealDamage: negative amount returns zero-amount", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  const result = dealDamage(world, { target: id, amount: -3 });
  assertEquals(result.applied, false);
  assertEquals(result.reason, 'zero-amount');
});

Deno.test("dealDamage: target with 0 hp returns no-vitality", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world, { hp: 0 });
  const result = dealDamage(world, { target: id, amount: 5 });
  assertEquals(result.applied, false);
  assertEquals(result.reason, 'no-vitality');
});

// ── Invulnerability gate ─────────────────────────────────────────────

Deno.test("dealDamage: invulnerable target blocks damage", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  world.add(id, ActiveEffects, { effects: [{ key: 'invulnerable', turnsLeft: 5 }] });
  const events = [];
  world.on('status', (e) => events.push(e));
  const result = dealDamage(world, { target: id, amount: 10 });
  assertEquals(result.applied, false);
  assertEquals(result.reason, 'invulnerable');
  assertEquals(world.get(id, Vitality).hp, 20);
  assert(events.some(e => e.kind === 'immune'), 'IMMUNE status emitted');
});

Deno.test("dealDamage: topology-only invulnerable target blocks damage", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  applyStatusEffect(world, id, { key: 'invulnerable', turnsLeft: 5 });
  const result = dealDamage(world, { target: id, amount: 10 });
  assertEquals(result.applied, false);
  assertEquals(result.reason, 'invulnerable');
  assertEquals(world.get(id, Vitality).hp, 20);
  assertEquals(world.get(id, ActiveEffects), null);
  assertEquals([...world.query(StatusEffectNode)].length, 1);
});

Deno.test("dealDamage: bypassInvuln ignores invulnerability", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  world.add(id, ActiveEffects, { effects: [{ key: 'invulnerable', turnsLeft: 5 }] });
  const result = dealDamage(world, { target: id, amount: 10, bypassInvuln: true });
  assertEquals(result.applied, true);
  assertEquals(result.amount, 10);
  assertEquals(world.get(id, Vitality).hp, 10);
});

// ── Resistance resolution ────────────────────────────────────────────

Deno.test("resolveResistance: no Resistances component returns raw amount", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  assertEquals(resolveResistance(world, id, 10, 'fire'), 10);
});

Deno.test("resolveResistance: fire damage scaled by burnMult", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  world.add(id, Resistances, { thermal: { burnMult: 0.5 } });
  assertEquals(resolveResistance(world, id, 10, 'fire'), 5);
});

Deno.test("resolveResistance: physical damage reduced by kinetic DR", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  world.add(id, Resistances, { kinetic: { DR: 3 } });
  assertEquals(resolveResistance(world, id, 10, 'physical'), 7);
});

Deno.test("resolveResistance: kinetic DR cannot go below 0", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  world.add(id, Resistances, { kinetic: { DR: 50 } });
  assertEquals(resolveResistance(world, id, 10, 'physical'), 1);
});

Deno.test("resolveResistance: kinetic channels preserve minimum chip damage", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  world.add(id, Resistances, { kinetic: { DR: 1, bluntMult: 0.95 } });
  assertEquals(resolveResistance(world, id, 2, 'blunt'), 1);
});

Deno.test("resolveResistance: slash uses DR then slashMult", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  world.add(id, Resistances, { kinetic: { DR: 2, slashMult: 0.5 } });
  // (10 - 2) * 0.5 = 4
  assertEquals(resolveResistance(world, id, 10, 'slash'), 4);
});

Deno.test("resolveResistance: poison scaled by toxMult", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  world.add(id, Resistances, { chemical: { toxMult: 0.25 } });
  assertEquals(resolveResistance(world, id, 8, 'poison'), 2);
});

Deno.test("resolveResistance: unknown type passes through at full", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  world.add(id, Resistances, { kinetic: { DR: 5 } });
  assertEquals(resolveResistance(world, id, 10, 'divine'), 10);
});

Deno.test("dealDamage: resistance reduces final damage", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  world.add(id, Resistances, { kinetic: { DR: 4 } });
  const result = dealDamage(world, { target: id, amount: 10, type: 'physical' });
  assertEquals(result.applied, true);
  assertEquals(result.amount, 6);
  assertEquals(result.rawAmount, 10);
  assertEquals(world.get(id, Vitality).hp, 14);
});

Deno.test("dealDamage: true immunity emits RESIST status and returns resisted", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  world.add(id, Resistances, { chemical: { toxMult: 0 } });
  const events = [];
  world.on('status', (e) => events.push(e));
  const result = dealDamage(world, { target: id, amount: 5, type: 'poison' });
  assertEquals(result.applied, false);
  assertEquals(result.reason, 'resisted');
  assertEquals(world.get(id, Vitality).hp, 20);
  assert(events.some(e => e.kind === 'resist'), 'RESIST status emitted');
});

Deno.test("dealDamage: bypassResist skips resistance", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  world.add(id, Resistances, { kinetic: { DR: 20 } });
  const result = dealDamage(world, { target: id, amount: 5, type: 'physical', bypassResist: true });
  assertEquals(result.applied, true);
  assertEquals(result.amount, 5);
  assertEquals(world.get(id, Vitality).hp, 15);
});

// ── Events ───────────────────────────────────────────────────────────

Deno.test("dealDamage: emits 'damaged' with correct payload", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  const source = world.create();
  const events = [];
  world.on('damaged', (e) => events.push(e));
  dealDamage(world, {
    target: id,
    amount: 7,
    source,
    type: 'fire',
    cause: 'spell:meteor',
    critical: true,
    projectileKind: 'arrow',
    impactVector: { dx: 1, dy: 0 },
    impactProfile: { weaponClass: 'sword', attackKind: 'slash', signature: { blunt: 0.1, pierce: 0.2, slash: 0.7 } },
  });
  assertEquals(events.length, 1);
  assertEquals(events[0].target, id);
  assertEquals(events[0].amount, 7);
  assertEquals(events[0].type, 'fire');
  assertEquals(events[0].source, source);
  assertEquals(events[0].cause, 'spell:meteor');
  assertEquals(events[0].critical, true);
  assertEquals(events[0].projectileKind, 'arrow');
  assertEquals(events[0].impactVector?.dx, 1);
  assertEquals(events[0].impactVector?.dy, 0);
  assertEquals(events[0].impactProfile?.weaponClass, 'sword');
  assertEquals(events[0].impactProfile?.attackKind, 'slash');
  assertEquals(events[0].impactProfile?.signature?.slash, 0.7);
  assertEquals(events[0].hpBefore, 20);
  assertEquals(events[0].hpAfter, 13);
  assertEquals(events[0].maxHp, 20);
});

Deno.test("dealDamage: noTrigger flag forwarded in damaged event", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  const events = [];
  world.on('damaged', (e) => events.push(e));
  dealDamage(world, { target: id, amount: 3, noTrigger: true });
  assertEquals(events.length, 1);
  assertEquals(events[0].noTrigger, true);
});

// ── Death ────────────────────────────────────────────────────────────

Deno.test("dealDamage: kill target emits 'died' and returns killed", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world, { hp: 3 });
  const killer = world.create();
  const diedEvents = [];
  const typedDiedEvents = [];
  world.on(Died, (e) => typedDiedEvents.push(e));
  world.on('died', (e) => diedEvents.push(e));
  const result = dealDamage(world, { target: id, amount: 10, source: killer, cause: 'melee' });
  assertEquals(result.applied, true);
  assertEquals(result.killed, true);
  assertEquals(world.get(id, Vitality).hp, 0);
  assertEquals(diedEvents.length, 1);
  assertEquals(diedEvents[0].id, id);
  assertEquals(diedEvents[0].killer, killer);
  assertEquals(diedEvents[0].cause, 'melee');
  assertEquals(typedDiedEvents.length, 1);
  assertEquals(typedDiedEvents[0].id, id);
  assertEquals(typedDiedEvents[0].killer, killer);
  assertEquals(typedDiedEvents[0].cause, 'melee');
});

Deno.test("dealDamage: exact lethal damage kills", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world, { hp: 5 });
  const result = dealDamage(world, { target: id, amount: 5 });
  assertEquals(result.killed, true);
  assertEquals(world.get(id, Vitality).hp, 0);
});

Deno.test("dealDamage: overkill clamps hp to 0", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world, { hp: 2 });
  dealDamage(world, { target: id, amount: 100 });
  assertEquals(world.get(id, Vitality).hp, 0);
});

// ── at position override ─────────────────────────────────────────────

Deno.test("dealDamage: at position forwarded in damaged event", () => {
  const world = new World({ seed: 1 });
  const id = makeTarget(world);
  const events = [];
  world.on('damaged', (e) => events.push(e));
  dealDamage(world, { target: id, amount: 1, at: { x: 10, y: 20 } });
  assertEquals(events[0].at.x, 10);
  assertEquals(events[0].at.y, 20);
});
