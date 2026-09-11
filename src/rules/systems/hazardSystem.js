import { HazardArea } from "../components/HazardArea.js";
import { PlasmaCloud } from "../components/PlasmaCloud.js";
import { Position } from "../components/Position.js";
import { Vitality } from "../components/Vitality.js";
import { applyHealing } from "../utils/applyHealing.js";
import { Flying } from "../components/Flying.js";
import { Pet } from "../components/Pet.js";
import { Player } from "../components/Player.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { Equipment, NON_AMMO_GEAR_SLOTS } from "../components/Equipment.js";
import { Burned } from "../components/Burned.js";
import { Collider } from "../components/Collider.js";
import { Interactable } from "../components/Interactable.js";
import { Material } from "../components/Material.js";
import { DungeonState } from "../components/DungeonState.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { CreatureType, CREATURE_TYPES } from "../components/CreatureType.js";
import {
  TILE_DOOR,
  TILE_FENCE,
  TILE_FLOOR,
  TILE_GRASS,
  TILE_TREE,
  TILE_WALL,
} from "../environment/dungeon/constants.js";
import { getTile, isRoofed, setTile } from "../environment/dungeon/tileMap.js";
import { dealDamage } from "../utils/dealDamage.js";
import { createFrom } from "../../lib/ecs-js/archetype.js";
import { Ashes } from "../archetypes/Items.js";
import { spawnHazard } from "../utils/hazardSpawn.js";
import {
  getDestroyedTileRecord,
  markDestroyedTile,
  ROOF_BURN_TURNS,
  tickDestroyedTileLedger,
} from "../utils/destroyedTiles.js";
import { clamp01Or, clampInt } from "../utils/numberCoerce.js";
import { applyMaterialStimulus } from "../utils/materialStimulus.js";
import { applyMaterialTransform, resolveMaterialTransform } from "../utils/materialTransforms.js";
import { upsertTimedEffect } from "../utils/effectSemantics.js";
import { applyAuraFieldPulse } from "../utils/auraFields.js";

const DEFAULT_TURNS = 3;
const DEFAULT_RADIUS = 1;
const DEFAULT_TICK_DAMAGE = 0;
const DEFAULT_FIRE_SPREAD_CHANCE = 0.25;
const WEB_FIRE_SPREAD_CHANCE = 0.53;
const WEB_IDENTITY = "web";
const DEFAULT_FIRE_SPREAD_TURNS = 2;
const NEIGHBOR_OFFSETS = Object.freeze([
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
]);

function isOverworld(world) {
  for (const [, ds] of world.query(DungeonState)) {
    return ds.currentDepth === 0 || ds.profileType === "overworld";
  }
  return false;
}

function getBurnedTileReplacement(tile, overworld) {
  if (tile === TILE_TREE) return TILE_GRASS;
  if (!overworld) return null;
  if (tile === TILE_FENCE) return TILE_GRASS;
  if (tile === TILE_DOOR) return TILE_FLOOR;
  if (tile === TILE_WALL) return TILE_FLOOR;
  return null;
}

function burnedTileKind(tile) {
  if (tile === TILE_TREE) return "tree";
  if (tile === TILE_FENCE) return "fence";
  if (tile === TILE_DOOR) return "door";
  if (tile === TILE_WALL) return "wall";
  return "terrain";
}

function isRoofBearingBurn(tile) {
  return tile === TILE_WALL || tile === TILE_DOOR;
}

function isRoofFuelTile(world, x, y, tile, overworld) {
  if (!overworld) return false;
  if (tile !== TILE_FLOOR) return false;
  if (!isRoofed(x, y)) return false;
  return !getDestroyedTileRecord(world, x, y);
}

function isFlammableFireSpreadTile(world, x, y, tile, overworld) {
  if (tile === TILE_TREE) return true;
  if (!overworld) return false;
  if (isRoofFuelTile(world, x, y, tile, overworld)) return true;
  return tile === TILE_FENCE || tile === TILE_DOOR || tile === TILE_WALL;
}

function burnFlammableEntitiesAt(world, x, y, source, hazardId, cause, sourceId, sourceKind) {
  for (const [id, pos, mat] of world.query(Position, Material)) {
    if (!pos || !mat) continue;
    if ((pos.x | 0) !== (x | 0) || (pos.y | 0) !== (y | 0)) continue;
    if (world.has(id, Vitality)) continue;
    if (world.has(id, Burned)) continue;
    const ident = world.get(id, NamedIdentity);
    const isWeb = String(ident?.identity || "").toLowerCase() === WEB_IDENTITY;
    const stimulus = applyMaterialStimulus(world, id, {
      kind: "fire",
      mode: "hazard_contact",
      intensity: 3,
      duration: 1,
    });
    const transform = resolveMaterialTransform({
      stimulusKind: "fire",
      requestedTransform: "ash",
      identity: String(ident?.identity || ""),
      state: stimulus?.state,
    });
    if (!isWeb && transform !== "ash") continue;
    try {
      world.emit?.("entity:burned", {
        actor: source,
        hazardId,
        entityId: id,
        x: x | 0,
        y: y | 0,
        cause,
        sourceId,
        sourceKind,
        identity: String(ident?.identity || ""),
        name: String(ident?.name || ""),
        material: String(mat.kind || ""),
      });
    } catch { /* */ }
    if (world.has(id, ItemInfo)) {
      try { applyMaterialTransform(world, id, "ash"); } catch { /* */ }
    } else {
      try {
        const ashId = createFrom(world, Ashes, {});
        world.add(ashId, Position, { x: x | 0, y: y | 0 });
      } catch { /* */ }
    }
    try {
      world.add(id, Burned, {
        atTurn: world.step | 0,
        cause,
        sourceId,
        sourceKind,
        smokeTurnsLeft: 6,
      });
    } catch { /* */ }
    try { if (world.has(id, Collider)) world.remove(id, Collider); } catch { /* */ }
    try { if (world.has(id, Interactable)) world.remove(id, Interactable); } catch { /* */ }
  }
}

function clampChance(value, fallback) {
  return clamp01Or(value, fallback);
}

function getFireSpreadChance(hazard) {
  return clampChance(hazard?.meta?.fireSpreadChance, DEFAULT_FIRE_SPREAD_CHANCE);
}

function getFireSpreadTurns(hazard, turnsBefore) {
  return clampInt(hazard?.meta?.fireSpreadTurns, Math.max(1, turnsBefore - 1), 1);
}

function hasEquippedTorch(world, actorId) {
  const eq = world.get(actorId, Equipment);
  if (!eq) return false;
  for (let i = 0; i < NON_AMMO_GEAR_SLOTS.length; i++) {
    const itemId = Number(eq[NON_AMMO_GEAR_SLOTS[i]] || 0) | 0;
    if (!(itemId > 0)) continue;
    const info = world.get(itemId, ItemInfo);
    if (String(info?.id || "") === "torch") return true;
  }
  return false;
}

function hazardMetric(hazard, identity) {
  const metric = String(hazard?.meta?.distanceMetric || "").toLowerCase();
  if (metric === "euclidean") return "euclidean";
  if (String(identity || "") === "explosive_gas") return "euclidean";
  return "chebyshev";
}

function inHazardRadius(x, y, cx, cy, radius, metric) {
  const dx = Math.abs((x | 0) - (cx | 0));
  const dy = Math.abs((y | 0) - (cy | 0));
  if (metric === "euclidean") return (dx * dx + dy * dy) <= (radius * radius);
  return Math.max(dx, dy) <= radius;
}

function hasBurningEffect(effects) {
  if (!effects || !Array.isArray(effects.effects)) return false;
  for (let i = 0; i < effects.effects.length; i++) {
    const key = String(effects.effects[i]?.key || "").toLowerCase();
    if (key === "burn" || key === "burning") return true;
  }
  return false;
}

function ensureActiveEffectRecord(world, entityId) {
  let ae = /** @type any */ (world.get(entityId, ActiveEffects));
  if (!ae) {
    try { world.add(entityId, ActiveEffects, { effects: [] }); } catch { /* */ }
    ae = /** @type any */ (world.get(entityId, ActiveEffects));
  }
  if (!ae || !Array.isArray(ae.effects)) return null;
  return ae;
}

function applyStickySyrup(world, entityId, sourceId, turnsLeft, potency) {
  const ae = ensureActiveEffectRecord(world, entityId);
  if (!ae) return false;
  upsertTimedEffect(ae.effects, {
    key: "slowed",
    turnsLeft,
    potency,
    stacks: 1,
    sourceId,
    startedAtTurn: world.step | 0,
  });
  return true;
}

function gasHazardShouldIgnite(world, x, y, radius, metric) {
  const gasRadius = Math.max(0, radius | 0);
  for (const [, firePos, fireHazard] of world.query(Position, HazardArea)) {
    if (!firePos || !fireHazard) continue;
    if (String(fireHazard.kind || "").toLowerCase() !== "fire") continue;
    if ((Number(fireHazard.turnsLeft || 0) | 0) <= 0) continue;
    const fireRadius = clampInt(fireHazard.radius, 0, 0);
    if (inHazardRadius(firePos.x, firePos.y, x, y, gasRadius + fireRadius + 1, metric)) return true;
  }
  for (const [, actorPos, effects] of world.query(Position, ActiveEffects)) {
    if (!actorPos || !hasBurningEffect(effects)) continue;
    if (inHazardRadius(actorPos.x, actorPos.y, x, y, gasRadius, metric)) return true;
  }
  for (const [actorId, actorPos] of world.query(Position, Equipment)) {
    if (!actorPos) continue;
    if (!hasEquippedTorch(world, actorId)) continue;
    if (inHazardRadius(actorPos.x, actorPos.y, x, y, gasRadius, metric)) return true;
  }
  return false;
}

/**
 * Generic hazard resolver for persistent AoE entities.
 * `medium` is metadata only for now (`air` vs `floor`).
 *
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function hazardSystem(world) {
  const overworld = isOverworld(world);
  tickDestroyedTileLedger(world);
  /** @type {Set<string>|null} */
  let unburnedWebCells = null;
  const fireHazardCells = new Set();
  for (const [, pos, hazard] of world.query(Position, HazardArea)) {
    if (!pos || !hazard) continue;
    if (String(hazard.kind || "generic").toLowerCase() !== "fire") continue;
    if (String(hazard.medium || "air").toLowerCase() !== "floor") continue;
    fireHazardCells.add(`${pos.x | 0},${pos.y | 0}`);
  }

  /** @type {Array<{ x:number, y:number, turnsLeft:number, tickDamage:number, damageType:string, cause:string, sourceId:number, sourceKind:string, meta:Record<string, unknown>|null }>} */
  const pendingFireSpreads = [];
  /** @type {Array<{ x:number, y:number, radius:number, turnsLeft:number, tickDamage:number, cause:string, sourceId:number, sourceKind:string, identity:string, meta:Record<string, unknown>|null }>} */
  const pendingGasIgnitions = [];

  for (const [hazardId, pos, hazard] of world.query(Position, HazardArea)) {
    if (!pos || !hazard) continue;

    const kind = String(hazard.kind || "generic").toLowerCase() || "generic";
    const medium = String(hazard.medium || "air").toLowerCase() === "floor" ? "floor" : "air";
    const radius = clampInt(hazard.radius, DEFAULT_RADIUS, 0);
    const tickDamage = clampInt(hazard.tickDamage, DEFAULT_TICK_DAMAGE, 0);
    const turnsBefore = clampInt(hazard.turnsLeft, DEFAULT_TURNS, 0);
    const damageType = String(hazard.damageType || "generic").toLowerCase() || "generic";
    const cause = String(hazard.cause || `${kind}_hazard`);
    const sourceId = clampInt(hazard.sourceId, 0, 0);
    const sourceKind = typeof hazard.sourceKind === "string" ? hazard.sourceKind : "";
    const source = sourceId > 0 ? sourceId : hazardId;
    const identity = String(world.get(hazardId, NamedIdentity)?.identity || "");
    const metric = hazardMetric(hazard, identity);

    if (kind === "gas" && gasHazardShouldIgnite(world, pos.x, pos.y, radius, metric)) {
      pendingGasIgnitions.push({
        x: pos.x | 0,
        y: pos.y | 0,
        radius,
        turnsLeft: turnsBefore,
        tickDamage,
        cause,
        sourceId,
        sourceKind,
        identity,
        meta: (hazard.meta && typeof hazard.meta === "object" && !Array.isArray(hazard.meta))
          ? { ...hazard.meta }
          : null,
      });
      try {
        world.emit?.("hazard:ignited", {
          hazardId,
          fromKind: "gas",
          toKind: "fire",
          at: { x: pos.x | 0, y: pos.y | 0 },
          radius,
          sourceId,
          sourceKind,
          cause,
        });
      } catch { /* */ }
      world.destroy(hazardId);
      continue;
    }

    /** @type {number[]} */
    const affectedIds = [];

    if (kind === "ally_aura" || kind === "aura") {
      const sourcePos = sourceId > 0 ? world.get(sourceId, Position) : null;
      if (sourcePos) {
        const sx = sourcePos.x | 0;
        const sy = sourcePos.y | 0;
        if ((pos.x | 0) !== sx || (pos.y | 0) !== sy) {
          world.set(hazardId, Position, { x: sx, y: sy });
          pos.x = sx;
          pos.y = sy;
        }
      }

      const effectKey = String(hazard.meta?.effectKey || "hastened");
      const effectTurns = Math.max(1, Number(hazard.meta?.effectTurns || 2) | 0);
      const potency = Math.max(1, Number(hazard.meta?.potency || 1));
      affectedIds.push(...applyAuraFieldPulse(world, sourceId, pos, {
        radius,
        effectKey,
        effectTurns,
        potency,
        targetRelation: kind === "ally_aura"
          ? "allied"
          : String(hazard.meta?.targetRelation || "allied"),
        woundedOnly: hazard.meta?.woundedOnly === true,
        sourceKind: "aura",
        sourceKey: String(world.get(hazardId, NamedIdentity)?.identity || kind),
      }));
    }

    if (kind === "fire" && medium === "floor") {
      burnFlammableEntitiesAt(world, pos.x, pos.y, source, hazardId, cause, sourceId, sourceKind);
      const tileBefore = getTile(pos.x, pos.y);
      const roofFuel = isRoofFuelTile(world, pos.x, pos.y, tileBefore, overworld);
      const replacementTile = getBurnedTileReplacement(tileBefore, overworld);
      const burnedKind = roofFuel ? "roof" : burnedTileKind(tileBefore);
      if (roofFuel) {
        markDestroyedTile(world, {
          x: pos.x | 0,
          y: pos.y | 0,
          originalTile: tileBefore,
          currentTile: tileBefore,
          destroyedAtTurn: world.step | 0,
          burnedKind,
          cause,
          sourceId,
          sourceKind,
          roofTurnsLeft: ROOF_BURN_TURNS,
        });
        try {
          world.emit?.("tile:burned", {
            actor: source,
            hazardId,
            x: pos.x | 0,
            y: pos.y | 0,
            cause,
            sourceId,
            sourceKind,
            burnedKind,
            tileBefore,
            tileAfter: tileBefore,
          });
        } catch { /* */ }
      } else if (replacementTile !== null && setTile(pos.x, pos.y, replacementTile)) {
        markDestroyedTile(world, {
          x: pos.x | 0,
          y: pos.y | 0,
          originalTile: tileBefore,
          currentTile: replacementTile,
          destroyedAtTurn: world.step | 0,
          burnedKind,
          cause,
          sourceId,
          sourceKind,
          roofTurnsLeft: isRoofBearingBurn(tileBefore) ? ROOF_BURN_TURNS : 0,
        });
        try {
          world.emit?.("tile:burned", {
            actor: source,
            hazardId,
            x: pos.x | 0,
            y: pos.y | 0,
            cause,
            sourceId,
            sourceKind,
            burnedKind,
            tileBefore,
            tileAfter: replacementTile,
          });
        } catch { /* */ }
      }
    }

    if (kind === "fire" && medium === "floor") {
      const spreadChance = getFireSpreadChance(hazard);
      if (spreadChance > 0) {
        if (!unburnedWebCells) {
          unburnedWebCells = new Set();
          for (const [id, ni, webPos] of world.query(NamedIdentity, Position)) {
            if (!ni || !webPos) continue;
            if (world.has(id, Burned)) continue;
            if (String(ni.identity || "").toLowerCase() !== WEB_IDENTITY) continue;
            unburnedWebCells.add(`${webPos.x | 0},${webPos.y | 0}`);
          }
        }
        const spreadTurns = getFireSpreadTurns(hazard, turnsBefore);
        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
          const nx = (pos.x | 0) + dx;
          const ny = (pos.y | 0) + dy;
          const key = `${nx},${ny}`;
          if (fireHazardCells.has(key)) continue;
          const targetIsWeb = unburnedWebCells.has(key);
          const targetIsFlammableTile = isFlammableFireSpreadTile(world, nx, ny, getTile(nx, ny), overworld);
          if (!targetIsWeb && !targetIsFlammableTile) continue;
          const effectiveSpreadChance = targetIsWeb
            ? Math.max(spreadChance, WEB_FIRE_SPREAD_CHANCE)
            : spreadChance;
          if ((world.rand?.() ?? 0) >= effectiveSpreadChance) continue;

          pendingFireSpreads.push({
            x: nx,
            y: ny,
            turnsLeft: spreadTurns,
            tickDamage,
            damageType,
            cause,
            sourceId,
            sourceKind,
            meta: hazard.meta && typeof hazard.meta === "object"
              ? { ...hazard.meta, source: hazard.meta.source ?? "fire_spread" }
              : { source: "fire_spread" },
          });
          fireHazardCells.add(key);
        }
      }
    }

    // Quake hazards: apply stun to non-caster entities each tick.
    if (kind === "quake") {
      const stunTurns = (hazard.meta && Number.isFinite(hazard.meta.stunTurns))
        ? (hazard.meta.stunTurns | 0) : 2;
      for (const [id, tpos, vit] of world.query(Position, Vitality)) {
        if (!tpos || !vit) continue;
        if (id === hazardId || id === sourceId) continue;
        if ((vit.hp | 0) <= 0) continue;
        if (world.has(id, Flying)) continue;
        if (world.has(id, Pet) && world.has(sourceId, Player)) continue;
        if (!inHazardRadius(tpos.x, tpos.y, pos.x, pos.y, radius, metric)) continue;
        let ae = /** @type any */ (world.get(id, ActiveEffects));
        if (!ae) {
          try { world.add(id, ActiveEffects, { effects: [] }); } catch { /* */ }
          ae = /** @type any */ (world.get(id, ActiveEffects));
        }
        if (ae && Array.isArray(ae.effects)) {
          const existing = ae.effects.find(/** @param {any} e */ (e) => e.key === 'stun');
          if (existing) {
            existing.turnsLeft = Math.max(existing.turnsLeft, stunTurns);
          } else {
            ae.effects.push({ key: 'stun', turnsLeft: stunTurns, potency: 1, stacks: 1, startedAtTurn: world.step, sourceId });
          }
        }
      }
    }

    if (kind === "sticky_syrup") {
      const slowTurns = clampInt(hazard.meta?.slowTurns, 3, 1);
      const slowPotency = clampInt(hazard.meta?.slowPotency, 1, 1);
      for (const [id, tpos, vit] of world.query(Position, Vitality)) {
        if (!tpos || !vit) continue;
        if (id === hazardId) continue;
        if ((vit.hp | 0) <= 0) continue;
        if (medium === "floor" && world.has(id, Flying)) continue;
        if (!inHazardRadius(tpos.x, tpos.y, pos.x, pos.y, radius, metric)) continue;
        if (applyStickySyrup(world, id, sourceId || hazardId, slowTurns, slowPotency)) affectedIds.push(id);
      }
    }

    if (kind === "blood_pool") {
      const healAmount = clampInt(hazard.meta?.healAmount, 1, 0);
      const undeadDamage = clampInt(hazard.meta?.undeadDamage, 2, 0);
      for (const [id, tpos, vit] of world.query(Position, Vitality)) {
        if (!tpos || !vit) continue;
        if (id === hazardId) continue;
        if ((vit.hp | 0) <= 0) continue;
        if (medium === "floor" && world.has(id, Flying)) continue;
        if (!inHazardRadius(tpos.x, tpos.y, pos.x, pos.y, radius, metric)) continue;

        const ct = world.get(id, CreatureType);
        if (ct?.type === CREATURE_TYPES.undead) {
          if (undeadDamage <= 0) continue;
          const hit = dealDamage(world, {
            target: id,
            amount: undeadDamage,
            type: "holy",
            source: hazardId,
            at: { x: tpos.x, y: tpos.y },
            cause,
          });
          if (hit.applied) affectedIds.push(id);
          continue;
        }

        if (healAmount <= 0) continue;
        const healed = applyHealing(world, {
          target: id,
          amount: healAmount,
          source: hazardId,
          cause,
        }).amount;
        if (healed > 0) {
          affectedIds.push(id);
        }
      }
    }

    if (tickDamage > 0) {
      for (const [id, tpos, vit] of world.query(Position, Vitality)) {
        if (!tpos || !vit) continue;
        if (id === hazardId) continue;
        if ((vit.hp | 0) <= 0) continue;
        if (medium === "floor" && world.has(id, Flying)) continue;
        // Quake hazards skip caster and their pet for damage.
        if (kind === "quake" && id === sourceId) continue;
        if (kind === "quake" && world.has(id, Pet) && world.has(sourceId, Player)) continue;

        if (!inHazardRadius(tpos.x, tpos.y, pos.x, pos.y, radius, metric)) continue;

        // Plasma: Chebyshev distance falloff — center=full, dist1=half, dist2+=none.
        let amount = tickDamage;
        if (kind === "plasma") {
          const dist = Math.max(Math.abs(tpos.x - pos.x), Math.abs(tpos.y - pos.y));
          if (dist >= 2) continue;
          if (dist === 1) amount = Math.max(1, tickDamage >> 1);
        }

        const hit = dealDamage(world, {
          target: id,
          amount,
          type: damageType,
          source: hazardId,
          at: { x: tpos.x, y: tpos.y },
          cause,
        });
        if (hit.applied) affectedIds.push(id);
      }
    }

    hazard.turnsLeft = turnsBefore - 1;
    const turnsLeft = hazard.turnsLeft | 0;

    // Keep legacy PlasmaCloud component in sync while migrating call sites.
    const legacyPlasma = world.get(hazardId, PlasmaCloud);
    if (legacyPlasma) {
      legacyPlasma.turnsLeft = turnsLeft;
      legacyPlasma.radius = radius;
      legacyPlasma.damage = tickDamage;
      legacyPlasma.sourceId = sourceId;
      legacyPlasma.sourceKind = sourceKind;
    }

    try {
      world.emit?.("hazard:pulse", {
        hazardId,
        kind,
        medium,
        at: { x: pos.x, y: pos.y },
        radius,
        tickDamage,
        damageType,
        cause,
        turnsLeft,
        affectedIds,
        sourceId,
        sourceKind,
      });
    } catch { /* */ }

    // Plasma compatibility bridge for existing listeners/tests.
    if (kind === "plasma") {
      try {
        world.emit?.("plasmaCloud:pulse", {
          cloudId: hazardId,
          at: { x: pos.x, y: pos.y },
          radius,
          damage: tickDamage,
          turnsLeft,
          affectedIds,
          sourceId,
          sourceKind,
          medium,
        });
      } catch { /* */ }
    }

    if (turnsLeft <= 0) {
      try {
        world.emit?.("hazard:expired", {
          hazardId,
          kind,
          medium,
          at: { x: pos.x, y: pos.y },
          radius,
          damageType,
          cause,
          sourceId,
          sourceKind,
        });
      } catch { /* */ }

      if (kind === "plasma") {
        try {
          world.emit?.("plasmaCloud:expired", {
            cloudId: hazardId,
            at: { x: pos.x, y: pos.y },
            radius,
            sourceId,
            sourceKind,
            medium,
          });
        } catch { /* */ }
      }
      world.destroy(hazardId);
    }
  }

  for (const spread of pendingFireSpreads) {
    spawnFireSpreadHazard(world, spread);
  }
  for (const ignition of pendingGasIgnitions) {
    igniteGasHazard(world, ignition);
  }
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {{ x:number, y:number, turnsLeft:number, tickDamage:number, damageType:string, cause:string, sourceId:number, sourceKind:string, meta:Record<string, unknown>|null }} spread
 */
function spawnFireSpreadHazard(world, spread) {
  const hazardId = world.create();
  world.add(hazardId, Position, { x: spread.x, y: spread.y });
  world.add(hazardId, HazardArea, {
    kind: "fire",
    medium: "floor",
    turnsLeft: spread.turnsLeft,
    radius: 0,
    tickDamage: spread.tickDamage,
    damageType: spread.damageType,
    cause: spread.cause,
    sourceId: spread.sourceId,
    sourceKind: spread.sourceKind,
    meta: spread.meta,
  });
  try {
    world.emit?.("hazard:spawned", {
      hazardId,
      kind: "fire",
      medium: "floor",
      at: { x: spread.x, y: spread.y },
      turnsLeft: spread.turnsLeft,
      radius: 0,
      tickDamage: spread.tickDamage,
      damageType: spread.damageType,
      cause: spread.cause,
      sourceId: spread.sourceId,
      sourceKind: spread.sourceKind,
      identity: "wildfire",
      name: "Wildfire",
    });
  } catch { /* */ }
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {{ x:number, y:number, radius:number, turnsLeft:number, tickDamage:number, cause:string, sourceId:number, sourceKind:string, identity:string, meta:Record<string, unknown>|null }} ignition
 */
function igniteGasHazard(world, ignition) {
  const meta = ignition.meta && typeof ignition.meta === "object" ? ignition.meta : null;
  const isExplosiveGas = String(ignition.identity || "") === "explosive_gas";
  const kind = String(meta?.igniteKind || "fire").toLowerCase() || "fire";
  const medium = String(meta?.igniteMedium || "air").toLowerCase() === "floor" ? "floor" : "air";
  const turnsLeft = clampInt(
    meta?.igniteTurnsLeft,
    Math.max(1, ignition.turnsLeft),
    1,
  );
  const radius = clampInt(ignition.radius, 0, 0);
  const tickDamage = clampInt(
    meta?.igniteTickDamage,
    isExplosiveGas ? Math.max(2, ignition.tickDamage) : Math.max(1, ignition.tickDamage),
    0,
  );
  const damageType = String(meta?.igniteDamageType || "fire").toLowerCase() || "fire";
  const cause = String(meta?.igniteCause || `${ignition.cause}:ignited`);
  const identity = String(meta?.igniteIdentity || `${kind}_cloud`) || `${kind}_cloud`;
  const name = String(meta?.igniteName || "Ignited Cloud") || "Ignited Cloud";

  spawnHazard(world, {
    x: ignition.x,
    y: ignition.y,
    kind,
    medium,
    turnsLeft,
    radius,
    tickDamage,
    damageType,
    cause,
    sourceId: ignition.sourceId,
    sourceKind: ignition.sourceKind,
    identity,
    name,
  });
}
