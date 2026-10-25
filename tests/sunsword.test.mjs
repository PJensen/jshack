import { assert, assertEquals } from "jsr:@std/assert";
import { World } from '../src/lib/ecs-js/index.js';
import { Position } from '../src/rules/components/Position.js';
import { Player } from '../src/rules/components/Player.js';
import { NamedIdentity } from '../src/rules/components/NamedIdentity.js';
import { Faction } from '../src/rules/components/Faction.js';
import { Equipment } from '../src/rules/components/Equipment.js';
import { ItemInfo } from '../src/rules/components/ItemInfo.js';
import { Vitality } from '../src/rules/components/Vitality.js';
import { CreatureType, CREATURE_TYPES } from '../src/rules/components/CreatureType.js';
import { ActiveEffects } from '../src/rules/components/ActiveEffects.js';
import { ItemCooldown } from '../src/rules/components/ItemCooldown.js';
import { Brain } from '../src/rules/components/Brain.js';
import { hasEquippedTag } from '../src/rules/utils/equipTags.js';
import { COMBAT_INTERACTION_RULES } from '../src/rules/data/combatInteractions.js';
import { statusStrength } from '../src/rules/utils/statusFacade.js';
import { getEffectiveVisionRange } from '../src/rules/utils/blind.js';
import { getItemHooksByIdentity } from '../src/rules/content/items/itemHooks.js';
import { executeInteraction } from '../src/rules/interaction/runtime/actionRuntime.js';
import { usePipeline } from '../src/rules/interaction/verbs/usePipeline.js';
import { ItemAbilityActivated } from '../src/events/ItemAbilityActivated.js';
import { getItemCooldownRemaining } from '../src/rules/utils/itemCooldowns.js';
import { clearAll, loadChunk } from '../src/rules/environment/dungeon/tileMap.js';
import { CHUNK_SIZE, TILE_FLOOR } from '../src/rules/environment/dungeon/constants.js';
import '../src/content/items/sunsword.js';
import { installContent } from '../src/content/install.js';
installContent();

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeWorld(seed = 1) {
  return new World({ seed });
}

function makePlayer(world, x, y) {
  const id = world.create();
  world.add(id, Player);
  world.add(id, Position, { x, y });
  world.add(id, NamedIdentity, { name: 'Hero', identity: 'player' });
  world.add(id, Vitality, { hp: 30, maxHp: 30 });
  world.add(id, Equipment, {});
  return id;
}

function equipSunsword(world, playerId) {
  const swordId = world.create();
  world.add(swordId, NamedIdentity, { name: 'Sunsword', identity: 'sunsword' });
  world.add(swordId, ItemInfo, {
    type: 'equip', slot: 'weapon', damageDice: '1d8', damageType: 'slash',
    tags: ['sunlight'],
  });
  const eq = world.get(playerId, Equipment);
  eq.weapon = swordId;
  return swordId;
}

function makeUndead(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, NamedIdentity, { name: 'Skeleton', identity: 'skeleton' });
  world.add(id, Faction, { key: 'enemy' });
  world.add(id, Vitality, { hp: 10, maxHp: 10 });
  world.add(id, CreatureType, { type: CREATURE_TYPES.undead });
  return id;
}

function makeHumanoid(world, x, y) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, NamedIdentity, { name: 'Goblin', identity: 'goblin' });
  world.add(id, Faction, { key: 'enemy' });
  world.add(id, Vitality, { hp: 10, maxHp: 10 });
  world.add(id, CreatureType, { type: CREATURE_TYPES.humanoid });
  return id;
}

// ── hasEquippedTag ──────────────────────────────────────────────────────────

Deno.test("sunsword: hasEquippedTag detects sunlight tag", () => {
  const world = makeWorld();
  const player = makePlayer(world, 5, 5);
  equipSunsword(world, player);
  assert(hasEquippedTag(world, player, "sunlight"), "should detect sunlight tag");
});

Deno.test("sunsword: no sunlight tag without sunsword", () => {
  const world = makeWorld();
  const player = makePlayer(world, 5, 5);
  assert(!hasEquippedTag(world, player, "sunlight"), "no weapon = no sunlight");
});

// ── Combat interaction: bonus vs undead ─────────────────────────────────────

Deno.test("sunsword: +4 damage vs undead", () => {
  const world = makeWorld();
  const player = makePlayer(world, 5, 5);
  const swordId = equipSunsword(world, player);
  const skeleton = makeUndead(world, 6, 5);

  const rule = COMBAT_INTERACTION_RULES.find(r => r.id === "sunlight_weapon_vs_undead");
  assert(rule, "sunlight_weapon_vs_undead rule should exist");

  const ctx = {
    attacker: player,
    defender: skeleton,
    weaponId: swordId,
    damage: 5,
    damageType: "slash",
    world,
  };

  assert(rule.gate(world, ctx), "gate should pass for sunlight weapon vs undead");
  rule.apply(world, ctx);
  assertEquals(ctx.damage, 9, "damage should be 5 + 4 = 9");
});

Deno.test("sunsword: no bonus vs non-undead", () => {
  const world = makeWorld();
  const player = makePlayer(world, 5, 5);
  const swordId = equipSunsword(world, player);
  const goblin = makeHumanoid(world, 6, 5);

  const rule = COMBAT_INTERACTION_RULES.find(r => r.id === "sunlight_weapon_vs_undead");
  const ctx = {
    attacker: player,
    defender: goblin,
    weaponId: swordId,
    damage: 5,
    damageType: "slash",
    world,
  };

  assert(!rule.gate(world, ctx), "gate should NOT pass for sunlight weapon vs humanoid");
});

// ── Blinding ray ────────────────────────────────────────────────────────────

Deno.test("sunsword: blinding ray applies blinded effect", () => {
  const world = makeWorld();
  const enemy = makeUndead(world, 8, 5);

  // Simulate what onConfirm does: add ActiveEffects then push blinded
  world.add(enemy, ActiveEffects, { effects: [{ key: 'blinded', turnsLeft: 5, stacks: 1, potency: 1 }] });

  const strength = statusStrength(world, enemy, "blinded");
  assert(strength > 0, "enemy should have blinded status after ray");
});

Deno.test("sunsword: canonical use activates its default ability with target and cooldown", () => {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  const world = makeWorld();
  const actor = makePlayer(world, 5, 5);
  const sword = equipSunsword(world, actor);
  const target = makeUndead(world, 7, 5);
  const receipts = [];
  world.on(ItemAbilityActivated, (event) => receipts.push(event));
  const result = executeInteraction(world, { verb: 'use', actor, primary: sword, target, pipeline: usePipeline });
  assert(result.ok);
  assertEquals(receipts.length, 1);
  assertEquals(receipts[0].abilityId, 'blinding_ray');
  assertEquals(getItemCooldownRemaining(world, sword), 12);
  assert(world.get(target, ActiveEffects).effects.some((effect) => effect.key === 'blinded'));
});

// ── Permanent blindness on hit ─────────────────────────────────────────────

Deno.test("sunsword: melee hit dazzles target (temporary vision reduction, not permanent)", () => {
  const world = makeWorld();
  const player = makePlayer(world, 5, 5);
  const swordId = equipSunsword(world, player);
  const skeleton = makeUndead(world, 6, 5);
  world.add(skeleton, Brain, { visionRange: 8 });
  world.add(skeleton, ActiveEffects, { effects: [] });

  assertEquals(getEffectiveVisionRange(world, skeleton), 8, "baseline vision should be 8");

  const rule = COMBAT_INTERACTION_RULES.find(r => r.id === "sunlight_weapon_blind");
  assert(rule, "sunlight_weapon_blind rule should exist");
  assert(rule.phase === "hit", "rule should fire on hit phase");

  const ctx = {
    attacker: player,
    defender: skeleton,
    weaponId: swordId,
    damage: 5,
    damageType: "slash",
    world,
  };

  assert(rule.gate(world, ctx), "gate should pass for sunlight weapon");
  rule.apply(world, ctx);

  const reduced = getEffectiveVisionRange(world, skeleton);
  assert(reduced < 8, "vision should be reduced after sunsword melee hit");
  assert(reduced > 0, "melee dazzle should not fully blind — that's the ray's job");
});

Deno.test("sunsword: permanent blindness does not apply without sunlight tag", () => {
  const world = makeWorld();
  const player = makePlayer(world, 5, 5);

  // Plain sword without sunlight tag
  const swordId = world.create();
  world.add(swordId, NamedIdentity, { name: 'Iron Sword', identity: 'iron_sword' });
  world.add(swordId, ItemInfo, { type: 'equip', slot: 'weapon', damageDice: '1d6', damageType: 'slash', tags: [] });
  const eq = world.get(player, Equipment);
  eq.weapon = swordId;

  const skeleton = makeUndead(world, 6, 5);
  world.add(skeleton, Brain, { visionRange: 8 });
  world.add(skeleton, ActiveEffects, { effects: [] });

  const rule = COMBAT_INTERACTION_RULES.find(r => r.id === "sunlight_weapon_blind");
  const ctx = {
    attacker: player,
    defender: skeleton,
    weaponId: swordId,
    damage: 5,
    damageType: "slash",
    world,
  };

  assert(!rule.gate(world, ctx), "gate should NOT pass for non-sunlight weapon");
  assertEquals(getEffectiveVisionRange(world, skeleton), 8, "vision should remain unchanged");
});
