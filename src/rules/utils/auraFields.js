import { Faction } from "../components/Faction.js";
import { Position } from "../components/Position.js";
import { Vitality } from "../components/Vitality.js";
import { applyStatusEffect } from "./effects.js";
import { areFactionsAllied, areFactionsHostile } from "./factionHostility.js";
import { forEachInRadius, updateSpatialIndex } from "./spatialIndex.js";

/**
 * Apply one pulse from a faction-aware aura field.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} sourceId
 * @param {{ x:number, y:number }} center
 * @param {{ radius?:number, effectKey:string, effectTurns?:number, potency?:number, targetRelation?:string, woundedOnly?:boolean, sourceKind?:string, sourceKey?:string }} options
 * @returns {number[]}
 */
export function applyAuraFieldPulse(world, sourceId, center, options) {
  const radius = Math.max(0, Number(options?.radius || 0) | 0);
  const effectKey = String(options?.effectKey || "").trim();
  if (!effectKey || !center) return [];

  const sourceFaction = String(world.get(sourceId, Faction)?.key || "").trim();
  const relation = String(options?.targetRelation || "allied").trim().toLowerCase();
  const turnsLeft = Math.max(1, Number(options?.effectTurns || 2) | 0);
  const potency = Math.max(1, Number(options?.potency || 1));
  const affectedIds = [];

  // Aura pulses can happen immediately after a spawn, before the scheduled
  // spatial-index maintenance pass has seen the new Position component.
  updateSpatialIndex(world);
  forEachInRadius(world, center.x | 0, center.y | 0, radius, (id) => {
    if (id === sourceId) return;
    const targetFaction = world.get(id, Faction);
    const vitality = world.get(id, Vitality);
    if (!targetFaction || !vitality || (vitality.hp | 0) <= 0) return;

    let matches = false;
    if (relation === "all") matches = true;
    else if (relation === "hostile") matches = areFactionsHostile(sourceFaction, targetFaction.key);
    else matches = areFactionsAllied(sourceFaction, targetFaction.key);
    if (!matches) return;
    if (options?.woundedOnly && (vitality.hp | 0) >= (vitality.maxHp | 0)) return;

    applyStatusEffect(world, id, {
      key: effectKey,
      turnsLeft,
      potency,
      stacks: 1,
      sourceId,
      sourceKind: options?.sourceKind || "aura",
      sourceKey: options?.sourceKey || effectKey,
    });
    affectedIds.push(id | 0);
  });

  return affectedIds;
}
