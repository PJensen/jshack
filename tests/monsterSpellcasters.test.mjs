import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { AggroState, AGGRO_LEVELS } from "../src/rules/components/AggroState.js";
import { CastSpellIntent } from "../src/rules/components/Intents/CastSpellIntent.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Mana } from "../src/rules/components/Mana.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { getMonster } from "../src/rules/data/monsters.js";
import { SeenCallbackContext, castSpellOnLOS } from "../src/rules/data/callbacks/ai.js";
import { getSpell } from "../src/rules/data/spells.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { aiChaseSystem } from "../src/rules/systems/aiChaseSystem.js";
import { applyStatusEffect } from "../src/rules/utils/effects.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";

function loadFlatFloor() {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
}

Deno.test("new intelligent skeleton casters have spell loadouts", () => {
  const shadowCaster = getMonster("skeletal_shadow_caster");
  assert(shadowCaster, "skeletal_shadow_caster should exist");
  assertEquals(shadowCaster.tier, 1);
  assert((shadowCaster.intelligence || 0) >= 9, "shadow caster should be high-intelligence");
  assert(Array.isArray(shadowCaster.learnedSpellIds), "shadow caster should define learned spells");
  assert(shadowCaster.learnedSpellIds.includes("shadow_bolt"), "shadow caster should know shadow_bolt");

  const warlock = getMonster("skeletal_agony_warlock");
  assert(warlock, "skeletal_agony_warlock should exist");
  assert(warlock.tier >= 0, "warlock should have a valid tier");
  assert((warlock.intelligence || 0) >= 10, "warlock should be high-intelligence");
  assert(Array.isArray(warlock.learnedSpellIds), "warlock should define learned spells");
  assert(warlock.learnedSpellIds.includes("agony"), "warlock should know agony");
  assert(warlock.learnedSpellIds.includes("summon_skeleton"), "warlock should know summon_skeleton");
  assert((warlock.maxMana || 0) > 0, "warlock should have a mana pool");
  assert(!warlock.packSense, "warlock should aggro and cast while solo");
});

Deno.test("skeletal_agony_warlock acquires LOS aggro while solo", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0xA901 });

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 3, y: 3 });

    const warlock = world.create();
    world.add(warlock, NamedIdentity, { name: "Skeletal Agony Warlock", identity: "skeletal_agony_warlock" });
    world.add(warlock, Position, { x: 8, y: 3 });
    world.add(warlock, Faction, { key: "enemy" });
    world.add(warlock, Vitality, { hp: 24, maxHp: 24 });
    world.add(warlock, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0,
      lastKnownY: 0,
      searchTurnsLeft: 0,
      retreating: false,
    });

    aiChaseSystem(world);

    const aggro = world.get(warlock, AggroState);
    assertEquals(aggro?.alertLevel, AGGRO_LEVELS.hunting);
  } finally {
    clearAll();
  }
});

Deno.test("castSpellOnLOS queues cast intent and respects cooldown", () => {
  const world = new World({ seed: 0xA11CE });

  const actor = world.create();
  world.add(actor, Position, { x: 1, y: 1 });
  world.add(actor, Faction, { key: "enemy" });
  world.add(actor, Vitality, { hp: 20, maxHp: 20 });
  world.add(actor, Mana, { maxMana: 50, mana: 50, manaRegen: 0.2, regenCooldown: 0 });

  const target = world.create();
  world.add(target, Position, { x: 4, y: 1 });
  world.add(target, Faction, { key: "player" });
  world.add(target, Vitality, { hp: 20, maxHp: 20 });

  const callback = castSpellOnLOS({
    spellId: "shadow_bolt",
    minRange: 1,
    maxRange: 10,
    chance: 1,
    cooldownTurns: 5,
  });

  const ctx = new SeenCallbackContext(world, {
    actor,
    target,
    canActThisTurn: true,
    hasQueuedMove: false,
  });

  callback(ctx);
  assert(world.has(actor, CastSpellIntent), "callback should queue a cast intent");
  const cast = world.get(actor, CastSpellIntent);
  assertEquals(cast.spellId, "shadow_bolt");

  world.remove(actor, CastSpellIntent);
  callback(ctx);
  assert(!world.has(actor, CastSpellIntent), "cooldown should block immediate recast");
});

Deno.test("stasis blocks direct LOS ability callbacks before intent validation", () => {
  const world = new World({ seed: 0x57A515 });
  const windups = [];
  const casts = [];
  world.on("monster:ability:windup", (event) => windups.push(event));
  world.on("monster:ability:cast", (event) => casts.push(event));

  const actor = world.create();
  world.add(actor, Position, { x: 1, y: 1 });
  world.add(actor, Faction, { key: "enemy" });
  world.add(actor, Vitality, { hp: 20, maxHp: 20 });
  applyStatusEffect(world, actor, { key: "stasis", turnsLeft: 8 });

  const target = world.create();
  world.add(target, Position, { x: 4, y: 1 });
  world.add(target, Faction, { key: "player" });
  world.add(target, Vitality, { hp: 20, maxHp: 20 });

  const callback = castSpellOnLOS({
    spellId: "shadow_bolt",
    telegraphTurns: 1,
    minRange: 1,
    maxRange: 10,
    chance: 1,
  });
  callback(new SeenCallbackContext(world, {
    actor,
    target,
    canActThisTurn: true,
    hasQueuedMove: false,
  }));

  assertEquals(windups.length, 0);
  assertEquals(casts.length, 0);
  assert(!world.has(actor, CastSpellIntent));
});

Deno.test("skeletal_agony_warlock can queue cast at adjacent range", () => {
  const warlock = getMonster("skeletal_agony_warlock");
  assert(warlock, "warlock should exist");
  const agonyHook = warlock.hooks?.whileLOS?.[1];
  assert(typeof agonyHook === "function", "warlock agony hook should exist");

  const world = new World({ seed: 0xA61 });
  const actor = world.create();
  world.add(actor, Position, { x: 5, y: 5 });
  world.add(actor, Faction, { key: "enemy" });
  world.add(actor, Vitality, { hp: 20, maxHp: 20 });
  world.add(actor, Mana, { maxMana: 58, mana: 58, manaRegen: 0.2, regenCooldown: 0 });

  const target = world.create();
  world.add(target, Position, { x: 6, y: 5 });
  world.add(target, Faction, { key: "player" });
  world.add(target, Vitality, { hp: 20, maxHp: 20 });

  const ctx = new SeenCallbackContext(world, {
    actor,
    target,
    canActThisTurn: true,
    hasQueuedMove: false,
  });

  agonyHook(ctx);
  assert(world.has(actor, CastSpellIntent), "warlock should queue a cast intent at range 1");
});

Deno.test("enemy summon_skeleton creates hostile-faction summon", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0x5E11 });
    const actor = world.create();
    world.add(actor, Position, { x: 4, y: 4 });
    world.add(actor, Faction, { key: "enemy" });
    world.add(actor, Vitality, { hp: 20, maxHp: 20 });

    const spell = getSpell("summon_skeleton");
    runSpellScript(world, actor, spell, {});

    let summonedFaction = null;
    for (const [id, named, faction] of world.query(NamedIdentity, Faction)) {
      if (id === actor) continue;
      if (String(named.identity || "") !== "skeleton") continue;
      summonedFaction = String(faction.key || "");
      break;
    }

    assertEquals(summonedFaction, "enemy");
  } finally {
    clearAll();
  }
});
