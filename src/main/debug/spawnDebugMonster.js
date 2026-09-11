// Debug spawning is also reachable from isolated UI/console wiring. Load the
// authored monster barrel here so that path cannot observe the pre-content
// registry if bootstrap ordering changes.
import "../../content/monsters/index.js";
import { getMonster, resolveMonsterMaxHp } from "../../rules/data/monsters.js";
import { creatureTypeFromTags } from "../../rules/components/CreatureType.js";
import { applyMutation } from "../../rules/interaction/mutations.js";
import { findNearestValidTileAround, playerEntity } from "../../rules/utils/queries.js";
import { spawnCentipede } from "../../rules/utils/spawnCentipede.js";
import { createRng } from "../../rules/utils/rng.js";
import { DungeonState } from "../../rules/components/DungeonState.js";

/**
 * Spawn a debug monster on the nearest open tile around the player.
 *
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {string} monsterId
 * @returns {{ ok: true, monsterId: string, name: string, x: number, y: number } | { ok: false, error: string }}
 */
export function spawnDebugMonsterNearPlayer(world, monsterId) {
  const id = String(monsterId || "").trim();
  if (!id) return { ok: false, error: "Missing monster id." };

  const def = getMonster(id);
  if (!def) return { ok: false, error: `Unknown monster: "${id}"` };

  const pe = playerEntity(world);
  if (!pe) return { ok: false, error: "No player entity found." };

  const spawnAt = findNearestValidTileAround(world, pe.pos, {
    maxDistance: 2,
    exclude: [pe.pos],
  });
  if (!spawnAt) return { ok: false, error: "No open tile near player." };

  // Multi-segment centipede needs its own spawn path
  if (id === 'centipede') {
    let depth = 1;
    for (const [, ds] of world.query(DungeonState)) {
      depth = ds.depth || 1;
      break;
    }
    const params = {
      name: def.name,
      identity: def.id,
      maxHp: resolveMonsterMaxHp(def, depth),
      faction: 'enemy',
      accuracyDerived: def.attack,
      damagePowerDerived: def.attack,
      evadeDerived: def.defense,
      naturalDamageDice: def.damageDice,
      sizeClass: def.sizeClass,
      massKg: def.massKg,
      resistances: def.resistances,
      speed: def.speed,
      creatureType: creatureTypeFromTags(def.tags || []),
    };
    const segMin = def.segmentCount?.min ?? 4;
    const segMax = def.segmentCount?.max ?? 7;
    const seed = ((world.seed >>> 0) ^ ((spawnAt.x * 0x45d9f3b) >>> 0) ^ ((spawnAt.y * 0x119de1f3) >>> 0)) >>> 0;
    const rng = createRng(seed);
    const segCount = segMin + Math.floor(rng.next() * (segMax - segMin + 1));
    spawnCentipede(world, params, spawnAt.x, spawnAt.y, segCount, rng);
    return {
      ok: true,
      monsterId: id,
      name: String(def.name || id),
      x: spawnAt.x,
      y: spawnAt.y,
    };
  }

  applyMutation(world, {
    type: "spawnMonster",
    monsterId: id,
    x: spawnAt.x,
    y: spawnAt.y,
    emitEvent: true,
  }, { getMonster });

  return {
    ok: true,
    monsterId: id,
    name: String(def.name || id),
    x: spawnAt.x,
    y: spawnAt.y,
  };
}
