import "./helpers/installContentMonsters.mjs";
// tests/monsterVariety.test.mjs
// Verify new monster definitions, encounter groups, sentinel roll, and tier pools.

import { assert, assertEquals } from "jsr:@std/assert";
import { getMonstersByTier, getMonster, addGenocide, clearGenocides } from '../src/rules/data/monsters.js';
import { pickMonster, pickSentinelMonster, pickSpecificMonster, pickSpecificSpawner, pickEncounterGroup } from '../src/rules/environment/dungeon/tables.js';
import { createRng } from '../src/lib/ecs-js/rng.js';

// ── Tier pool size checks ───────────────────────────────────────────

Deno.test("tier 0 pool has at least 13 non-rare monsters", () => {
  const pool = getMonstersByTier(0);
  assert(pool.length >= 13, `tier 0 has ${pool.length} monsters, expected >= 13`);
});

Deno.test("tier 1 pool has at least 7 non-rare monsters (was 3 before expansion)", () => {
  const pool = getMonstersByTier(1);
  assert(pool.length >= 7, `tier 1 has ${pool.length} monsters, expected >= 7`);
});

Deno.test("tier 2 pool has at least 8 non-rare monsters", () => {
  const pool = getMonstersByTier(2);
  assert(pool.length >= 8, `tier 2 has ${pool.length} monsters, expected >= 8`);
});

// ── New monster definitions ─────────────────────────────────────────

const NEW_MONSTERS = [
  'goblin_archer', 'orc_shaman', 'hobgoblin', 'phase_spider',
  'wight', 'dark_acolyte', 'orc_warchief',
  'bandit', 'bandit_archer', 'dire_wolf', 'bandit_captain', 'acid_spitter',
];

for (const id of NEW_MONSTERS) {
  Deno.test(`monster '${id}' exists and has required fields`, () => {
    const def = getMonster(id);
    assert(def, `${id} not found in monster registry`);
    assert(typeof def.name === 'string', 'name');
    assert(typeof def.tier === 'number', 'tier');
    assert(typeof def.baseHp === 'number', 'baseHp');
    assert(typeof def.damageDice === 'string', 'damageDice');
    assert(typeof def.intelligence === 'number', 'intelligence');
    assert(typeof def.description === 'string', 'description');
    assert(Array.isArray(def.tags), 'tags');
  });
}

Deno.test("goblin_archer has ranged loadout options", () => {
  const def = getMonster('goblin_archer');
  assert(Array.isArray(def.equipped), "should define equipped loadout");
  // Bows can be plain strings (slot inferred from catalog) or objects
  const hasBarbed = def.equipped.some((e) => e === "goblin_barbed_shortbow" || e?.itemId === "goblin_barbed_shortbow");
  const hasBow = def.equipped.some((e) => e === "bow_short" || e?.itemId === "bow_short");
  const hasAmmo = def.equipped.some((e) => e === "ammo_arrows" || e?.itemId === "ammo_arrows");
  assert(hasBarbed, "should include barbed bow option");
  assert(hasBow, "should include plain bow option");
  assert(hasAmmo, "should include ammo");
});

Deno.test("bandit_archer has direct ranged loadout", () => {
  const def = getMonster('bandit_archer');
  assert(Array.isArray(def.equipped), "should define equipped loadout");
  const hasBow = def.equipped.some((e) => e === "bow_short" || e?.itemId === "bow_short");
  const hasAmmo = def.equipped.some((e) => e === "ammo_arrows" || e?.itemId === "ammo_arrows");
  assert(hasBow, "should include bow");
  assert(hasAmmo, "should include ammo");
});

Deno.test("goblin uses dedicated shiv loadout instead of direct onHit bleed hook", () => {
  const def = getMonster("goblin");
  assert(def, "goblin should exist");
  assert(Array.isArray(def.wielding) && def.wielding.length >= 2, "goblin should define wielding options");
  assert(Array.isArray(def.equipped) && def.equipped.length > 0, "goblin should define equipped options");
  assert(def.wielding.includes("goblin_jagged_shiv"), "goblin should include jagged shiv option");
  assert(def.wielding.includes("goblin_shiv"), "goblin should include plain shiv option");
  assert(!def.hooks || !Array.isArray(def.hooks.onHit) || def.hooks.onHit.length === 0, "goblin should not carry a direct onHit bleed hook");
});

Deno.test("humanoid elites use authored loadout weapons instead of direct onHit hooks", () => {
  const hobgoblin = getMonster("hobgoblin");
  assert(Array.isArray(hobgoblin?.wielding) && hobgoblin.wielding.includes("hobgoblin_serrated_warblade"));
  assert(!Array.isArray(hobgoblin?.hooks?.onHit) || hobgoblin.hooks.onHit.length === 0, "hobgoblin onHit should be weaponized");

  const ogre = getMonster("ogre");
  assert(Array.isArray(ogre?.wielding) && ogre.wielding.includes("ogre_crushing_club"));
  assert(!Array.isArray(ogre?.hooks?.onHit) || ogre.hooks.onHit.length === 0, "ogre onHit should be weaponized");

  const warchief = getMonster("orc_warchief");
  assert(Array.isArray(warchief?.wielding) && warchief.wielding.includes("orc_warchief_maul"));
  assert(Array.isArray(warchief?.equipped) && warchief.equipped.includes("chain_armor"), "warchief should carry armor loadout");
  assert(!Array.isArray(warchief?.hooks?.onHit) || warchief.hooks.onHit.length === 0, "warchief onHit should be weaponized");
});

Deno.test("orc_shaman has frost and heal spells", () => {
  const def = getMonster('orc_shaman');
  assert(Array.isArray(def.learnedSpellIds), 'should have learnedSpellIds');
  assert(def.learnedSpellIds.includes('frost'), 'should know frost');
  assert(def.learnedSpellIds.includes('heal'), 'should know heal');
  assert(def.maxMana > 0, 'should have mana pool');
});

Deno.test("dark_acolyte has agony and shadow_bolt spells", () => {
  const def = getMonster('dark_acolyte');
  assert(Array.isArray(def.learnedSpellIds), 'should have learnedSpellIds');
  assert(def.learnedSpellIds.includes('agony'), 'should know agony');
  assert(def.learnedSpellIds.includes('shadow_bolt'), 'should know shadow_bolt');
});

Deno.test("death_archer has telegraphed death_volley elite ability", () => {
  const def = getMonster("death_archer");
  assert(Array.isArray(def.learnedSpellIds), "should have learnedSpellIds");
  assert(def.learnedSpellIds.includes("death_volley"), "should know death_volley");
  assert(Array.isArray(def?.hooks?.whileLOS) && def.hooks.whileLOS.length > 0, "should have whileLOS hook(s)");
});

Deno.test("new immersive monsters expose intended role patterns", () => {
  const bandit = getMonster("bandit");
  assert(Array.isArray(bandit?.wielding) && bandit.wielding.length > 0, "bandit should wield basic weapons");
  assert(Array.isArray(bandit?.equipped) && bandit.equipped.length > 0, "bandit should also carry equipped loadout options");

  const direWolf = getMonster("dire_wolf");
  assert(Array.isArray(direWolf?.learnedSpellIds) && direWolf.learnedSpellIds.includes("wolf_howl"), "dire_wolf should know wolf_howl");

  const captain = getMonster("bandit_captain");
  assert(Array.isArray(captain?.learnedSpellIds) && captain.learnedSpellIds.includes("shield_bash"), "bandit_captain should know shield_bash");

  const spitter = getMonster("acid_spitter");
  assert(Array.isArray(spitter?.learnedSpellIds) && spitter.learnedSpellIds.includes("acid_spit"), "acid_spitter should know acid_spit");
});

Deno.test("boar has close-range bite ability alongside charge", () => {
  const boar = getMonster("boar");
  assert(Array.isArray(boar?.learnedSpellIds) && boar.learnedSpellIds.includes("charge"), "boar should keep charge ability");
  assert(Array.isArray(boar?.learnedSpellIds) && boar.learnedSpellIds.includes("boar_bite"), "boar should have close-range bite ability");
  assert(Array.isArray(boar?.hooks?.whileLOS) && boar.hooks.whileLOS.length > 0, "boar should drive abilities from LOS AI hooks");
});

Deno.test("hobgoblin carries both wielding and equipped loadout paths", () => {
  const hobgoblin = getMonster("hobgoblin");
  assert(Array.isArray(hobgoblin?.wielding) && hobgoblin.wielding.length > 0, "hobgoblin should have wielding pool");
  assert(Array.isArray(hobgoblin?.equipped) && hobgoblin.equipped.length > 0, "hobgoblin should have equipped pool");
});

Deno.test("flaming_bat is visually/ludically distinguished from bat baseline", () => {
  const def = getMonster("flaming_bat");
  assert(def, "flaming_bat should exist");
  assert(Array.isArray(def.tags) && def.tags.includes("burning"), "flaming_bat should project burning tag");
  assert(Array.isArray(def?.hooks?.onDeath) && def.hooks.onDeath.length > 0, "flaming_bat should have death hooks");
});

Deno.test("phase_spider has phaseOut and selfThrow hooks", () => {
  const def = getMonster('phase_spider');
  assert(def.hooks, 'should have hooks');
  assert(Array.isArray(def.hooks.onSeen), 'should have onSeen hooks');
  assert(Array.isArray(def.hooks.onDamaged), 'should have onDamaged hooks');
  assert(Array.isArray(def.hooks.onHit), 'should have onHit hooks');
});

// ── Sentinel roll ───────────────────────────────────────────────────

Deno.test("pickSentinelMonster is deterministic with same seed", () => {
  const rng1 = createRng(42);
  const rng2 = createRng(42);
  const m1 = pickSentinelMonster(rng1, 1);
  const m2 = pickSentinelMonster(rng2, 1);
  assertEquals(m1.identity, m2.identity, 'same seed should produce same monster');
});

Deno.test("filtered sentinel picks cannot escape an authored monster pool", () => {
  const ratOnly = (def) => def?.id === "rat";
  const rng = {
    next() { return 0; },
    choice(arr) { return arr[0]; },
  };
  const picked = pickSentinelMonster(rng, 1, ratOnly);
  assertEquals(picked.identity, "rat");
});

Deno.test("sentinel can produce tier-1 monsters on depth 1 (10% chance)", () => {
  // Run many seeds and check if any depth-1 pick produces a tier-1 monster.
  const tier1ids = new Set(getMonstersByTier(1).map(m => m.id));
  let gotSentinel = false;
  for (let seed = 1; seed <= 500; seed++) {
    const rng = createRng(seed);
    const m = pickSentinelMonster(rng, 1);
    if (tier1ids.has(m.identity)) {
      gotSentinel = true;
      break;
    }
  }
  assert(gotSentinel, 'expected at least one sentinel upgrade in 500 seeds');
});

Deno.test("bat is eligible in dungeon level 1 monster pool", () => {
  const rng = createRng(12345);
  const bat = pickMonster(rng, 1, (def) => def.id === "bat");
  assertEquals(bat.identity, "bat");
});

Deno.test("bat spawner uses moderate concurrency and limited total profile", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const rng = createRng(seed);
    const spawner = pickSpecificSpawner(rng, "bat", 1);
    assert(spawner, "bat spawner should be created");
    assert(spawner.maxConcurrent >= 2 && spawner.maxConcurrent <= 3, `maxConcurrent=${spawner.maxConcurrent}`);
    assert(spawner.packSize >= 3 && spawner.packSize <= 4, `packSize=${spawner.packSize}`);
  }
});

// ── Encounter groups ────────────────────────────────────────────────

Deno.test("pickEncounterGroup returns valid group for tier 0 with budget 3", () => {
  const rng = createRng(100);
  const group = pickEncounterGroup(rng, 1, 3);
  assert(group, 'should return a group');
  // Leader or followers should be present
  const total = (group.leader ? 1 : 0) + group.followers.length;
  assert(total >= 2, `expected >= 2 members, got ${total}`);
});

Deno.test("pickEncounterGroup returns null or valid for budget 1", () => {
  const rng = createRng(200);
  const group = pickEncounterGroup(rng, 1, 1);
  // Most groups need minBudget >= 2, so budget 1 should return null
  assertEquals(group, null, 'budget 1 should yield no group');
});

Deno.test("pickEncounterGroup works for each tier", () => {
  for (const [tier, depth] of [[0, 1], [1, 6], [2, 11], [3, 16]]) {
    let found = false;
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const group = pickEncounterGroup(rng, depth, 5);
      if (group) {
        found = true;
        assert(group.followers.length > 0 || group.leader, `tier ${tier} group should have members`);
        break;
      }
    }
    assert(found, `expected to find an encounter group for tier ${tier}`);
  }
});

function hasUtilityThreat(params) {
  const def = getMonster(String(params?.identity || ""));
  if (!def) return false;
  if (Array.isArray(def.tags) && def.tags.includes("caster")) return true;
  if (Array.isArray(def.learnedSpellIds) && def.learnedSpellIds.length > 0) return true;
  if (Array.isArray(def?.hooks?.whileLOS) && def.hooks.whileLOS.length > 0) return true;
  if (Array.isArray(def?.hooks?.onSeen) && def.hooks.onSeen.length > 0) return true;
  const id = String(def.id || "");
  return id === "phase_spider" || id === "wight" || id === "wraith" || id === "carrion_shade";
}

function hasPressureRole(params) {
  const def = getMonster(String(params?.identity || ""));
  if (!def) return false;
  const hasRangedKit = !!def.equipment?.ranged || (Array.isArray(def.equipped) && def.equipped.some((e) => String(e?.slot || "") === "ranged"));
  if (hasRangedKit) return true;
  return Number(def.attack || 0) >= 3;
}

Deno.test("tier 1+ encounter groups include both utility/control and pressure roles", () => {
  for (const depth of [6, 11, 16]) {
    for (let seed = 1; seed <= 120; seed++) {
      const rng = createRng((depth * 1000) + seed);
      const group = pickEncounterGroup(rng, depth, 5);
      assert(group, `expected group at depth ${depth}, seed ${seed}`);
      const members = [];
      if (group.leader) members.push(group.leader);
      for (const follower of group.followers) members.push(follower);
      assert(members.some(hasUtilityThreat), `expected utility/control role at depth ${depth}, seed ${seed}`);
      assert(members.some(hasPressureRole), `expected pressure role at depth ${depth}, seed ${seed}`);
    }
  }
});

Deno.test("encounter group respects genocide", () => {
  clearGenocides();
  addGenocide('goblin');
  const rng = createRng(300);
  // Try many seeds — groups with goblin followers should have them filtered
  for (let seed = 1; seed <= 50; seed++) {
    const r = createRng(seed);
    const group = pickEncounterGroup(r, 1, 5);
    if (group) {
      for (const f of group.followers) {
        assert(f.identity !== 'goblin', 'genocided goblin should not appear in followers');
      }
      if (group.leader) {
        assert(group.leader.identity !== 'goblin', 'genocided goblin should not appear as leader');
      }
    }
  }
  clearGenocides();
});

Deno.test("pickSpecificMonster returns null for genocided monster", () => {
  clearGenocides();
  addGenocide('orc_shaman');
  const result = pickSpecificMonster('orc_shaman', 6);
  assertEquals(result, null, 'genocided monster should return null');
  clearGenocides();
});
