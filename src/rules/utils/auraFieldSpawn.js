import { AuraField } from "../components/AuraField.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Position } from "../components/Position.js";
import { attachEntityToCurrentFloor } from "./floorEntities.js";
import { clampInt } from "./numberCoerce.js";

/**
 * Spawn a persistent, source-following aura. Aura fields are intentionally
 * separate from HazardArea: they apply statuses and never deal hazard damage.
 */
export function spawnAuraField(world, params) {
  if (!world || !params) return 0;
  const sourceId = clampInt(params.sourceId, 0, 0);
  const fieldId = world.create();
  world.add(fieldId, Position, {
    x: Number.isFinite(params.x) ? params.x | 0 : 0,
    y: Number.isFinite(params.y) ? params.y | 0 : 0,
  });
  world.add(fieldId, AuraField, {
    sourceId,
    sourceKey: params.sourceKey || params.sourceKind || "",
    effectKey: params.effectKey || "",
    effectTurns: params.effectTurns,
    potency: params.potency,
    targetRelation: params.targetRelation,
    woundedOnly: params.woundedOnly === true,
    turnsLeft: params.turnsLeft,
    radius: params.radius,
  });
  if (params.identity || params.name) {
    try {
      world.add(fieldId, NamedIdentity, {
        identity: String(params.identity || "aura_field"),
        name: String(params.name || "Aura Field"),
      });
    } catch { /* optional presentation metadata */ }
  }
  attachEntityToCurrentFloor(world, fieldId);
  return fieldId;
}
