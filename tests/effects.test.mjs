import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from '../src/lib/ecs-js/index.js';
import { createPlayer } from '../src/rules/archetypes/Player.js';
import { ActiveEffects } from '../src/rules/components/ActiveEffects.js';
import { Vitality } from '../src/rules/components/Vitality.js';
import { Mana } from '../src/rules/components/Mana.js';
import { Stamina } from '../src/rules/components/Stamina.js';
import { applyEffectInstance, snapshotEffectInstances } from '../src/rules/utils/effectInstances.js';
import { Status } from '../src/rules/components/Status.js';
import { Equipment } from '../src/rules/components/Equipment.js';
import { NamedIdentity } from '../src/rules/components/NamedIdentity.js';
import { Faction } from '../src/rules/components/Faction.js';
import { Position } from '../src/rules/components/Position.js';
import { AttackIntent } from '../src/rules/components/Intents/AttackIntent.js';
import { effectSystem } from '../src/rules/systems/effectSystem.js';
import { combatSystem } from '../src/rules/systems/combatSystem.js';
import { equipmentSystem } from '../src/rules/systems/equipmentSystem.js';

function scheduler(world) {
  try { effectSystem(world); } catch (e) { console.error('effect system error', e); }
}

Deno.test("poison effect deals damage over time and expires", () => {
  const world = new World({ seed: 7 });
  world.setScheduler((w) => scheduler(w));

  const player = createPlayer(world, { name: 'Hero', maxHp: 10, hp: 10 });
  let vit = world.get(player, Vitality);
  assert(vit && vit.hp === 10 && vit.maxHp === 10, 'player vitality created');

  const ae = world.get(player, ActiveEffects) || world.add(player, ActiveEffects, { effects: [] });
  (world.get(player, ActiveEffects) || ae).effects.push({ key: 'poison', turnsLeft: 3, potency: 2 });

  world.tick(1);
  vit = world.get(player, Vitality);
  let st = world.get(player, Status);
  assert(vit.hp === 8, 'poison tick 1 reduces hp by 2');
  assert(st && st.statuses.some(s => s.type === 'poisoned' && s.duration >= 2), 'status poisoned present');

  world.tick(1);
  vit = world.get(player, Vitality);
  st = world.get(player, Status);
  assert(vit.hp === 6, 'poison tick 2 reduces hp by 2');
  assert(st.statuses.some(s => s.type === 'poisoned'), 'still poisoned');

  world.tick(1);
  vit = world.get(player, Vitality);
  st = world.get(player, Status);
  assert(vit.hp === 4, 'poison tick 3 reduces hp by 2');

  world.tick(1);
  st = world.get(player, Status);
  assert(!st.statuses.some(s => s.type === 'poisoned'), 'poisoned status cleared after expiry');
});

Deno.test("DOT aliases refresh duration and do not stack damage", () => {
  const world = new World({ seed: 11 });
  world.setScheduler((w) => scheduler(w));

  const player = createPlayer(world, { name: "Hero", maxHp: 20, hp: 20 });
  const ae = world.get(player, ActiveEffects);
  ae.effects.push({ key: "poison", turnsLeft: 1, potency: 2, stacks: 3 });
  ae.effects.push({ key: "poisoned", turnsLeft: 3, potency: 2, stacks: 1 });

  world.tick(1);

  const vit = world.get(player, Vitality);
  assertEquals(vit.hp, 18, "poison should tick once per turn even with duplicate alias entries");

  const after = world.get(player, ActiveEffects);
  const poisonRows = (after?.effects || []).filter((e) => {
    const k = String(e?.key || "").toLowerCase();
    return k === "poison" || k === "poisoned";
  });
  assertEquals(poisonRows.length, 1, "poison aliases should compact into a single active effect row");
  assertEquals(Number(poisonRows[0]?.stacks || 0), 1, "dot stacks should remain singular");
  assertEquals(Number(poisonRows[0]?.turnsLeft || 0), 2, "reapplied poison should refresh to max duration then tick down");
});

Deno.test("simultaneous regen and burn effects net correctly", () => {
  const world = new World({ seed: 7 });
  world.setScheduler((w) => scheduler(w));

  // Need a player so the scheduler works
  createPlayer(world, { name: 'Hero', maxHp: 10, hp: 10 });

  const monster = world.create();
  world.add(monster, Vitality, { maxHp: 20, hp: 10 });
  world.add(monster, ActiveEffects, { effects: [
    { key: 'regeneration', turnsLeft: 2, potency: 3 },
    { key: 'burn', turnsLeft: 2, potency: 1 }
  ]});

  world.tick(1);
  let mvit = world.get(monster, Vitality);
  assert(mvit.hp === 12, 'regen(3) - burn(1) = +2 net');

  world.tick(1);
  mvit = world.get(monster, Vitality);
  assert(mvit.hp === 14, 'second tick net +2');

  world.tick(1);
  const mst = world.get(monster, Status);
  assert(!mst.statuses.length, 'statuses cleared after both effects expired');
});

Deno.test("town stew composite heals and restores stamina under one status", () => {
  const world = new World({ seed: 12 });
  const actor = world.create();
  world.add(actor, Vitality, { maxHp: 12, hp: 8 });
  world.add(actor, Stamina, { maxStamina: 8, stamina: 3, staminaRegen: 0 });
  applyEffectInstance(world, actor, { key: "town_stew", turnsLeft: 300, potency: 1 });
  world.setScheduler(effectSystem);
  world.tick(1);

  const vit = world.get(actor, Vitality);
  const stamina = world.get(actor, Stamina);
  const effects = snapshotEffectInstances(world, actor);

  assertEquals(vit.hp, 9, "town stew should heal through its composite effect");
  assertEquals(stamina.stamina, 4, "town stew should restore stamina through its composite effect");
  assertEquals(effects.filter((effect) => effect.key === "town_stew").length, 1);
  assertEquals(effects[0].turns, 299);
  assertEquals(world.get(actor, ActiveEffects), null);
});

Deno.test("disease stacking: pushEffect increments stacks and refreshes duration", () => {
  const world = new World({ seed: 7 });
  world.setScheduler((w) => scheduler(w));

  const player = createPlayer(world, { name: 'Hero', maxHp: 20, hp: 20 });

  // First disease application (simulates first rat bite proc)
  const ae = world.get(player, ActiveEffects);
  ae.effects.push({ key: 'disease', turnsLeft: 20, potency: 1, stacks: 1 });

  // Tick a few times to age the effect
  world.tick(1);
  world.tick(1);
  world.tick(1);

  // Verify disease is active with stacks=1 and duration has ticked down
  let st = world.get(player, Status);
  let diseased = st.statuses.find(s => s.type === 'disease');
  assert(diseased, 'disease status present after first application');
  assertEquals(diseased.stacks, 1, 'stacks should be 1 after first application');
  assert(diseased.duration < 20, 'duration should have ticked down');

  // Second disease application (simulates second rat bite proc)
  // This mimics what pushEffect does: find existing, bump stacks, refresh turnsLeft
  const existing = ae.effects.find(e => e.key === 'disease');
  assert(existing, 'disease effect should still be in ActiveEffects');
  existing.stacks = (existing.stacks || 1) + 1;
  existing.turnsLeft = Math.max(existing.turnsLeft, 20);

  world.tick(1);

  st = world.get(player, Status);
  diseased = st.statuses.find(s => s.type === 'disease');
  assert(diseased, 'disease status present after second application');
  assertEquals(diseased.stacks, 2, 'stacks should be 2 after second application');

  // Third stack
  const existing2 = ae.effects.find(e => e.key === 'disease');
  existing2.stacks = (existing2.stacks || 1) + 1;
  existing2.turnsLeft = Math.max(existing2.turnsLeft, 20);

  world.tick(1);

  st = world.get(player, Status);
  diseased = st.statuses.find(s => s.type === 'disease');
  assertEquals(diseased.stacks, 3, 'stacks should be 3 after third application');

  // Verify disease doesn't deal damage (hp unchanged)
  const vit = world.get(player, Vitality);
  assertEquals(vit.hp, 20, 'disease should not deal damage');
});

Deno.test("rat on-hit hook: disease stacks via full combat pipeline", () => {
  // Try many seeds to find one where the rat hits AND procs disease at least twice
  let foundSeed = -1;
  let maxStacks = 0;

  for (let seed = 0; seed < 200; seed++) {
    const world = new World({ seed });
    world.setScheduler((w) => {
      combatSystem(w);
      equipmentSystem(w);
      effectSystem(w);
    });

    const player = world.create();
    world.add(player, NamedIdentity, { name: 'Hero', identity: 'player' });
    world.add(player, Vitality, { maxHp: 100, hp: 100 });
    world.add(player, Equipment, {});
    world.add(player, ActiveEffects, { effects: [] });
    world.add(player, Position, { x: 5, y: 5 });

    const rat = world.create();
    world.add(rat, NamedIdentity, { name: 'Rat', identity: 'rat' });
    world.add(rat, Vitality, { maxHp: 100, hp: 100 });
    world.add(rat, Equipment, {});
    world.add(rat, ActiveEffects, { effects: [] });
    world.add(rat, Faction, { key: 'enemy' });
    world.add(rat, Position, { x: 5, y: 6 });

    let stacks = 0;
    // Run 40 rounds of rat attacking player
    for (let turn = 0; turn < 40; turn++) {
      world.add(rat, AttackIntent, { targetId: player });
      world.tick(1);

      const ae = world.get(player, ActiveEffects);
      const disease = ae?.effects?.find(e => e.key === 'disease');
      if (disease && disease.stacks > stacks) stacks = disease.stacks;
    }

    if (stacks > maxStacks) maxStacks = stacks;
    if (stacks >= 2) { foundSeed = seed; break; }
  }

  assert(foundSeed >= 0, `should find a seed where disease stacks >= 2; best was ${maxStacks} stacks`);
});

Deno.test("bleed effect deals damage over time and expires", () => {
  const world = new World({ seed: 7 });
  world.setScheduler((w) => scheduler(w));

  const player = createPlayer(world, { name: 'Hero', maxHp: 10, hp: 10 });
  let vit = world.get(player, Vitality);
  assert(vit && vit.hp === 10 && vit.maxHp === 10, 'player vitality created');

  const ae = world.get(player, ActiveEffects) || world.add(player, ActiveEffects, { effects: [] });
  (world.get(player, ActiveEffects) || ae).effects.push({ key: 'bleed', turnsLeft: 2, potency: 1 });

  world.tick(1);
  vit = world.get(player, Vitality);
  let st = world.get(player, Status);
  assert(vit.hp === 9, 'bleed tick 1 reduces hp by 1');
  assert(st && st.statuses.some(s => s.type === 'bleeding' && s.duration >= 1), 'status bleeding present');

  world.tick(1);
  vit = world.get(player, Vitality);
  assert(vit.hp === 8, 'bleed tick 2 reduces hp by 1');

  world.tick(1);
  st = world.get(player, Status);
  assert(!st.statuses.some(s => s.type === 'bleeding'), 'bleeding status cleared after expiry');
});

Deno.test("mana_restore effect restores mana over time and expires", () => {
  const world = new World({ seed: 7 });
  world.setScheduler((w) => scheduler(w));

  const player = createPlayer(world, { name: 'Hero', maxHp: 10, hp: 10 });
  const mana = world.get(player, Mana);
  mana.maxMana = 50;
  mana.mana = 20;

  const ae = world.get(player, ActiveEffects);
  ae.effects.push({ key: 'mana_restore', turnsLeft: 3, potency: 5 });

  world.tick(1);
  let st = world.get(player, Status);
  assertEquals(mana.mana, 25, 'mana_restore tick 1 restores 5 mana');
  assert(st && st.statuses.some(s => s.type === 'mana_surge'), 'status mana_surge present');

  world.tick(1);
  assertEquals(mana.mana, 30, 'mana_restore tick 2 restores 5 mana');

  world.tick(1);
  assertEquals(mana.mana, 35, 'mana_restore tick 3 restores 5 mana');

  world.tick(1);
  st = world.get(player, Status);
  assert(!st.statuses.some(s => s.type === 'mana_surge'), 'mana_surge status cleared after expiry');
});

Deno.test("mana_restore respects maxMana + equipment cap", () => {
  const world = new World({ seed: 7 });
  world.setScheduler((w) => scheduler(w));

  const player = createPlayer(world, { name: 'Hero', maxHp: 10, hp: 10 });
  const mana = world.get(player, Mana);
  mana.maxMana = 30;
  mana.mana = 28;

  const eq = world.get(player, Equipment);
  eq.maxManaDerived = 5;

  const ae = world.get(player, ActiveEffects);
  ae.effects.push({ key: 'mana_restore', turnsLeft: 3, potency: 10 });

  world.tick(1);
  assertEquals(mana.mana, 35, 'mana capped at maxMana(30) + maxManaDerived(5) = 35');

  world.tick(1);
  assertEquals(mana.mana, 35, 'mana stays at cap on subsequent ticks');
});
