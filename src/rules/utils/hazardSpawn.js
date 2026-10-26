import { HazardArea } from "../components/HazardArea.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Position } from "../components/Position.js";
import { attachEntityToCurrentFloor } from "./floorEntities.js";
import { clampInt } from "./numberCoerce.js";

const DEFAULT_TURNS = 3;
const DEFAULT_RADIUS = 1;
const DEFAULT_TICK_DAMAGE = 0;

function normalizeMedium(value) {
  const medium = String(value || "").toLowerCase();
  if (medium === "floor") return "floor";
  return "air";
}

function titleCase(text) {
  const src = String(text || "");
  if (!src) return "";
  return `${src.slice(0, 1).toUpperCase()}${src.slice(1)}`;
}

/**
 * Track runtime-created hazards as floor-owned entities so transitions can
 * serialize/destroy them with the rest of the current floor.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} entityId
 */
/**
 * Generic hazard spawner for air/floor AoE entities.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {{
 *   x:number,
 *   y:number,
 *   kind?:string,
 *   medium?:'air'|'floor'|string,
 *   turnsLeft?:number,
 *   radius?:number,
 *   tickDamage?:number,
 *   damage?:number,
 *   damageType?:string,
 *   cause?:string,
 *   sourceId?:number,
 *   sourceKind?:string,
 *   identity?:string,
 *   name?:string,
 *   meta?:Record<string, unknown>|null,
 * }} params
 */
export function spawnHazard(world, params) {
  if (!world || !params) return 0;

  const x = Number.isFinite(params.x) ? (params.x | 0) : 0;
  const y = Number.isFinite(params.y) ? (params.y | 0) : 0;
  const kind = String(params.kind || "generic").toLowerCase() || "generic";
  const medium = normalizeMedium(params.medium);
  const turnsLeft = clampInt(params.turnsLeft, DEFAULT_TURNS, 1);
  const radius = clampInt(params.radius, DEFAULT_RADIUS, 0);
  const tickDamage = clampInt(
    Number.isFinite(params.tickDamage) ? params.tickDamage : params.damage,
    DEFAULT_TICK_DAMAGE,
    0,
  );
  const damageType = String(params.damageType || "generic").toLowerCase() || "generic";
  const cause = String(params.cause || `${kind}_hazard`);
  const sourceId = clampInt(params.sourceId, 0, 0);
  const sourceKind = typeof params.sourceKind === "string" ? params.sourceKind : "";
  const identity = String(params.identity || `${kind}_hazard`) || `${kind}_hazard`;
  const name = String(params.name || `${titleCase(kind)} Hazard`) || `${titleCase(kind)} Hazard`;
  const meta = (params.meta && typeof params.meta === "object" && !Array.isArray(params.meta))
    ? { ...params.meta }
    : null;

  const hazardId = world.create();
  world.add(hazardId, Position, { x, y });
  world.add(hazardId, HazardArea, {
    kind,
    medium,
    turnsLeft,
    radius,
    tickDamage,
    damageType,
    cause,
    sourceId,
    sourceKind,
    meta,
  });
  try { world.add(hazardId, NamedIdentity, { name, identity }); } catch { /* */ }
  attachEntityToCurrentFloor(world, hazardId);

  try {
    world.emit?.("hazard:spawned", {
      hazardId,
      kind,
      medium,
      at: { x, y },
      turnsLeft,
      radius,
      tickDamage,
      damageType,
      cause,
      sourceId,
      sourceKind,
      meta,
      identity,
      name,
    });
  } catch { /* */ }

  // Plasma compatibility bridge for existing listeners/tests.
  if (kind === "plasma") {
    try {
      world.emit?.("plasmaCloud:spawned", {
        cloudId: hazardId,
        at: { x, y },
        turnsLeft,
        radius,
        damage: tickDamage,
        sourceId,
        sourceKind,
      });
    } catch { /* */ }
  }

  return hazardId;
}
