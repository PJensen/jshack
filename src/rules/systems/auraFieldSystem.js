import { AuraField } from "../components/AuraField.js";
import { AuraStatModifier } from "../components/AuraStatModifier.js";
import { Position } from "../components/Position.js";
import { applyStatusEffect } from "../utils/effects.js";
import { applyAuraFieldPulse } from "../utils/auraFields.js";
import { evaluateAuraProcNodes } from "../utils/procEvaluator.js";
import { attach, destroySubtree } from "../../lib/ecs-js/hierarchy.js";

export function auraFieldSystem(world) {
  for (const [fieldId, pos, field] of world.query(Position, AuraField)) {
    if (!pos || !field) continue;
    const sourcePos = field.sourceId > 0 ? world.get(field.sourceId, Position) : null;
    if (sourcePos) {
      pos.x = sourcePos.x | 0;
      pos.y = sourcePos.y | 0;
    }
    const sourceId = field.sourceId > 0 ? field.sourceId : fieldId;
    const staleModifiers = [];
    for (const [modifierId, modifier] of world.query(AuraStatModifier)) {
      if ((modifier?.auraId | 0) === (fieldId | 0)) staleModifiers.push(modifierId);
    }
    for (let i = 0; i < staleModifiers.length; i++) destroySubtree(world, staleModifiers[i]);
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
    const procResults = evaluateAuraProcNodes(world, fieldId);
    for (let i = 0; i < procResults.length; i++) {
      const result = procResults[i];
      for (let j = 0; j < result.out.statusesToApply.length; j++) {
        const application = result.out.statusesToApply[j];
        applyStatusEffect(world, result.targetId, {
          key: application.status.key,
          turnsLeft: application.status.turnsLeft,
          potency: application.status.potency,
          stacks: 1,
          sourceId,
          sourceKind: "aura",
          sourceKey: field.sourceKey || field.effectKey,
        });
      }
      for (let j = 0; j < result.out.statModifiers.length; j++) {
        const modifier = result.out.statModifiers[j];
        const modifierId = world.create();
        world.add(modifierId, AuraStatModifier, {
          auraId: fieldId,
          sourceId,
          stat: modifier.stat,
          amount: modifier.amount,
          key: modifier.key,
        });
        attach(world, modifierId, result.targetId);
      }
    }
    field.turnsLeft = (field.turnsLeft | 0) - 1;
    if (field.turnsLeft <= 0) destroySubtree(world, fieldId);
  }
}
