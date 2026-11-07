// src/rules/ai/policyFeatures.js
// Extract the 20-float feature vector that drives the neural policy.
// Used by aiPolicySystem (in-game) and tools/trainAI.js (training harness).
//
// Feature index reference:
//   0  dist/20             distance to target, clamped 0-1
//   1  dx/20               signed x-offset, clamped ±1
//   2  dy/20               signed y-offset, clamped ±1
//   3  myHpRatio           own HP / maxHP
//   4  targetHpRatio       target HP / maxHP
//   5  manaRatio           own mana / maxMana (0 if no Mana component)
//   6  isRetreating        1 if aggro.retreating
//   7  numAllies/5         nearby enemy-faction allies, clamped 0-1
//   8  spell0Ready         1 if learnedSpells[0] is off-cooldown and mana ok
//   9  spell1Ready         1 if learnedSpells[1] is off-cooldown and mana ok
//  10  spell2Ready         1 if learnedSpells[2] is off-cooldown and mana ok
//  11  spell3Ready         1 if learnedSpells[3] is off-cooldown and mana ok
//  12  hasRangedWeapon     1 if ranged + ammo equipped
//  13  corridorFactor      walkable cardinal neighbors / 4 (0 = boxed in)
//  14  depth/15            dungeon depth, clamped 0-1
//  15  intel/10            own intelligence tier
//  16  targetHasBadStatus  1 if target has burn/stun/frozen
//  17  adjacent            1 if dist ≤ 1
//  18  farAway             1 if dist > 6
//  19  criticalHp          1 if own HP ratio < 0.3

export const FEATURE_DIM = 20;

// Shared cooldown key with castSpellOnLOS so we can read its cooldown state.
const SPELL_CAST_COOLDOWN_KEY = Symbol.for("jshack:ai:castSpellOnLOS:cooldown");

import { Vitality }    from '../components/Vitality.js';
import { Brain }       from '../components/Brain.js';
import { AggroState }  from '../components/AggroState.js';
import { Equipment }   from '../components/Equipment.js';
import { Mana }        from '../components/Mana.js';
import { Faction }     from '../components/Faction.js';
import { DungeonState } from '../components/DungeonState.js';
import { isAiOnCooldown } from '../utils/aiCooldowns.js';
import { forEachInRadius } from '../utils/spatialIndex.js';
import { isWalkable } from '../environment/dungeon/tileMap.js';
import { chebyshevScalar } from '../utils/distance.js';
import { effectStrength, statusStrength } from '../utils/statusFacade.js';

function spellCooldownSlot(actorId, spellId) {
  return `${actorId | 0}:${String(spellId || '')}`;
}

function isSpellReady(world, actorId, spellId) {
  return !isAiOnCooldown(world, SPELL_CAST_COOLDOWN_KEY, spellCooldownSlot(actorId, spellId));
}

// Rough mana threshold — most offensive spells cost ~8-15 mana.
const MIN_CAST_MANA = 8;

function hasManaForSpell(world, actorId) {
  const mana = world.get(actorId, Mana);
  if (!mana) return true; // no mana pool = not a caster, spell flags won't fire anyway
  return mana.mana >= MIN_CAST_MANA;
}

const CARDINAL_OFFSETS = [[-1,0],[1,0],[0,-1],[0,1]];

/**
 * Extract a 20-float feature vector for `actorId` targeting `targetId`.
 *
 * @param {any} world
 * @param {number} actorId
 * @param {{x:number,y:number}} actorPos
 * @param {number} targetId
 * @param {{x:number,y:number}} targetPos
 * @returns {Float64Array}
 */
export function extractFeatures(world, actorId, actorPos, targetId, targetPos) {
  const feat = new Float64Array(FEATURE_DIM);

  const ax = actorPos.x | 0;
  const ay = actorPos.y | 0;
  const tx = targetPos.x | 0;
  const ty = targetPos.y | 0;

  const dx   = tx - ax;
  const dy   = ty - ay;
  const dist = chebyshevScalar(ax, ay, tx, ty);

  // ── Brain / spells ─────────────────────────────────────────────────────────
  const brain        = world.get(actorId, Brain);
  const intel        = Number(brain?.intelligence ?? 10);
  const learnedSpells = Array.isArray(brain?.learnedSpellIds) ? brain.learnedSpellIds : [];

  // ── Health ──────────────────────────────────────────────────────────────────
  const myVit    = world.get(actorId, Vitality);
  const myHp     = myVit ? myVit.hp     : 1;
  const myMaxHp  = myVit ? Math.max(1, myVit.maxHp) : 1;

  const theirVit   = world.get(targetId, Vitality);
  const theirHp    = theirVit ? theirVit.hp    : 1;
  const theirMaxHp = theirVit ? Math.max(1, theirVit.maxHp) : 1;

  // ── Mana ────────────────────────────────────────────────────────────────────
  const myMana  = world.get(actorId, Mana);
  const manaRat = myMana ? myMana.mana / Math.max(1, myMana.maxMana) : 0;

  // ── Aggro / retreat ─────────────────────────────────────────────────────────
  const aggro       = world.get(actorId, AggroState);
  const isRetreating = aggro?.retreating ? 1 : 0;

  // ── Nearby allies (enemy-faction entities within 8 tiles) ──────────────────
  let numAllies = 0;
  forEachInRadius(world, ax, ay, 8, (id) => {
    if (id === actorId) return;
    const fac = world.get(id, Faction);
    if (fac?.key === 'enemy') numAllies++;
  });

  // ── Terrain density (open / corridor) ──────────────────────────────────────
  let walkableCardinals = 0;
  for (const [cx, cy] of CARDINAL_OFFSETS) {
    try { if (isWalkable(ax + cx, ay + cy)) walkableCardinals++; } catch { walkableCardinals++; }
  }
  const corridorFactor = walkableCardinals / 4;

  // ── Spell readiness ─────────────────────────────────────────────────────────
  const manaOk = hasManaForSpell(world, actorId);
  function spellReady(idx) {
    const id = learnedSpells[idx];
    if (!id) return 0;
    return (manaOk && isSpellReady(world, actorId, id)) ? 1 : 0;
  }

  // ── Ranged weapon ───────────────────────────────────────────────────────────
  const eq        = world.get(actorId, Equipment);
  const hasRanged = (eq?.ranged && world.isAlive?.(eq.ranged) && eq.ammo && world.isAlive?.(eq.ammo)) ? 1 : 0;

  // ── Dungeon depth ───────────────────────────────────────────────────────────
  let depth = 1;
  for (const [, ds] of world.query(DungeonState)) {
    if (ds) { depth = Number(ds.currentDepth || 1); break; }
  }

  // ── Target status effects ───────────────────────────────────────────────────
  const targetHasBadStatus = (
    statusStrength(world, targetId, 'burning') > 0 ||
    statusStrength(world, targetId, 'stun')    > 0 ||
    statusStrength(world, targetId, 'frozen') + effectStrength(world, targetId, 'frost_nova') > 0
  ) ? 1 : 0;

  // ── Pack feature vector ─────────────────────────────────────────────────────
  feat[0]  = Math.min(1, dist / 20);
  feat[1]  = Math.max(-1, Math.min(1, dx / 20));
  feat[2]  = Math.max(-1, Math.min(1, dy / 20));
  feat[3]  = myHp / myMaxHp;
  feat[4]  = theirHp / theirMaxHp;
  feat[5]  = manaRat;
  feat[6]  = isRetreating;
  feat[7]  = Math.min(1, numAllies / 5);
  feat[8]  = spellReady(0);
  feat[9]  = spellReady(1);
  feat[10] = spellReady(2);
  feat[11] = spellReady(3);
  feat[12] = hasRanged;
  feat[13] = corridorFactor;
  feat[14] = Math.min(1, depth / 15);
  feat[15] = intel / 10;
  feat[16] = targetHasBadStatus;
  feat[17] = dist <= 1 ? 1 : 0;
  feat[18] = dist > 6  ? 1 : 0;
  feat[19] = (myHp / myMaxHp) < 0.3 ? 1 : 0;

  return feat;
}
