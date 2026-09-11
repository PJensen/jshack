import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { AggroState, AGGRO_LEVELS } from "../src/rules/components/AggroState.js";
import { CastSpellIntent } from "../src/rules/components/Intents/CastSpellIntent.js";
import { Collider } from "../src/rules/components/Collider.js";
import { Faction } from "../src/rules/components/Faction.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { HazardArea } from "../src/rules/components/HazardArea.js";
import { KnockbackPending } from "../src/rules/components/KnockbackPending.js";
import { SeenCallbackContext, castSpellOnLOS } from "../src/rules/data/callbacks/ai.js";
import { CombatCallbackContext } from "../src/rules/data/callbacks/combat.js";
import { DeathCallbackContext } from "../src/rules/data/callbacks/death.js";
import { getMonster } from "../src/rules/data/monsters.js";
import { getSpell } from "../src/rules/data/spells.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { hazardSystem } from "../src/rules/systems/hazardSystem.js";
import { runCallbackList } from "../src/rules/interaction/dispatch.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";

function loadFlatFloor() {
  clearAll();
  loadChunk(0, 0, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
}

Deno.test("castSpellOnLOS supports telegraphed monster abilities", () => {
  const world = new World({ seed: 0xAB11 });
  const windups = [];
  const casts = [];
  world.on("monster:ability:windup", (ev) => windups.push(ev));
  world.on("monster:ability:cast", (ev) => casts.push(ev));

  const actor = world.create();
  world.add(actor, Position, { x: 1, y: 1 });
  world.add(actor, Faction, { key: "enemy" });
  world.add(actor, Vitality, { hp: 20, maxHp: 20 });

  const target = world.create();
  world.add(target, Position, { x: 4, y: 1 });
  world.add(target, Faction, { key: "player" });
  world.add(target, Vitality, { hp: 20, maxHp: 20 });

  const callback = castSpellOnLOS({
    spellId: "boar_charge",
    abilityId: "boar_charge",
    abilityName: "Charge",
    telegraphTurns: 1,
    minRange: 1,
    maxRange: 5,
    chance: 1,
    cooldownTurns: 2,
  });

  const ctx = new SeenCallbackContext(world, {
    actor,
    target,
    canActThisTurn: true,
    hasQueuedMove: false,
  });

  callback(ctx);
  assertEquals(windups.length, 1);
  assertEquals(casts.length, 0);
  assert(!world.has(actor, CastSpellIntent));

  world.step = (world.step | 0) + 1;
  callback(ctx);
  assert(world.has(actor, CastSpellIntent));
  assertEquals(casts.length, 1);
});

Deno.test("boar_charge rushes forward and resolves impact", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0xB04 });
    const actor = world.create();
    world.add(actor, Position, { x: 1, y: 5 });
    world.add(actor, Faction, { key: "enemy" });
    world.add(actor, Vitality, { hp: 24, maxHp: 24 });
    world.add(actor, Collider, { solid: true, blocksSight: false });

    const target = world.create();
    world.add(target, Position, { x: 5, y: 5 });
    world.add(target, Faction, { key: "player" });
    world.add(target, Vitality, { hp: 20, maxHp: 20 });
    world.add(target, Collider, { solid: true, blocksSight: false });

    const events = [];
    const thrown = [];
    world.on("spell:boar_charge", (ev) => events.push(ev));
    world.on("item:thrown", (ev) => thrown.push(ev));

    runSpellScript(world, actor, getSpell("boar_charge"), { targetId: target });

    const apos = world.get(actor, Position);
    assertEquals({ x: apos.x | 0, y: apos.y | 0 }, { x: 4, y: 5 });
    assertEquals(events.length, 1);
    assertEquals(events[0].targetId, target);
    assertEquals(thrown.length, 1, "charge should emit throw-style travel event for display animation");
    assertEquals(thrown[0]?.itemId, actor);
    assert(world.has(target, KnockbackPending), "charge contact should apply knockback pressure");
    const effects = world.get(target, ActiveEffects)?.effects || [];
    assert(effects.some((e) => String(e?.key || "") === "stun"), "charge contact should apply stun");
  } finally {
    clearAll();
  }
});

Deno.test("boar_bite is an active close-range ability that weakens on hit", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0xB17E });
    const boar = world.create();
    world.add(boar, Position, { x: 4, y: 4 });
    world.add(boar, Faction, { key: "enemy" });
    world.add(boar, Vitality, { hp: 18, maxHp: 18 });

    const target = world.create();
    world.add(target, Position, { x: 5, y: 4 });
    world.add(target, Faction, { key: "player" });
    world.add(target, Vitality, { hp: 20, maxHp: 20 });

    runSpellScript(world, boar, getSpell("boar_bite"), { targetId: target });

    assert(world.get(target, Vitality).hp < 20, "boar_bite should deal damage");
    const effects = world.get(target, ActiveEffects)?.effects || [];
    assert(effects.some((e) => String(e?.key || "") === "weakened"), "boar_bite should apply weakened");
  } finally {
    clearAll();
  }
});

Deno.test("rat_gnaw is an active close-range ability that applies bleed", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0x7a7 });
    const rat = world.create();
    world.add(rat, Position, { x: 4, y: 4 });
    world.add(rat, Faction, { key: "enemy" });
    world.add(rat, Vitality, { hp: 6, maxHp: 6 });

    const target = world.create();
    world.add(target, Position, { x: 5, y: 4 });
    world.add(target, Faction, { key: "player" });
    world.add(target, Vitality, { hp: 20, maxHp: 20 });

    runSpellScript(world, rat, getSpell("rat_gnaw"), { targetId: target });

    assert(world.get(target, Vitality).hp < 20, "rat_gnaw should deal damage");
    const effects = world.get(target, ActiveEffects)?.effects || [];
    assert(effects.some((e) => String(e?.key || "") === "bleed"), "rat_gnaw should apply bleed");
  } finally {
    clearAll();
  }
});

Deno.test("goblin_dirty_trick is an active close-range ability that blinds on hit", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0x60b11 });
    const goblin = world.create();
    world.add(goblin, Position, { x: 4, y: 4 });
    world.add(goblin, Faction, { key: "enemy" });
    world.add(goblin, Vitality, { hp: 8, maxHp: 8 });

    const target = world.create();
    world.add(target, Position, { x: 5, y: 4 });
    world.add(target, Faction, { key: "player" });
    world.add(target, Vitality, { hp: 20, maxHp: 20 });

    runSpellScript(world, goblin, getSpell("goblin_dirty_trick"), { targetId: target });

    assert(world.get(target, Vitality).hp < 20, "goblin_dirty_trick should deal damage");
    const effects = world.get(target, ActiveEffects)?.effects || [];
    assert(effects.some((e) => String(e?.key || "") === "blinded"), "goblin_dirty_trick should apply blinded");
  } finally {
    clearAll();
  }
});

Deno.test("snake_fang is an active close-range ability that applies poison", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0x5a9e });
    const snake = world.create();
    world.add(snake, Position, { x: 4, y: 4 });
    world.add(snake, Faction, { key: "enemy" });
    world.add(snake, Vitality, { hp: 6, maxHp: 6 });

    const target = world.create();
    world.add(target, Position, { x: 5, y: 4 });
    world.add(target, Faction, { key: "player" });
    world.add(target, Vitality, { hp: 20, maxHp: 20 });

    runSpellScript(world, snake, getSpell("snake_fang"), { targetId: target });

    assert(world.get(target, Vitality).hp < 20, "snake_fang should deal damage");
    const effects = world.get(target, ActiveEffects)?.effects || [];
    assert(effects.some((e) => String(e?.key || "") === "poison"), "snake_fang should apply poison");
  } finally {
    clearAll();
  }
});

Deno.test("spider_lunge is an active close-range ability that applies stagger", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0x5a1d });
    const spider = world.create();
    world.add(spider, Position, { x: 4, y: 4 });
    world.add(spider, Faction, { key: "enemy" });
    world.add(spider, Vitality, { hp: 6, maxHp: 6 });

    const target = world.create();
    world.add(target, Position, { x: 5, y: 4 });
    world.add(target, Faction, { key: "player" });
    world.add(target, Vitality, { hp: 20, maxHp: 20 });

    runSpellScript(world, spider, getSpell("spider_lunge"), { targetId: target });

    assert(world.get(target, Vitality).hp < 20, "spider_lunge should deal damage");
    const effects = world.get(target, ActiveEffects)?.effects || [];
    assert(effects.some((e) => String(e?.key || "") === "stagger"), "spider_lunge should apply stagger");
  } finally {
    clearAll();
  }
});

Deno.test("early tier-0 enemies expose active ability kits", () => {
  const rat = getMonster("rat");
  const goblin = getMonster("goblin");
  const snake = getMonster("snake");
  const spider = getMonster("spider");
  const caveSpider = getMonster("cave_spider");

  assert(Array.isArray(rat?.learnedSpellIds) && rat.learnedSpellIds.includes("rat_gnaw"), "rat should know rat_gnaw");
  assert(Array.isArray(goblin?.learnedSpellIds) && goblin.learnedSpellIds.includes("goblin_dirty_trick"), "goblin should know goblin_dirty_trick");
  assert(Array.isArray(snake?.learnedSpellIds) && snake.learnedSpellIds.includes("snake_fang"), "snake should know snake_fang");
  assert(Array.isArray(spider?.learnedSpellIds) && spider.learnedSpellIds.includes("web_spit"), "spider should know web_spit");
  assert(Array.isArray(caveSpider?.learnedSpellIds) && caveSpider.learnedSpellIds.includes("spider_lunge"), "cave_spider should know spider_lunge");
});

Deno.test("bat_shriek alerts nearby allies without confusing hostiles", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0xBA7 });

    const bat = world.create();
    world.add(bat, Position, { x: 5, y: 5 });
    world.add(bat, Faction, { key: "enemy" });
    world.add(bat, Vitality, { hp: 5, maxHp: 5 });

    const ally = world.create();
    world.add(ally, Position, { x: 7, y: 5 });
    world.add(ally, Faction, { key: "enemy" });
    world.add(ally, Vitality, { hp: 8, maxHp: 8 });
    world.add(ally, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0,
      lastKnownY: 0,
      searchTurnsLeft: 0,
      retreating: false,
    });

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 6, y: 5 });
    world.add(player, Faction, { key: "player" });
    world.add(player, Vitality, { hp: 20, maxHp: 20 });

    runSpellScript(world, bat, getSpell("bat_shriek"), {});

    const effects = world.get(player, ActiveEffects)?.effects || [];
    assert(!effects.some((e) => String(e?.key || "") === "confused"), "bat shriek should not confuse");
    assertEquals(world.get(ally, AggroState)?.alertLevel, AGGRO_LEVELS.alerted);
  } finally {
    clearAll();
  }
});

Deno.test("web_spit creates a web and applies slowed to the target", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0x5e8 });
    const spider = world.create();
    world.add(spider, Position, { x: 3, y: 3 });
    world.add(spider, Faction, { key: "enemy" });
    world.add(spider, Vitality, { hp: 6, maxHp: 6 });

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 6, y: 3 });
    world.add(player, Faction, { key: "player" });
    world.add(player, Vitality, { hp: 20, maxHp: 20 });

    runSpellScript(world, spider, getSpell("web_spit"), { targetId: player });

    let hasWeb = false;
    for (const [, pos, ni] of world.query(Position, NamedIdentity)) {
      if (String(ni?.identity || "") !== "web") continue;
      if ((pos.x | 0) === 6 && (pos.y | 0) === 3) {
        hasWeb = true;
        break;
      }
    }
    assert(hasWeb, "web_spit should place a web on target tile");
    const effects = world.get(player, ActiveEffects)?.effects || [];
    assert(
      effects.some((e) => String(e?.key || "") === "slowed" && Number(e?.turnsLeft || 0) >= 1),
      "web_spit should apply slowed to the struck target",
    );
  } finally {
    clearAll();
  }
});

Deno.test("death_volley damages target tile and adjacent tiles", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0x0d34 });
    const archer = world.create();
    world.add(archer, Position, { x: 2, y: 5 });
    world.add(archer, Faction, { key: "enemy" });
    world.add(archer, Vitality, { hp: 24, maxHp: 24 });

    const center = world.create();
    world.add(center, Position, { x: 7, y: 5 });
    world.add(center, Faction, { key: "player" });
    world.add(center, Vitality, { hp: 20, maxHp: 20 });

    const flank = world.create();
    world.add(flank, Position, { x: 7, y: 6 });
    world.add(flank, Faction, { key: "player" });
    world.add(flank, Vitality, { hp: 20, maxHp: 20 });

    const far = world.create();
    world.add(far, Position, { x: 10, y: 5 });
    world.add(far, Faction, { key: "player" });
    world.add(far, Vitality, { hp: 20, maxHp: 20 });

    runSpellScript(world, archer, getSpell("death_volley"), { targetId: center });

    assert(world.get(center, Vitality).hp < 20, "center target should take volley damage");
    assert(world.get(flank, Vitality).hp < 20, "adjacent target should take volley damage");
    assertEquals(world.get(far, Vitality).hp, 20, "out-of-pattern target should not be hit");
  } finally {
    clearAll();
  }
});

Deno.test("wolf_howl alerts nearby same-faction allies toward player", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0xA01F });

    const wolf = world.create();
    world.add(wolf, Position, { x: 5, y: 5 });
    world.add(wolf, Faction, { key: "enemy" });
    world.add(wolf, Vitality, { hp: 16, maxHp: 16 });

    const ally = world.create();
    world.add(ally, Position, { x: 7, y: 5 });
    world.add(ally, Faction, { key: "enemy" });
    world.add(ally, Vitality, { hp: 12, maxHp: 12 });
    world.add(ally, AggroState, {
      alertLevel: AGGRO_LEVELS.unaware,
      lastKnownX: 0,
      lastKnownY: 0,
      searchTurnsLeft: 0,
      retreating: false,
    });

    const farAlly = world.create();
    world.add(farAlly, Position, { x: 12, y: 5 });
    world.add(farAlly, Faction, { key: "enemy" });
    world.add(farAlly, Vitality, { hp: 12, maxHp: 12 });

    const player = world.create();
    world.add(player, Player);
    world.add(player, Position, { x: 8, y: 5 });
    world.add(player, Faction, { key: "player" });
    world.add(player, Vitality, { hp: 20, maxHp: 20 });

    runSpellScript(world, wolf, getSpell("wolf_howl"), {});

    const aggro = world.get(ally, AggroState);
    assertEquals(aggro?.alertLevel, AGGRO_LEVELS.hunting);
    assertEquals(aggro?.lastKnownX, 8);
    assertEquals(aggro?.lastKnownY, 5);
    const allyEffects = world.get(ally, ActiveEffects)?.effects || [];
    const rally = allyEffects.find((effect) => String(effect?.key || "") === "hastened");
    assert(rally && (rally.turnsLeft | 0) >= 5, "wolf_howl should hasten nearby same-faction allies");
    const farEffects = world.get(farAlly, ActiveEffects)?.effects || [];
    assert(!farEffects.some((effect) => String(effect?.key || "") === "hastened"), "wolf_howl should not reach beyond its aura radius");

    let auraId = 0;
    for (const [id, pos, hazard] of world.query(Position, HazardArea)) {
      if ((hazard?.sourceId | 0) !== wolf) continue;
      if (String(hazard?.kind || "") !== "ally_aura") continue;
      auraId = id;
      assertEquals({ x: pos.x | 0, y: pos.y | 0 }, { x: 5, y: 5 });
      assertEquals(hazard.radius | 0, 6);
      break;
    }
    assert(auraId > 0, "wolf_howl should leave a temporary ally aura field");

    const lateAlly = world.create();
    world.add(lateAlly, Position, { x: 6, y: 5 });
    world.add(lateAlly, Faction, { key: "enemy" });
    world.add(lateAlly, Vitality, { hp: 12, maxHp: 12 });
    hazardSystem(world);
    const lateEffects = world.get(lateAlly, ActiveEffects)?.effects || [];
    assert(lateEffects.some((effect) => String(effect?.key || "") === "hastened"), "ally aura should affect allies entering the field");
  } finally {
    clearAll();
  }
});

Deno.test("shield_bash hits adjacent target with stun and knockback", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0x5B45 });
    const actor = world.create();
    world.add(actor, Position, { x: 4, y: 4 });
    world.add(actor, Faction, { key: "enemy" });
    world.add(actor, Vitality, { hp: 18, maxHp: 18 });

    const target = world.create();
    world.add(target, Position, { x: 5, y: 4 });
    world.add(target, Faction, { key: "player" });
    world.add(target, Vitality, { hp: 20, maxHp: 20 });

    runSpellScript(world, actor, getSpell("shield_bash"), { targetId: target });

    assert(world.has(target, KnockbackPending), "shield_bash should queue knockback");
    const effects = world.get(target, ActiveEffects)?.effects || [];
    assert(effects.some((e) => String(e?.key || "") === "stun"), "shield_bash should apply stun");
  } finally {
    clearAll();
  }
});

Deno.test("acid_spit applies weakened and leaves acid hazard", () => {
  loadFlatFloor();
  try {
    const world = new World({ seed: 0xAC1D });
    const actor = world.create();
    world.add(actor, Position, { x: 2, y: 4 });
    world.add(actor, Faction, { key: "enemy" });
    world.add(actor, Vitality, { hp: 16, maxHp: 16 });

    const target = world.create();
    world.add(target, Position, { x: 6, y: 4 });
    world.add(target, Faction, { key: "player" });
    world.add(target, Vitality, { hp: 20, maxHp: 20 });

    runSpellScript(world, actor, getSpell("acid_spit"), { targetId: target });

    const effects = world.get(target, ActiveEffects)?.effects || [];
    assert(effects.some((e) => String(e?.key || "") === "weakened"), "acid_spit should apply weakened");

    let hazardFound = false;
    for (const [, pos, hazard] of world.query(Position, HazardArea)) {
      if ((pos.x | 0) !== 6 || (pos.y | 0) !== 4) continue;
      if (String(hazard?.kind || "") !== "acid") continue;
      hazardFound = true;
      break;
    }
    assert(hazardFound, "acid_spit should create an acid hazard at impact tile");
  } finally {
    clearAll();
  }
});

Deno.test("flaming_bat applies extra fire touch on hit", () => {
  const hooks = getMonster("flaming_bat")?.hooks?.onHit;
  assert(Array.isArray(hooks) && hooks.length > 0, "flaming_bat should define onHit hooks");

  const world = new World({ seed: 0xF1A6 });
  const attacker = world.create();
  world.add(attacker, Faction, { key: "enemy" });
  world.add(attacker, Position, { x: 1, y: 1 });
  world.add(attacker, Vitality, { hp: 8, maxHp: 8 });
  const defender = world.create();
  world.add(defender, Faction, { key: "player" });
  world.add(defender, Position, { x: 1, y: 2 });
  world.add(defender, Vitality, { hp: 12, maxHp: 12 });

  const frame = { attacker, defender, damage: 1 };
  runCallbackList(hooks, new CombatCallbackContext(world, frame));

  assert(world.get(defender, Vitality).hp < 12, "fire touch should deduct additional HP");
});

Deno.test("flaming_bat death spawns a small fire puff hazard", () => {
  const hooks = getMonster("flaming_bat")?.hooks?.onDeath;
  assert(Array.isArray(hooks) && hooks.length > 0, "flaming_bat should define onDeath hooks");

  const world = new World({ seed: 0xF1A7 });
  const deadId = world.create();
  world.add(deadId, Position, { x: 8, y: 4 });

  const ctx = new DeathCallbackContext(world, {
    deadId,
    killer: 0,
    cause: "test",
    identity: "flaming_bat",
    pos: { x: 8, y: 4 },
  });
  runCallbackList(hooks, ctx);

  let found = false;
  for (const [, pos, hazard] of world.query(Position, HazardArea)) {
    if ((pos.x | 0) !== 8 || (pos.y | 0) !== 4) continue;
    if (String(hazard?.kind || "") !== "fire") continue;
    if ((hazard?.radius | 0) !== 0) continue;
    found = true;
    break;
  }
  assert(found, "death hook should spawn a local fire hazard");
});
