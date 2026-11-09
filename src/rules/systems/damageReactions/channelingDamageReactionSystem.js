import { DamageApplied } from "../../components/DamageApplied.js";
import { Channeling } from "../../components/Channeling.js";
import { applyDrainLifeDamageInterrupt } from "../channelingSystem.js";

export function channelingDamageReactionSystem(world) {
  for (const [, damage] of world.query(DamageApplied)) {
    if (!(damage.amount > 0)) continue;
    if (applyDrainLifeDamageInterrupt(world, damage)) continue;
    const actor = Number(damage.target || 0) | 0;
    const channel = actor > 0 ? world.get(actor, Channeling) : null;
    const setbackTurns = Math.max(0, Number(channel?.damageSetbackTurns || 0) | 0);
    if (channel && setbackTurns > 0) {
      channel.turnsRemaining = Math.max(0, Number(channel.turnsRemaining || 0) | 0) + setbackTurns;
      world.emit("channeling:setback", {
        actor,
        spellId: channel.spellId,
        reason: "damage_setback",
        turns: setbackTurns,
        source: Number(damage.source || 0) | 0,
      });
      continue;
    }
    if (!channel?.breakOnDamage) continue;
    try { world.remove(actor, Channeling); } catch {}
    world.emit("channeling:cancelled", {
      actor,
      spellId: channel.spellId,
      reason: "damage_interrupt",
      source: Number(damage.source || 0) | 0,
    });
  }
}
