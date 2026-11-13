import { AuraField } from "../components/AuraField.js";
import { Position } from "../components/Position.js";
import { applyAuraFieldPulse } from "../utils/auraFields.js";
import { destroySubtree } from "../../lib/ecs-js/hierarchy.js";

export function auraFieldSystem(world) {
  for (const [fieldId, pos, field] of world.query(Position, AuraField)) {
    if (!pos || !field) continue;
    const sourcePos = field.sourceId > 0 ? world.get(field.sourceId, Position) : null;
    if (sourcePos) {
      pos.x = sourcePos.x | 0;
      pos.y = sourcePos.y | 0;
    }
    const sourceId = field.sourceId > 0 ? field.sourceId : fieldId;
    applyAuraFieldPulse(world, sourceId, pos, {
      radius: field.radius,
      effectKey: field.effectKey,
      effectTurns: field.effectTurns,
      potency: field.potency,
      targetRelation: field.targetRelation,
      woundedOnly: field.woundedOnly,
      sourceKind: "aura",
      sourceKey: field.sourceKey || field.effectKey,
    });
    field.turnsLeft = (field.turnsLeft | 0) - 1;
    if (field.turnsLeft <= 0) destroySubtree(world, fieldId);
  }
}
