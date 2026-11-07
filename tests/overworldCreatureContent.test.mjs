import "./helpers/installContentMonsters.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { Faction } from "../src/rules/components/Faction.js";
import { Position } from "../src/rules/components/Position.js";
import { Vitality } from "../src/rules/components/Vitality.js";
import { getMonster } from "../src/rules/data/monsters.js";
import { SPELL_DEFS } from "../src/rules/data/spells.js";
import { pickMonster } from "../src/rules/environment/dungeon/tables.js";
import { CombatCallbackContext, sandBurrowOnDamaged } from "../src/rules/data/callbacks/combat.js";
import { runCallbackList } from "../src/rules/interaction/dispatch.js";
import { runSpellScript } from "../src/rules/scripts/spells.js";
import { createRng } from "../src/lib/ecs-js/rng.js";
import { CHUNK_SIZE, TILE_FLOOR } from "../src/rules/environment/dungeon/constants.js";
import { clearAll, loadChunk } from "../src/rules/environment/dungeon/tileMap.js";

function setupFloorTiles() {
  clearAll();
  const tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR);
  loadChunk(0, 0, tiles);
}

function makeActor(world, faction, x, y, hp = 30) {
  const id = world.create();
  world.add(id, Position, { x, y });
  world.add(id, Faction, { key: faction });
  world.add(id, Vitality, { maxHp: hp, hp });
  world.add(id, ActiveEffects, { effects: [] });
  return id;
}

Deno.test("giant frog uses poison_spit instead of acid_spit", () => {
  const frog = getMonster("giant_frog");
  assert(frog, "giant_frog should exist");
  assert(Array.isArray(frog.learnedSpellIds), "giant_frog should define learned spells");
  assert(frog.learnedSpellIds.includes("poison_spit"), "giant_frog should know poison_spit");
  assert(!frog.learnedSpellIds.includes("acid_spit"), "giant_frog should not reuse acid_spit");
});

Deno.test("marsh witch uses bog_curse instead of agony", () => {
  const witch = getMonster("marsh_witch");
  assert(witch, "marsh_witch should exist");
  assert(Array.isArray(witch.learnedSpellIds), "marsh_witch should define learned spells");
  assert(witch.learnedSpellIds.includes("bog_curse"), "marsh_witch should know bog_curse");
  assert(!witch.learnedSpellIds.includes("agony"), "marsh_witch should not reuse agony");
});

Deno.test("random dungeon monster picks exclude overworld-only creatures", () => {
  for (let seed = 0; seed < 256; seed++) {
    for (const depth of [1, 3, 5, 8, 12]) {
      const picked = pickMonster(createRng(seed), depth);
      const def = getMonster(picked.identity);
      assert(!def?.tags?.includes("overworld"), `${picked.identity} should not be picked for dungeon depth ${depth}`);
    }
  }
});

Deno.test("sand crab shell-up is custom and does not phase out", () => {
  const world = new World({ seed: 91 });
  const attacker = world.create();
  const defender = world.create();
  world.add(defender, Vitality, { maxHp: 20, hp: 10 });

  let payload = null;
  world.on("proc:sand_burrow", (evt) => { payload = evt; });

  const frame = {
    attacker,
    defender,
    damage: 6,
    heal(entity, amount) {
      const vit = world.get(entity, Vitality);
      vit.hp = Math.min(vit.maxHp, vit.hp + Math.max(0, amount | 0));
    },
  };
  const ctx = new CombatCallbackContext(world, frame);
  let tailRan = false;
  runCallbackList([
    sandBurrowOnDamaged(100, 0xdead0710),
    () => { tailRan = true; },
  ], ctx);

  assertEquals(world.get(defender, Vitality).hp, 13);
  assertEquals(ctx.cancelled, false);
  assertEquals(tailRan, true);
  assert(payload && payload.actor === defender && payload.attacker === attacker && payload.amount === 3);

  const effects = world.get(defender, ActiveEffects)?.effects || [];
  assert(effects.some((e) => e.key === "stoneskin"), "sand burrow should add stoneskin");
  assert(effects.some((e) => e.key === "rooted"), "sand burrow should root the crab briefly");
  assert(!effects.some((e) => e.key === "invulnerable"), "sand burrow should not be phase-style invulnerability");
});

Deno.test("poison_spit applies poison instead of weakened acid", () => {
  setupFloorTiles();
  const world = new World({ seed: 92 });
  const frog = makeActor(world, "enemy", 4, 4);
  const player = makeActor(world, "player", 7, 4);

  runSpellScript(world, frog, SPELL_DEFS.poison_spit, { targetId: player, x: 7, y: 4 });

  const effects = world.get(player, ActiveEffects)?.effects || [];
  assert(effects.some((e) => e.key === "poison"), "poison_spit should poison its target");
  assert(!effects.some((e) => e.key === "weakened"), "poison_spit should not reuse acid_spit's weakened payload");
});

Deno.test("bog_curse applies one authored effect identity", () => {
  setupFloorTiles();
  const world = new World({ seed: 93 });
  const witch = makeActor(world, "enemy", 4, 4);
  const player = makeActor(world, "player", 7, 4);

  runSpellScript(world, witch, SPELL_DEFS.bog_curse, { targetId: player, x: 7, y: 4 });

  const effects = world.get(player, ActiveEffects)?.effects || [];
  assert(effects.some((e) => e.key === "bog_curse"), "bog_curse should apply its authored effect");
  assert(!effects.some((e) => e.key === "cursed"), "bog_curse should not project cursed");
  assert(!effects.some((e) => e.key === "slowed"), "bog_curse should not project slowed");
});
