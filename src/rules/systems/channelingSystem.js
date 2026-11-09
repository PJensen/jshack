// src/rules/systems/channelingSystem.js
// Counts down active channel timers each tick. Completed item use-actions
// dispatch through the registry; completed spell casts inject CastSpellIntent.
// Cancellation from the app layer (ESC) removes Channeling directly.

import { Channeling } from "../components/Channeling.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { CastSpellIntent } from "../components/Intents/CastSpellIntent.js";
import { Mana } from "../components/Mana.js";
import { Stamina } from "../components/Stamina.js";
import { Position } from "../components/Position.js";
import { Vitality } from "../components/Vitality.js";
import { getUseAction } from "../content/useActions/useActionRegistry.js";
import { getSpell } from "../data/spells.js";
import { MANA_REGEN_COOLDOWN, STAMINA_REGEN_COOLDOWN } from "../data/regenConstants.js";
import { runSpellScript } from "../scripts/spells.js";
import { effectiveMaxMana, effectiveMaxStamina } from "../utils/passiveBonuses.js";
import { getChannelInterruptionReason } from "../utils/channelInterruptionPolicy.js";
import { hasLOS } from "../../shared/math/gridLOS.js";
import { buildBlocksVisionMap, blockedCallback } from "../utils/vision.js";
import { spellCostPerTick, spellCostResource } from "../data/spells.js";

export function applyDrainLifeDamageInterrupt(world, { target, source, amount, cause }) {
  const actor = Number(target || 0) | 0;
  if (!(actor > 0)) return false;

  const ch = world.get(actor, Channeling);
  if (!ch || String(ch.spellId || "") !== "drain_life") return false;

  try { world.remove(actor, Channeling); } catch {}

  const ae = world.get(actor, ActiveEffects);
  if (ae && Array.isArray(ae.effects)) {
    ae.effects = ae.effects.filter((e) => String(e?.key || "").toLowerCase() !== "drain_life_channel");
  }

  world.emit("spell:drain_life:break", {
    actor,
    targetId: Number(source || 0) | 0,
    spellId: "drain_life",
    reason: "damage_interrupt",
    amount: Number(amount || 0) | 0,
    cause: String(cause || ""),
  });

  world.emit("channeling:cancelled", {
    actor,
    spellId: "drain_life",
    channelId: "",
    reason: "damage_interrupt",
  });

  return true;
}

/** @param {import('../../lib/ecs-js/index.js').World} world */
export function channelingSystem(world) {
  let _isBlocked = null; // lazily built for breakOnNoLos checks
  for (const [id, ch] of world.query(Channeling)) {
    // Dead actors lose their channel
    const vit = world.get(id, Vitality);
    if (vit && (vit.hp | 0) <= 0) {
      try { world.remove(id, Channeling); } catch {}
      world.emit('channeling:cancelled', { actor: id, spellId: ch.spellId, channelId: ch.channelId || '', reason: 'dead' });
      continue;
    }

    const interruption = getChannelInterruptionReason(world, id);
    if (interruption) {
      try { world.remove(id, Channeling); } catch {}
      world.emit('channeling:cancelled', {
        actor: id,
        spellId: ch.spellId,
        channelId: ch.channelId || '',
        reason: interruption,
      });
      continue;
    }

    // breakOnMove: cancel if caster left anchor position
    if (ch.breakOnMove && ch.anchorX != null && ch.anchorY != null) {
      const cPos = world.get(id, Position);
      if (cPos && ((cPos.x | 0) !== (ch.anchorX | 0) || (cPos.y | 0) !== (ch.anchorY | 0))) {
        try { world.remove(id, Channeling); } catch {}
        world.emit('channeling:cancelled', {
          actor: id,
          spellId: ch.spellId,
          channelId: ch.channelId || '',
          reason: 'caster_moved',
        });
        continue;
      }
    }

    // breakOnNoLos: cancel if caster no longer has LOS to target
    if (ch.breakOnNoLos && ch.targetId) {
      const cPos = world.get(id, Position);
      const tPos = world.get(ch.targetId, Position);
      if (cPos && tPos) {
        if (!_isBlocked) _isBlocked = blockedCallback(buildBlocksVisionMap(world));
        if (!hasLOS(cPos.x | 0, cPos.y | 0, tPos.x | 0, tPos.y | 0, _isBlocked)) {
          try { world.remove(id, Channeling); } catch {}
          world.emit('channeling:cancelled', {
            actor: id,
            spellId: ch.spellId,
            channelId: ch.channelId || '',
            reason: 'los_break',
          });
          continue;
        }
      }
    }

    if (String(ch.mode || "cast") === "sustain") {
      const spell = getSpell(String(ch.spellId || ""));
      if (!spell) {
        try { world.remove(id, Channeling); } catch {}
        world.emit("channeling:cancelled", { actor: id, spellId: ch.spellId, channelId: ch.channelId || '', reason: "invalid_spell" });
        continue;
      }

      const resource = spellCostResource(spell);
      const mana = world.get(id, Mana);
      const stamina = world.get(id, Stamina);
      const vitality = world.get(id, Vitality);
      const perTick = Math.max(0, Number(
        resource === "stamina"
          ? (ch.staminaPerTick ?? spellCostPerTick(spell))
          : resource === "life"
            ? (ch.lifePerTick ?? spellCostPerTick(spell))
            : (ch.manaPerTick ?? spellCostPerTick(spell))
      ));
      const have = Number(
        resource === "stamina"
          ? (stamina?.stamina ?? 0)
          : resource === "life"
            ? (vitality?.hp ?? 0)
            : (mana?.mana ?? 0)
      );
      const minLife = resource === "life" ? 1 : 0;
      if (have - perTick < minLife) {
        try { world.remove(id, Channeling); } catch {}
        world.emit("spell:oom", {
          actor: id,
          spellId: spell.id,
          need: perTick + minLife,
          have,
          costKind: resource === "stamina" ? "stamina" : resource === "life" ? "life" : "mana",
        });
        world.emit("channeling:cancelled", { actor: id, spellId: spell.id, channelId: ch.channelId || '', reason: "oom" });
        continue;
      }

      if (resource === "stamina" && stamina) {
        stamina.stamina = have - perTick;
        stamina.regenCooldown = STAMINA_REGEN_COOLDOWN;
      } else if (resource === "life" && vitality) {
        vitality.hp = Math.max(1, have - perTick);
      } else if (mana) {
        mana.mana = have - perTick;
        mana.regenCooldown = MANA_REGEN_COOLDOWN;
      }

      try {
        runSpellScript(world, id, spell, {
          targetId: ch.targetId || id,
          x: ch.x,
          y: ch.y,
          _fromChanneling: true,
          _channelTick: true,
        });
      } catch {}

      world.emit("channeling:tick", {
        actor: id,
        spellId: spell.id,
        channelId: ch.channelId || '',
        mode: "sustain",
        manaPerTick: resource === "mana" ? perTick : 0,
        staminaPerTick: resource === "stamina" ? perTick : 0,
        lifePerTick: resource === "life" ? perTick : 0,
        manaRemaining: Number(mana?.mana ?? 0),
        manaMax: effectiveMaxMana(world, id, mana),
        staminaRemaining: Number(stamina?.stamina ?? 0),
        staminaMax: effectiveMaxStamina(world, id, stamina),
        lifeRemaining: Number(vitality?.hp ?? 0),
      });
      continue;
    }

    ch.turnsRemaining -= 1;

    if (ch.turnsRemaining <= 0) {
      const itemAction = getUseAction(ch.itemActionId || "");
      if (itemAction) {
        try { world.remove(id, Channeling); } catch {}
        itemAction.onComplete(world, id, ch);
        world.emit('channeling:complete', { actor: id, spellId: ch.spellId || ch.itemActionId, channelId: ch.channelId || '', mode: 'item_use' });
        continue;
      }

      // Channel complete — inject CastSpellIntent for castSpellSystem
      const castData = {
        spellId: ch.spellId,
        targetId: ch.targetId || id,
        _fromChanneling: true,
      };
      if (ch.x != null) castData.x = ch.x;
      if (ch.y != null) castData.y = ch.y;

      try { world.remove(id, Channeling); } catch {}
      try { world.add(id, CastSpellIntent, castData); } catch {}
      world.emit('channeling:complete', { actor: id, spellId: ch.spellId, channelId: ch.channelId || '' });
    } else {
      // Still channeling — emit progress for UI
      world.emit('channeling:tick', {
        actor: id,
        spellId: ch.spellId,
        channelId: ch.channelId || '',
        mode: 'cast',
        turnsRemaining: ch.turnsRemaining,
        turnsTotal: ch.turnsTotal,
      });
    }
  }
}
