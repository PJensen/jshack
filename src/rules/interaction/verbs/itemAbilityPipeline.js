import { ItemAbilityActivated } from "../../../events/ItemAbilityActivated.js";
import { Charges } from "../../components/Charges.js";
import { Faction } from "../../components/Faction.js";
import { Position } from "../../components/Position.js";
import { Vitality } from "../../components/Vitality.js";
import { getItemCooldownRemaining } from "../../utils/itemCooldowns.js";
import { areFactionsHostile, areFactionsAllied } from "../../utils/factionHostility.js";
import { hasSpellLineOfSight } from "../../utils/spellTargeting.js";
import { buildBlocksVisionMap, blockedCallback } from "../../utils/vision.js";

// Ownership is checked by usePipeline before reaching this named activation.
export function itemAbilityPipeline(ctx, spec, state, equippedSlot) {
  const { actor, itemId, identity } = state;
  const fail = (code, message) => ctx.cancel({ code: `ABILITY_${code}`, message, consumesTurn: false });
  if (ctx.query.get(actor, Vitality)?.hp <= 0) return fail("DEAD_ACTOR", "You cannot act.");
  if (spec.requiresEquipped && !equippedSlot) return fail("NOT_EQUIPPED", "Equip this item first.");
  if (getItemCooldownRemaining(ctx.world, itemId) > 0) return fail("COOLDOWN", "This item is cooling down.");
  const charges = ctx.query.get(itemId, Charges);
  if (spec.chargeCost > 0 && (!charges || charges.current < spec.chargeCost)) return fail("CHARGES", "This item has insufficient charges.");
  const targetId = spec.targeting === "none" ? actor : ctx.target;
  if (spec.targeting !== "none") {
    const vital = ctx.query.get(targetId, Vitality);
    if (!ctx.query.alive(targetId) || !vital || vital.hp <= 0) return fail("TARGET", "Choose a living target.");
    const actorFaction = ctx.query.get(actor, Faction)?.key;
    const targetFaction = ctx.query.get(targetId, Faction)?.key;
    if (spec.targeting === "enemy" && (targetId === actor || !areFactionsHostile(actorFaction, targetFaction))) return fail("TARGET", "Choose an enemy.");
    if (spec.targeting === "ally" && targetId !== actor && !areFactionsAllied(actorFaction, targetFaction)) return fail("TARGET", "Choose an ally.");
    const from = ctx.query.get(actor, Position);
    const to = ctx.query.get(targetId, Position);
    if (!from || !to || Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) > spec.range) return fail("RANGE", "Target is out of range.");
    const isBlocked = blockedCallback(buildBlocksVisionMap(ctx.world, { x0: from.x - spec.range, y0: from.y - spec.range, x1: from.x + spec.range, y1: from.y + spec.range }));
    if (!hasSpellLineOfSight(ctx.world, { sourceId: actor, targetId, sourcePos: from, targetPos: to, range: spec.range, isBlocked })) return fail("LOS", "Target is out of sight.");
  }
  for (const effect of spec.effects || []) {
    ctx.mutate.pushEffect(effect.target === "self" ? actor : targetId, { ...effect, sourceId: itemId, sourceActorId: actor, sourceKind: "item", sourceKey: identity });
  }
  const result = spec.activate ? spec.activate(ctx, { ...state, target: targetId }) : {};
  if (ctx.cancelled) return;
  if (charges && spec.chargeCost > 0) ctx.mutate.patchComponent(itemId, Charges, { current: charges.current - spec.chargeCost });
  if (spec.cooldown > 0) ctx.mutate.queue({ type: "setItemCooldown", entityId: itemId, turns: spec.cooldown });
  if (result?.consumed) {
    ctx.mutate.consume(itemId, actor);
    ctx.io.emit("item:used", { actor, itemId });
  }
  ctx.io.emit(new ItemAbilityActivated({ actor, itemId, targetId, abilityId: spec.id }));
  return { metrics: { path: "ability", consumed: result?.consumed === true }, payload: { abilityId: spec.id } };
}
