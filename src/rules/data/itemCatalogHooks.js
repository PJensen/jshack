// Hook factories and utility functions shared across item catalog categories.
import { getSpell } from "./spells.js";
import { getGem } from "./gems.js";
import { identify } from "./identification.js";
import { createEatOnUseHook, createMappingOnUseHook } from "../content/items/useNativeHooks.js";
import { requiresIdentification } from "./itemAppearances.js";
import { isIdentified } from "./identification.js";
import { Beatitude } from "../components/Beatitude.js";
import { CreatureType } from "../components/CreatureType.js";
import { Equipment, GEAR_SLOTS } from "../components/Equipment.js";
import { ItemCooldown } from "../components/ItemCooldown.js";
import { Material } from "../components/Material.js";
import { MaterialState } from "../components/MaterialState.js";
import { Vitality } from "../components/Vitality.js";
import { Stamina } from "../components/Stamina.js";
import { Mana } from "../components/Mana.js";
import { Position } from "../components/Position.js";
import { WeatherState } from "../components/WeatherState.js";
import { isWalkable } from "../environment/dungeon/tileMap.js";
import { TURNS_PER_DAY } from "./calendar.js";
import { createStatusEvent } from "../../shared/events/statusEvent.js";
import { getPassiveBonuses } from "../utils/passiveBonuses.js";
import { getTileQuerySnapshot } from "../utils/tileQueryCache.js";
import { isWetAt, markWet } from "../utils/wetTileMap.js";
import {
  emitScrollReadFailure,
  getScrollReadingQualityFromContext,
} from "../utils/scrollReading.js";

/**
 * @param {string} identity
 * @param {string} prefix
 */
function spellIdFromIdentity(identity, prefix) {
  const id = String(identity || "").toLowerCase();
  const p = String(prefix || "").toLowerCase();
  if (p && !id.startsWith(p)) return "";
  return id.slice(p.length);
}

/**
 * @param {{
 *   identityPrefix: string,
 *   targetMode?: "intentTarget" | "self",
 *   castEventSource?: string,
 *   consumeOnSuccess?: boolean,
 * }} opts
 */
export function createCastSpellFromIdentityHook(opts) {
  const identityPrefix = String(opts?.identityPrefix || "").toLowerCase();
  const targetMode = String(opts?.targetMode || "self") === "intentTarget" ? "intentTarget" : "self";
  const castEventSource = String(opts?.castEventSource || "");
  const consumeOnSuccess = opts?.consumeOnSuccess !== false;

  return (ctx, state) => {
    if (typeof ctx?.rules?.runSpell !== "function") return { consumed: false };
    const actor = Number(state?.actor || ctx.actor || 0) | 0;

    const quality = getScrollReadingQualityFromContext(ctx, actor);
    if (!quality.canRead) {
      emitScrollReadFailure(ctx.io, actor, Number(state?.itemId || 0) | 0, quality);
      return { consumed: true }; // scroll is consumed but does nothing
    }
    if (quality.fumbleChance > 0 && ctx.helpers?.chance?.(quality.fumbleChance)) {
      const itemId = Number(state?.itemId || 0) | 0;
      const duration = 150;
      ctx.mutate?.pushEffect?.(actor, {
        key: "confused",
        turnsLeft: duration,
        maxTurns: duration,
        potency: 1,
        stacks: 1,
        sourceId: itemId,
        sourceKind: "scroll",
        sourceKey: String(state?.identity || ""),
      });
      ctx.io.emit("scroll:fumbled", {
        actor,
        itemId,
        identity: String(state?.identity || ""),
        effectKey: "confused",
        duration,
      });
      return { consumed: true };
    }

    const spellId = spellIdFromIdentity(state?.identity || "", identityPrefix);
    if (!spellId) return { consumed: false };
    const spell = getSpell(spellId);
    if (!spell) return { consumed: false };

    const targetId = targetMode === "intentTarget"
      ? (Number(state?.intent?.targetId || actor) | 0)
      : actor;
    const intent = targetMode === "intentTarget" ? { targetId } : {};
    const tx = Number(state?.intent?.x);
    const ty = Number(state?.intent?.y);
    if (Number.isFinite(tx) && Number.isFinite(ty)) {
      intent.x = tx | 0;
      intent.y = ty | 0;
    }
    try { ctx.rules.runSpell(actor, spell, intent); } catch { return { consumed: false }; }

    const event = { actor, spellId: spell.id, targetId };
    if (castEventSource) event.source = castEventSource;
    ctx.io.emit("castSpell", event);
    return { consumed: consumeOnSuccess, spellId: spell.id };
  };
}

/**
 * @param {{
 *   identityPrefix: string,
 *   consumeOnSuccess?: boolean,
 * }} opts
 */
export function createLearnSpellFromIdentityHook(opts) {
  const identityPrefix = String(opts?.identityPrefix || "").toLowerCase();
  const consumeOnSuccess = opts?.consumeOnSuccess !== false;
  return (ctx, state) => {
    const actor = Number(state?.actor || ctx.actor || 0) | 0;
    const spellId = spellIdFromIdentity(state?.identity || "", identityPrefix);
    if (!spellId) return { consumed: false };

    const spell = getSpell(spellId);
    if (!spell) {
      ctx.io.emit("spell:learn-denied", { actor, reason: "unknown-spell", spellId });
      return { consumed: false };
    }

    const brain = ctx.query.brain(actor);
    const learned = Array.isArray(brain?.learnedSpellIds) ? brain.learnedSpellIds : [];
    if (learned.includes(spell.id)) {
      ctx.io.emit("spell:already-known", { actor, spellId: spell.id });
      return { consumed: false };
    }

    ctx.mutate.learnSpell(actor, spell.id);
    ctx.io.emit("spell:learned", { actor, spellId: spell.id });
    return { consumed: consumeOnSuccess, spellId: spell.id };
  };
}

/**
 * @param {string} title
 * @param {string} text
 */
export function createOpenFlavorBookHook(title, text) {
  const normalizedTitle = String(title || "Book");
  const normalizedText = String(text || "");
  return (ctx, state) => {
    const actor = Number(state?.actor || ctx.actor || 0) | 0;
    if (!normalizedText) return { consumed: false };
    ctx.io.emit("book:open", { actor, title: normalizedTitle, text: normalizedText });
    return { consumed: false };
  };
}

export function createBuffFoodOnUseHook(opts = {}) {
  const eat = createEatOnUseHook({ consumeOnSuccess: opts.consumeOnSuccess });
  const effects = Array.isArray(opts.effects)
    ? opts.effects
    : (opts.key ? [opts] : []);
  return (ctx, state) => {
    const result = eat(ctx, state);
    const actor = Number(state?.actor || ctx.actor || 0) | 0;
    const itemId = Number(state?.itemId || ctx.primary || 0) | 0;
    for (const effect of effects) {
      const key = String(effect?.key || "");
      if (!key) continue;
      const turnsLeft = Math.max(1, Number(effect.turnsLeft || effect.duration || 0) | 0);
      ctx.mutate?.pushEffect?.(actor, {
        key,
        turnsLeft,
        maxTurns: turnsLeft,
        potency: Number(effect.potency || 1),
        stacks: Math.max(1, Number(effect.stacks || 1) | 0),
        sourceId: itemId,
        sourceKind: "cooked_food",
        sourceActorId: actor,
        sourceKey: String(state?.identity || ""),
      });
    }
    if (effects.length > 0) {
      ctx.io.emit("cooking:buff-food", {
        actor,
        itemId,
        identity: String(state?.identity || ""),
        effects: effects.map((effect) => ({
          key: String(effect?.key || ""),
          turnsLeft: Math.max(1, Number(effect?.turnsLeft || effect?.duration || 0) | 0),
          potency: Number(effect?.potency || 1),
        })).filter((effect) => effect.key),
      });
    }
    return result;
  };
}

/**
 * @param {any} state
 */
export function canTouchstoneDipTarget(state) {
  return String(state?.targetInfo?.type || "") === "gem";
}

export function createTouchstoneDipHook() {
  return (ctx, state) => {
    const gem = getGem(state.targetIdentity);
    if (!gem) {
      ctx.io.emit("item:applied", {
        actor: state.actor,
        toolId: state.toolId,
        targetId: state.targetId,
        result: { type: "nothing" },
      });
      return { applied: true, consumedTool: false, resultType: "nothing" };
    }

    const wasNew = identify(state.targetIdentity);
    const result = {
      type: "touchstone",
      gemName: gem.name,
      appearance: gem.appearance,
      hardness: gem.hardness,
      material: gem.material,
      identified: true,
      newlyIdentified: wasNew,
    };

    ctx.io.emit("item:applied", {
      actor: state.actor,
      toolId: state.toolId,
      targetId: state.targetId,
      result,
    });
    if (wasNew) {
      ctx.io.emit("item:identified", {
        actor: state.actor,
        identity: state.targetIdentity,
        name: gem.name,
        appearance: gem.appearance,
        category: "gem",
      });
    }
    return { applied: true, consumedTool: false, resultType: "touchstone" };
  };
}

/**
 * @param {any} state
 */
export function canGemSocketDipTarget(state) {
  if (String(state?.toolInfo?.type || "") !== "gem") return false;
  const gemDef = getGem(String(state?.toolIdentity || ""));
  if (!gemDef?.socketable) return false;
  const targetInfo = state?.targetInfo;
  if (!targetInfo || String(targetInfo.type || "") !== "equip") return false;
  if (String(targetInfo.slot || "") !== "weapon") return false;
  const maxSockets = Number(targetInfo.maxSockets || 0);
  const sockets = Array.isArray(targetInfo.sockets) ? targetInfo.sockets : [];
  return maxSockets > 0 && sockets.length < maxSockets;
}

export function createGemSocketDipHook(gemId) {
  return (ctx, state) => {
    const gemDef = getGem(gemId);
    if (!gemDef?.socketable) return { applied: false };
    const targetInfo = state.targetInfo;
    const newSockets = Array.isArray(targetInfo.sockets) ? [...targetInfo.sockets, gemId] : [gemId];
    const currentAffixes = Array.isArray(targetInfo.affixes) ? targetInfo.affixes : [];
    const newAffixes = gemDef.socketAffixId && !currentAffixes.includes(gemDef.socketAffixId)
      ? [...currentAffixes, gemDef.socketAffixId]
      : [...currentAffixes];
    ctx.helpers.patchItemInfo(state.targetId, { sockets: newSockets, affixes: newAffixes });
    ctx.io.emit("gem:socketed", { actor: state.actor, weaponId: state.targetId, gemId });
    return { applied: true, consumedTool: true };
  };
}

/**
 * @param {any} state
 */
export function canPoisonDipTarget(state) {
  const toolType = String(state?.toolInfo?.type || "");
  const targetType = String(state?.targetInfo?.type || "");
  const targetSlot = String(state?.targetInfo?.slot || "");
  return toolType === "potion" && targetType === "equip" && targetSlot === "weapon";
}

/**
 * @param {any} state
 */
export function canParalysisDipTarget(state) {
  const toolType = String(state?.toolInfo?.type || "");
  const targetType = String(state?.targetInfo?.type || "");
  const targetSlot = String(state?.targetInfo?.slot || "");
  if (toolType !== "potion") return false;
  return (targetType === "equip" && targetSlot === "weapon")
    || (targetType === "ammo" && targetSlot === "ammo");
}

/**
 * @param {{
 *   chargesGranted?: number | ((ctx:any, state:any) => number),
 *   coatingColor?: string,
 *   messageTemplate?: string,
 * }} [opts]
 */
export function createParalysisCoatDipHook(opts = {}) {
  const resolveChargesGranted = typeof opts?.chargesGranted === "function"
    ? opts.chargesGranted
    : () => Number(opts?.chargesGranted ?? 8);
  const messageTemplate = String(
    opts?.messageTemplate
    || "You coat $targetName with paralytic venom (+$chargesGranted charges, total $chargesTotal)."
  );

  return (ctx, state) => {
    const targetInfo = state?.targetInfo;
    if (!targetInfo) return { applied: false, consumedTool: false, resultType: "nothing" };
    const currentCharges = Math.max(0, Number(targetInfo?.coating?.charges || 0) | 0);
    const grantedRaw = Number(resolveChargesGranted(ctx, state));
    const chargesGranted = Math.max(1, Number.isFinite(grantedRaw) ? (grantedRaw | 0) : 1);
    const nextCharges = currentCharges + chargesGranted;
    const coating = { kind: "paralysis", charges: nextCharges };
    if (opts?.coatingColor) coating.color = opts.coatingColor;
    const fallbackLabel = targetInfo?.type === "ammo" ? "arrows" : "weapon";
    const targetName = resolveApplyTargetName(ctx, state, fallbackLabel);
    const message = interpolateFields(messageTemplate, {
      targetName,
      currentCharges,
      chargesGranted,
      chargesTotal: nextCharges,
    });
    ctx.helpers.patchItemInfo(state.targetId, { coating });
    ctx.io.emit("item:applied", {
      actor: state.actor,
      toolId: state.toolId,
      targetId: state.targetId,
      result: {
        type: "paralysis_coat",
        coating,
        chargesGranted,
        chargesTotal: nextCharges,
        message,
      },
    });
    return { applied: true, consumedTool: true, resultType: "paralysis_coat" };
  };
}

/**
 * @param {{
 *   kind:string,
 *   chargesGranted?: number,
 *   coatingColor?: string,
 *   resultType?: string,
 *   resultEventType?: string,
 *   messageTemplate?: string,
 *   fallbackLabel?: string,
 * }} opts
 */
export function createWeaponCoatingDipHook(opts = {}) {
  const kind = String(opts?.kind || "");
  const chargesGranted = Math.max(1, Number(opts?.chargesGranted ?? 6) | 0);
  const resultType = String(opts?.resultType || `${kind}_coat`);
  const resultEventType = String(opts?.resultEventType || resultType);
  const fallbackLabel = String(opts?.fallbackLabel || "weapon");
  const messageTemplate = String(
    opts?.messageTemplate
    || "You coat $targetName with $kind (+$chargesGranted charges, total $chargesTotal)."
  );

  return (ctx, state) => {
    const targetInfo = state?.targetInfo;
    if (!targetInfo || !kind) return { applied: false, consumedTool: false, resultType: "nothing" };
    const currentCharges = Math.max(0, Number(targetInfo?.coating?.charges || 0) | 0);
    const nextCharges = currentCharges + chargesGranted;
    const coating = { kind, charges: nextCharges };
    if (opts?.coatingColor) coating.color = opts.coatingColor;
    const targetName = resolveApplyTargetName(ctx, state, fallbackLabel);
    const message = interpolateFields(messageTemplate, {
      kind,
      targetName,
      currentCharges,
      chargesGranted,
      chargesTotal: nextCharges,
    });
    ctx.helpers.patchItemInfo(state.targetId, { coating });
    ctx.io.emit("item:applied", {
      actor: state.actor,
      toolId: state.toolId,
      targetId: state.targetId,
      result: {
        type: resultEventType,
        coating,
        chargesGranted,
        chargesTotal: nextCharges,
        message,
      },
    });
    return { applied: true, consumedTool: true, resultType };
  };
}

const STONECOAT_ALLOWED_SLOTS = Object.freeze(new Set([
  "weapon",
  "armor",
  "head",
  "neck",
  "belt",
  "gloves",
  "legs",
  "feet",
  "offhand",
  "ring",
  "ranged",
]));

/**
 * @param {any} state
 */
export function canStonecoatDipTarget(state) {
  const toolType = String(state?.toolInfo?.type || "");
  const targetType = String(state?.targetInfo?.type || "");
  const targetSlot = String(state?.targetInfo?.slot || "").toLowerCase();
  return toolType === "potion" && targetType === "equip" && STONECOAT_ALLOWED_SLOTS.has(targetSlot);
}

/**
 * @param {any} ctx
 * @param {any} state
 * @param {string} fallback
 */
export function resolveApplyTargetName(ctx, state, fallback = "item") {
  const targetId = Number(state?.targetId || ctx?.target || 0) | 0;
  const fromEntityName = String(ctx?.query?.name?.(targetId) || "").trim();
  if (fromEntityName) return fromEntityName;
  const fromInfo = String(state?.targetInfo?.description || "").trim();
  if (fromInfo) return fromInfo;
  const fromIdentity = String(state?.targetIdentity || "").trim();
  if (fromIdentity) return fromIdentity.replace(/_/g, " ");
  return String(fallback || "item");
}

const CAMPFIRE_WOOD_IDENTITIES = Object.freeze(new Set([
  "fuel_firewood",
  "material_lumber",
]));

const CAMPFIRE_METAL_MATERIALS = Object.freeze(new Set([
  "metal",
  "iron",
  "steel",
  "bronze",
  "silver",
  "gold",
  "copper",
  "lead",
]));
const CAMPFIRE_EXPIRY_TURNS = Math.max(1, Math.floor(TURNS_PER_DAY / 2));
const CAMPFIRE_EXPIRY_JITTER_TURNS = Math.max(1, Math.floor(TURNS_PER_DAY / 24));

/**
 * @param {string} value
 */
function isCampfireWoodIdentity(value) {
  return CAMPFIRE_WOOD_IDENTITIES.has(String(value || "").toLowerCase());
}

/**
 * @param {any} ctx
 * @param {number} actor
 */
function resolveWieldedCampfireStriker(ctx, actor) {
  const eq = ctx?.query?.get?.(actor, Equipment);
  const weaponId = Number(eq?.weapon || 0) | 0;
  if (!(weaponId > 0) || !ctx?.query?.alive?.(weaponId)) return null;

  const info = ctx.query.itemInfo?.(weaponId);
  const slot = String(info?.slot || "").toLowerCase();
  const type = String(info?.type || "").toLowerCase();
  if (slot !== "weapon" && type !== "weapon" && type !== "equip") return null;

  const material = String(ctx.query.get?.(weaponId, Material)?.kind || info?.material || "").toLowerCase();
  if (!CAMPFIRE_METAL_MATERIALS.has(material)) return null;

  return {
    itemId: weaponId,
    material,
    name: String(ctx.query.name?.(weaponId) || "weapon"),
  };
}

/**
 * @param {any} world
 */
function currentWeather(world) {
  if (!world || typeof world.query !== "function") return "clear";
  for (const [, weather] of world.query(WeatherState)) {
    return String(weather?.current || "clear").toLowerCase();
  }
  return "clear";
}

/**
 * @param {any} ctx
 * @param {number} actor
 * @param {number} woodId
 */
function resolveCampfireDampReason(ctx, actor, woodId) {
  const weather = currentWeather(ctx?.world);
  if (weather === "heavy_rain") return { reason: "heavy_rain", weather };
  if (weather === "rain") return { reason: "rain", weather };

  const woodState = ctx?.query?.get?.(woodId, MaterialState);
  if (Number(woodState?.wetness || 0) >= 0.35) {
    return { reason: "wet_fuel", weather };
  }

  const pos = ctx?.query?.get?.(actor, Position);
  if (pos && isWetAt(ctx.world, pos.x | 0, pos.y | 0)) {
    return { reason: "wet_ground", weather };
  }

  return { reason: "", weather };
}

function resolveCampfireAnchor(ctx, actor, woodId) {
  const woodPos = ctx?.query?.get?.(woodId, Position);
  if (woodPos) return { x: woodPos.x | 0, y: woodPos.y | 0 };
  const actorPos = ctx?.query?.get?.(actor, Position);
  return actorPos ? { x: actorPos.x | 0, y: actorPos.y | 0 } : { x: 0, y: 0 };
}

function resolveCampfireSpawnPoint(ctx, anchor) {
  const snap = getTileQuerySnapshot(ctx.world);
  const candidates = [
    { x: anchor.x + 1, y: anchor.y },
    { x: anchor.x - 1, y: anchor.y },
    { x: anchor.x, y: anchor.y + 1 },
    { x: anchor.x, y: anchor.y - 1 },
  ];
  for (let i = 0; i < candidates.length; i++) {
    const at = candidates[i];
    const key = `${at.x},${at.y}`;
    if (!isWalkable(at.x, at.y)) continue;
    if (snap.blockedByCell.has(key)) continue;
    if (snap.interactableByCell.has(key)) continue;
    return at;
  }
  return anchor;
}

/**
 * @param {any} state
 */
export function canCampfireDipTarget(state) {
  return isCampfireWoodIdentity(state?.targetIdentity);
}

/**
 * @param {{
 *   turnsLeft?: number,
 *   tickDamage?: number,
 * }} [opts]
 */
export function createCampfireDipHook(opts = {}) {
  const turnsLeft = Math.max(1, Number(opts?.turnsLeft ?? 8) | 0);
  const tickDamage = Math.max(0, Number(opts?.tickDamage ?? 1) | 0);

  return (ctx, state) => {
    const actor = Number(state?.actor || ctx.actor || 0) | 0;
    const toolId = Number(state?.toolId || ctx.primary || 0) | 0;
    const woodId = Number(state?.targetId || ctx.target || 0) | 0;
    if (!(actor > 0) || !(toolId > 0) || !(woodId > 0)) {
      ctx.cancel({ code: "CAMPFIRE_INVALID", message: "You need flint, wood, and a free hand to make a campfire." });
      return { applied: false, consumedTool: false, resultType: "campfire_failed" };
    }
    if (!isCampfireWoodIdentity(state?.targetIdentity)) {
      ctx.cancel({ code: "CAMPFIRE_NEEDS_WOOD", message: "You need firewood or lumber to start a campfire." });
      return { applied: false, consumedTool: false, resultType: "campfire_failed" };
    }

    const striker = resolveWieldedCampfireStriker(ctx, actor) || {
      itemId: 0,
      material: "",
      name: "the flint",
    };

    const at = resolveCampfireAnchor(ctx, actor, woodId);
    const damp = resolveCampfireDampReason(ctx, actor, woodId);
    if (damp.reason) {
      const woodName = resolveApplyTargetName(ctx, state, "wood");
      const reasonText = damp.reason === "heavy_rain"
        ? "The downpour hammers the sparks flat before they can catch."
        : damp.reason === "rain"
          ? "Rain beads on the wood and the sparks die into smoke."
          : damp.reason === "wet_ground"
            ? "The wet ground drinks the heat before the kindling can catch."
            : "The wood is too damp. Sparks crawl over it and gutter out.";
      const message = striker.itemId > 0
        ? `You strike ${striker.name} against the flint. ${reasonText}`
        : `You strike the flint over the ${woodName}. ${reasonText}`;
      ctx.io.emit("skill:campfire:spark", {
        actor,
        toolId,
        woodId,
        strikerId: striker.itemId,
        at,
        success: false,
        reason: damp.reason,
        weather: damp.weather,
        message,
      });
      ctx.io.emit("item:applied", {
        actor,
        toolId,
        targetId: woodId,
        result: {
          type: "campfire_failed",
          message,
          reason: damp.reason,
          consumedWood: false,
          strikerId: striker.itemId,
        },
      });
      return { applied: true, consumedTool: false, resultType: "campfire_failed" };
    }

    const fireAt = resolveCampfireSpawnPoint(ctx, at);
    ctx.helpers.materializeSpawn({
      kind: "cooking_fire",
      params: {
        temporary: true,
        expiresInTurns: CAMPFIRE_EXPIRY_TURNS,
        expiresJitterTurns: CAMPFIRE_EXPIRY_JITTER_TURNS,
        replacementKind: "ashes",
        source: "stone_flint",
      },
    }, fireAt);
    ctx.helpers.consume(woodId, actor);

    const woodName = resolveApplyTargetName(ctx, state, "wood");
    const message = striker.itemId > 0
      ? `You strike ${striker.name} against the flint. Sparks catch in the ${woodName}.`
      : `You strike the flint over the ${woodName}. Sparks catch.`;
    ctx.io.emit("skill:campfire:spark", {
      actor,
      toolId,
      woodId,
      strikerId: striker.itemId,
      at,
      success: true,
      reason: "",
      weather: damp.weather,
      message,
    });
    ctx.io.emit("skill:campfire", {
      actor,
      toolId,
      woodId,
      strikerId: striker.itemId,
      at,
      result: { type: "campfire", message },
    });
    ctx.io.emit("item:applied", {
      actor,
      toolId,
      targetId: woodId,
      result: {
        type: "campfire",
        message,
        consumedWood: true,
        strikerId: striker.itemId,
      },
    });
    return { applied: true, consumedTool: false, resultType: "campfire" };
  };
}

/**
 * Tiny string templater for item-def messages.
 * Supports `$field` and `${field}` placeholders.
 *
 * @param {string} template
 * @param {Record<string, unknown>} fields
 */
function interpolateFields(template, fields) {
  const source = String(template || "");
  const table = (fields && typeof fields === "object") ? fields : {};
  return source.replace(/\$\{([a-zA-Z_]\w*)\}|\$([a-zA-Z_]\w*)/g, (_match, braced, bare) => {
    const key = String(braced || bare || "");
    if (!key) return "";
    const value = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : "";
    return String(value ?? "");
  });
}

/**
 * @param {unknown} value
 * @returns {"blessed"|"uncursed"|"cursed"}
 */
function normalizeBeatitude(value) {
  const beat = String(value || "").toLowerCase();
  if (beat === "blessed") return "blessed";
  if (beat === "cursed") return "cursed";
  return "uncursed";
}

/**
 * Cursed health potions still mend the body, but their shadow keeps moving
 * after the drinker stops. The brief confusion makes the curse noticeable
 * without turning a basic healing potion into a hard punishment.
 */
export function createCursedHealthPotionHook() {
  return (ctx, state) => {
    const actorId = Number(state?.actor || ctx.actor || 0) | 0;
    const itemId = Number(state?.itemId || ctx.primary || 0) | 0;
    const targetId = ctx.rules.resolveTarget(actorId);
    const beatitude = normalizeBeatitude(ctx.query.get(itemId, Beatitude)?.state);
    if (beatitude !== "cursed") return { cursed: false };

    const turns = 4;
    ctx.helpers.addEffect(targetId, {
      key: "confused",
      potency: 1,
      turnsLeft: turns,
      onsetLeft: 0,
      peakLeft: 0,
      stack: "refresh",
      maxStacks: 1,
      sourceId: itemId,
      meta: { source: "potion_health", curse: "lagging_shadow", masked: !state.identified },
    });
    ctx.io.emit("status", createStatusEvent({
      id: targetId,
      kind: "debuff",
      effect: "confused",
      source: actorId,
      masked: !state.identified,
    }));
    ctx.io.emit("message", {
      text: "Your shadow keeps moving after you stop.",
      type: "warning",
    });
    return { cursed: true, effect: "lagging_shadow", turns };
  };
}

/**
 * @param {"blessed"|"uncursed"|"cursed"} beatitude
 */
function waterTypeFromBeatitude(beatitude) {
  if (beatitude === "blessed") return "holy";
  if (beatitude === "cursed") return "unholy";
  return "plain";
}

export function createWaterPotionHooks() {
  return {
    can_dip_target: (state) => {
      const targetType = String(state?.targetInfo?.type || "");
      return !!targetType && targetType !== "currency";
    },
    on_drink: (ctx, state) => {
      const actorId = Number(state?.actor || ctx.actor || 0) | 0;
      const itemId = Number(state?.itemId || ctx.primary || 0) | 0;
      const targetId = ctx.rules.resolveTarget(actorId);
      const beatitude = normalizeBeatitude(ctx.query.get(itemId, Beatitude)?.state);
      const waterType = waterTypeFromBeatitude(beatitude);
      const hadBurn = ctx.helpers.hasStatus(targetId, "burning") || ctx.helpers.hasStatus(targetId, "burn");
      const hadCursed = ctx.helpers.hasStatus(targetId, "cursed");
      const hadHallucination = ctx.helpers.hasStatus(targetId, "hallucinating");

      ctx.helpers.clearEffects(targetId, ["burn", "burning"]);

      if (waterType === "holy") {
        // Holy water removes cursed status before blessing — drinking consecrated water purges corruption
        if (hadCursed) {
          ctx.helpers.clearEffects(targetId, ["cursed", "curse"]);
          ctx.io.emit("water:curse_lifted", { actor: actorId, itemId, targetId, waterType });
        }
        ctx.helpers.addEffect(targetId, {
          key: "blessed",
          potency: 1,
          turnsLeft: 30,
          onsetLeft: 0,
          peakLeft: 0,
          stack: "refresh",
          maxStacks: 1,
          sourceId: itemId,
          meta: { source: "potion_water", waterType: "holy", masked: !state.identified },
        });
      } else if (waterType === "unholy") {
        ctx.helpers.addEffect(targetId, {
          key: "cursed",
          potency: 1,
          turnsLeft: 30,
          onsetLeft: 0,
          peakLeft: 0,
          stack: "refresh",
          maxStacks: 1,
          sourceId: itemId,
          meta: { source: "potion_water", waterType: "unholy", masked: !state.identified },
        });
      } else if (waterType === "plain" && hadHallucination) {
        // Plain water while hallucinating: the cold clarity cuts through the visions
        ctx.helpers.clearEffects(targetId, ["hallucinating", "hallucination"]);
        ctx.io.emit("water:hallucination_cleared", { actor: actorId, itemId, targetId });
      }

      ctx.io.emit("water:drank", {
        actor: actorId,
        itemId,
        targetId,
        waterType,
        removedBurn: hadBurn ? 1 : 0,
        removedCurse: waterType === "holy" && hadCursed ? 1 : 0,
        removedHallucination: waterType === "plain" && hadHallucination ? 1 : 0,
      });
      return {
        waterType,
        removedBurn: hadBurn ? 1 : 0,
        removedCurse: waterType === "holy" && hadCursed ? 1 : 0,
        removedHallucination: waterType === "plain" && hadHallucination ? 1 : 0,
      };
    },
    on_throw: (ctx, state) => {
      const actorId = Number(state?.actor || ctx.actor || 0) | 0;
      const itemId = Number(state?.itemId || ctx.primary || 0) | 0;
      const targetId = Number(state?.targetId || ctx.target || 0) | 0;
      const throwSpec = (state?.throw && typeof state.throw === "object") ? state.throw : null;
      const fallback = ctx.helpers.adjacentPoint(actorId);
      const to = {
        x: Number.isFinite(Number(throwSpec?.to?.x)) ? (Number(throwSpec.to.x) | 0) : (fallback.x | 0),
        y: Number.isFinite(Number(throwSpec?.to?.y)) ? (Number(throwSpec.to.y) | 0) : (fallback.y | 0),
      };
      const from = (
        Number.isFinite(Number(throwSpec?.from?.x)) && Number.isFinite(Number(throwSpec?.from?.y))
          ? { x: Number(throwSpec.from.x) | 0, y: Number(throwSpec.from.y) | 0 }
          : null
      );

      const beatitude = normalizeBeatitude(ctx.query.get(itemId, Beatitude)?.state);
      const waterType = waterTypeFromBeatitude(beatitude);

      ctx.helpers.hazardSpawn({
        kind: "wet_splash",
        medium: "floor",
        turnsLeft: 1,
        radius: 1,
        tickDamage: 0,
        damageType: "generic",
        cause: "thrown_water",
        sourceId: actorId,
        sourceKind: "potion_water",
        meta: { waterType },
      }, to);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          markWet(ctx.world, to.x + dx, to.y + dy, 15);
        }
      }

      ctx.io.emit("item:thrown", {
        actor: actorId,
        itemId,
        targetId,
        from,
        to: { ...to },
        range: Number.isFinite(Number(throwSpec?.range)) ? (Number(throwSpec.range) | 0) : null,
        maxRange: Number.isFinite(Number(throwSpec?.maxRange)) ? (Number(throwSpec.maxRange) | 0) : null,
        weight: Number.isFinite(Number(throwSpec?.weight)) ? Number(throwSpec.weight) : null,
        path: "itemHooks",
        result: { type: "water_splash", waterType },
      });
      ctx.io.emit("water:splashed", {
        actor: actorId,
        itemId,
        at: { ...to },
        waterType,
      });

      // Holy water thrown at undead: deals bonus holy damage
      if (waterType === "holy") {
        const hitIds = ctx.query.livingAt(to.x, to.y, {});
        for (const hitId of (Array.isArray(hitIds) ? hitIds : [])) {
          const ct = ctx.query.get(hitId, CreatureType);
          if (ct && ct.type === "undead") {
            ctx.rules.dealDamage({
              target: hitId, amount: 15, source: actorId,
              type: 'holy', cause: 'holy_water',
              at: { x: to.x, y: to.y },
            });
            ctx.io.emit("holy_water:undead", { actor: actorId, target: hitId, at: { ...to }, damage: 15 });
          }
        }
      }

      return { consumed: true, resultType: "water_splash", waterType };
    },
    on_dip: (ctx, state) => {
      const actorId = Number(state?.actor || ctx.actor || 0) | 0;
      const toolId = Number(state?.toolId || ctx.primary || 0) | 0;
      const targetId = Number(state?.targetId || ctx.target || 0) | 0;
      const beatitude = normalizeBeatitude(ctx.query.get(toolId, Beatitude)?.state);
      const waterType = waterTypeFromBeatitude(beatitude);

      ctx.io.emit("item:applied", {
        actor: actorId,
        toolId,
        targetId,
        result: {
          type: "water_dip",
          waterType,
        },
      });
      ctx.io.emit("water:dipped", {
        actor: actorId,
        toolId,
        targetId,
        waterType,
      });

      // Holy water on a corpse: sanctify it (prevents undead reanimation)
      const targetIdentity = String(state?.targetIdentity || "").toLowerCase();
      if (waterType === "holy" && targetIdentity.startsWith("corpse_")) {
        ctx.io.emit("corpse:holy_water", {
          actor: actorId,
          itemId: targetId,
          corpseName: targetIdentity.replace(/^corpse_/, "").replace(/_/g, " "),
          sanctified: true,
        });
      }

      return { applied: true, consumedTool: true, resultType: "water_dip", waterType };
    },
  };
}

/**
 * @param {{
 *   chargesGranted?: number | ((ctx:any, state:any) => number),
 *   messageTemplate?: string,
 * }} [opts]
 */
export function createPoisonCoatDipHook(opts = {}) {
  const resolveChargesGranted = typeof opts?.chargesGranted === "function"
    ? opts.chargesGranted
    : () => Number(opts?.chargesGranted ?? 12);
  const messageTemplate = String(
    opts?.messageTemplate
    || "You coat $targetName with poison (+$chargesGranted charges, total $chargesTotal)."
  );

  return (ctx, state) => {
    const targetInfo = state?.targetInfo;
    if (!targetInfo) return { applied: false, consumedTool: false, resultType: "nothing" };
    const currentCharges = Math.max(0, Number(targetInfo?.coating?.charges || 0) | 0);
    const grantedRaw = Number(resolveChargesGranted(ctx, state));
    const chargesGranted = Math.max(1, Number.isFinite(grantedRaw) ? (grantedRaw | 0) : 1);
    const nextCharges = currentCharges + chargesGranted;
    const coating = { kind: "poison", charges: nextCharges };
    if (opts?.coatingColor) coating.color = opts.coatingColor;
    const targetName = resolveApplyTargetName(ctx, state, "weapon");
    const message = interpolateFields(messageTemplate, {
      targetName,
      currentCharges,
      chargesGranted,
      chargesTotal: nextCharges,
    });
    ctx.helpers.patchItemInfo(state.targetId, { coating });
    ctx.io.emit("item:applied", {
      actor: state.actor,
      toolId: state.toolId,
      targetId: state.targetId,
      result: {
        type: "poison_coat",
        coating,
        chargesGranted,
        chargesTotal: nextCharges,
        message,
      },
    });
    return { applied: true, consumedTool: true, resultType: "poison_coat" };
  };
}

/**
 * Poison throw payload: spawn a persistent poison hazard at the landing tile.
 * No direct burst damage is applied on throw; damage is handled by hazard ticks.
 *
 * @param {{
 *   turnsLeft?: number,
 *   radius?: number,
 *   tickDamage?: number,
 *   medium?: "air"|"floor"|string,
 *   sourceKind?: string,
 }} [opts]
 */
export function createPoisonCloudThrowHook(opts = {}) {
  const turnsLeft = Math.max(1, Number(opts?.turnsLeft ?? 3) | 0);
  const radius = Math.max(0, Number(opts?.radius ?? 1) | 0);
  const tickDamage = Math.max(0, Number(opts?.tickDamage ?? 2) | 0);
  const medium = String(opts?.medium || "floor").toLowerCase() === "air" ? "air" : "floor";
  const sourceKind = String(opts?.sourceKind || "potion_poison") || "potion_poison";

  return (ctx, state) => {
    const actorId = Number(state?.actor || ctx.actor || 0) | 0;
    const itemId = Number(state?.itemId || ctx.primary || 0) | 0;
    const targetId = Number(state?.targetId || ctx.target || 0) | 0;
    const throwSpec = (state?.throw && typeof state.throw === "object") ? state.throw : null;

    const fromRaw = throwSpec?.from;
    const from = {
      x: Number.isFinite(Number(fromRaw?.x)) ? (Number(fromRaw.x) | 0) : 0,
      y: Number.isFinite(Number(fromRaw?.y)) ? (Number(fromRaw.y) | 0) : 0,
    };

    const toRawX = Number(throwSpec?.to?.x ?? state?.targetX ?? from.x);
    const toRawY = Number(throwSpec?.to?.y ?? state?.targetY ?? from.y);
    const at = {
      x: Number.isFinite(toRawX) ? (toRawX | 0) : from.x,
      y: Number.isFinite(toRawY) ? (toRawY | 0) : from.y,
    };

    ctx.helpers.hazardSpawn({
      kind: "poison",
      medium,
      turnsLeft,
      radius,
      tickDamage,
      damageType: "poison",
      cause: "poison_cloud",
      sourceId: itemId,
      sourceKind,
      identity: "poison_cloud",
      name: medium === "floor" ? "Poison Slick" : "Poison Cloud",
      meta: { source: "potion_poison", delivery: "thrown" },
    }, at);

    ctx.io.emit("item:thrown", {
      actor: actorId,
      itemId,
      targetId,
      from,
      to: { x: at.x, y: at.y },
      range: Number.isFinite(Number(throwSpec?.range)) ? (Number(throwSpec.range) | 0) : null,
      maxRange: Number.isFinite(Number(throwSpec?.maxRange)) ? (Number(throwSpec.maxRange) | 0) : null,
      weight: Number.isFinite(Number(throwSpec?.weight)) ? Number(throwSpec.weight) : null,
      path: "itemHooks",
      result: { type: "poison_hazard", kind: "poison", medium },
    });

    return {
      consumed: true,
      at,
      hazardKind: "poison",
      hazardMedium: medium,
    };
  };
}

/**
 * Torch throw hook: landed torches start a small floor fire without consuming
 * the torch item, so the normal base throw can still drop it on the tile.
 *
 * @param {{
 *   turnsLeft?: number,
 *   radius?: number,
 *   tickDamage?: number,
 * }} [opts]
 */
export function createTorchThrowHook(opts = {}) {
  const turnsLeft = Math.max(1, Number(opts?.turnsLeft ?? 3) | 0);
  const radius = Math.max(0, Number(opts?.radius ?? 0) | 0);
  const tickDamage = Math.max(0, Number(opts?.tickDamage ?? 2) | 0);

  return (ctx, state) => {
    const actorId = Number(state?.actor || ctx.actor || 0) | 0;
    const throwSpec = (state?.throw && typeof state.throw === "object") ? state.throw : null;
    const fallbackPoint = ctx.helpers.adjacentPoint(actorId);
    const rawLandingX = Number(throwSpec?.to?.x ?? state?.targetX);
    const rawLandingY = Number(throwSpec?.to?.y ?? state?.targetY);
    const at = {
      x: Number.isFinite(rawLandingX) ? (rawLandingX | 0) : (fallbackPoint.x | 0),
      y: Number.isFinite(rawLandingY) ? (rawLandingY | 0) : (fallbackPoint.y | 0),
    };

    ctx.helpers.hazardSpawn({
      kind: "fire",
      medium: "floor",
      turnsLeft,
      radius,
      tickDamage,
      damageType: "fire",
      cause: "torch_fire",
      sourceId: actorId,
      sourceKind: "torch",
      identity: "torch_fire",
      name: "Torch Fire",
      meta: { source: "torch", delivery: "thrown" },
    }, at);

    return { consumed: false, at, hazardKind: "fire" };
  };
}

// ── Wand Shatter on Throw ──────────────────────────────────────────────
// When a wand is thrown it shatters, releasing all remaining charges in a
// chaotic burst at the landing tile.  Each element has a different flavour:
// lightning chains, meteor explodes into fire, frost freezes, heal heals.

/**
 * @param {{
 *   element?: string,
 *   damagePerCharge?: number,
 *   radius?: number,
 *   effectKey?: string|null,
 *   effectDurationPerCharge?: number,
 *   hazardKind?: string|null,
 *   hazardTurns?: number,
 *   hazardTickDamage?: number,
 *   healPerCharge?: number,
 * }} [opts]
 */
export function createWandShatterThrowHook(opts = {}) {
  const element = String(opts?.element || "arcane");
  const damagePerCharge = Math.max(0, Number(opts?.damagePerCharge ?? 4) | 0);
  const radius = Math.max(0, Number(opts?.radius ?? 2) | 0);
  const effectKey = opts?.effectKey || null;
  const effectDurPerCharge = Math.max(0, Number(opts?.effectDurationPerCharge ?? 0) | 0);
  const hazardKind = opts?.hazardKind || null;
  const hazardTurns = Math.max(1, Number(opts?.hazardTurns ?? 3) | 0);
  const hazardTickDmg = Math.max(0, Number(opts?.hazardTickDamage ?? 0) | 0);
  const healPerCharge = Math.max(0, Number(opts?.healPerCharge ?? 0) | 0);

  return (ctx, state) => {
    const actorId = Number(state?.actor || ctx.actor || 0) | 0;
    const itemId = Number(state?.itemId || ctx.primary || 0) | 0;
    const throwSpec = (state?.throw && typeof state.throw === "object") ? state.throw : null;
    const fallback = ctx.helpers.adjacentPoint(actorId);
    const at = {
      x: Number.isFinite(Number(throwSpec?.to?.x)) ? (Number(throwSpec.to.x) | 0) : (fallback.x | 0),
      y: Number.isFinite(Number(throwSpec?.to?.y)) ? (Number(throwSpec.to.y) | 0) : (fallback.y | 0),
    };

    const charges = Math.max(1, Number(state?.info?.charges || 1) | 0);
    const totalDamage = charges * damagePerCharge;
    const totalHeal = charges * healPerCharge;
    const effectDuration = charges * effectDurPerCharge;

    // Collect all living entities in blast radius
    const hitIds = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const ids = ctx.query.livingAt(at.x + dx, at.y + dy, {});
        for (const id of (Array.isArray(ids) ? ids : [])) {
          if (!hitIds.includes(id)) hitIds.push(id);
        }
      }
    }

    for (const hitId of hitIds) {
      if (totalDamage > 0) {
        ctx.mutate.queue({
          type: "damage",
          entityId: hitId,
          amount: totalDamage,
          source: actorId,
          damageType: element,
        });
      }
      if (totalHeal > 0) {
        ctx.mutate.heal(hitId, totalHeal);
      }
      if (effectKey && effectDuration > 0) {
        ctx.helpers.addEffect(hitId, {
          key: effectKey,
          potency: 1,
          turnsLeft: effectDuration,
          onsetLeft: 0,
          peakLeft: 0,
          stack: "refresh",
          maxStacks: 1,
          sourceId: itemId,
          meta: { source: "wand_shatter", element, delivery: "thrown" },
        });
      }
    }

    if (hazardKind) {
      ctx.helpers.hazardSpawn({
        kind: hazardKind,
        medium: "floor",
        turnsLeft: hazardTurns,
        radius,
        tickDamage: hazardTickDmg || Math.ceil(totalDamage / 4),
        damageType: element,
        cause: "wand_shatter",
        sourceId: actorId,
        sourceKind: "wand",
        identity: `wand_shatter_${element}`,
        name: `${element[0].toUpperCase() + element.slice(1)} Burst`,
        meta: { source: "wand_shatter", element, delivery: "thrown" },
      }, at);
    }

    ctx.io.emit("wand:shatter", {
      actor: actorId,
      itemId,
      at: { ...at },
      element,
      charges,
      damage: totalDamage,
      heal: totalHeal,
      hitCount: hitIds.length,
    });

    return { consumed: true, at, element, charges };
  };
}

// ── Potion Splash on Throw ─────────────────────────────────────────────
// Generic factory for potions that splash their effect onto whatever is
// standing on the landing tile when thrown.

/**
 * @param {{
 *   effectKey?: string,
 *   duration?: number,
 *   potency?: number,
 *   damage?: number,
 *   damageType?: string,
 *   healPct?: number,
 *   hazardKind?: string|null,
 *   hazardTurns?: number,
 *   hazardTickDamage?: number,
 *   sourceKind?: string,
 *   eventName?: string,
 * }} [opts]
 */
export function createPotionSplashThrowHook(opts = {}) {
  const effectKey = String(opts?.effectKey || "");
  const duration = Math.max(0, Number(opts?.duration || 10) | 0);
  const potency = Number(opts?.potency ?? 1);
  const damage = Math.max(0, Number(opts?.damage || 0) | 0);
  const damageType = String(opts?.damageType || "physical");
  const healPct = Number(opts?.healPct || 0);
  const hazardKind = opts?.hazardKind || null;
  const hazardTurns = Math.max(1, Number(opts?.hazardTurns ?? 2) | 0);
  const hazardTickDmg = Math.max(0, Number(opts?.hazardTickDamage ?? 0) | 0);
  const sourceKind = String(opts?.sourceKind || "thrown_potion");
  const eventName = String(opts?.eventName || "potion:splash");

  return (ctx, state) => {
    const actorId = Number(state?.actor || ctx.actor || 0) | 0;
    const itemId = Number(state?.itemId || ctx.primary || 0) | 0;
    const throwSpec = (state?.throw && typeof state.throw === "object") ? state.throw : null;
    const fallback = ctx.helpers.adjacentPoint(actorId);
    const at = {
      x: Number.isFinite(Number(throwSpec?.to?.x)) ? (Number(throwSpec.to.x) | 0) : (fallback.x | 0),
      y: Number.isFinite(Number(throwSpec?.to?.y)) ? (Number(throwSpec.to.y) | 0) : (fallback.y | 0),
    };

    const hitIds = ctx.query.livingAt(at.x, at.y, {});
    for (const hitId of (Array.isArray(hitIds) ? hitIds : [])) {
      if (damage > 0) {
        ctx.mutate.queue({
          type: "damage",
          entityId: hitId,
          amount: damage,
          source: actorId,
          damageType,
        });
      }
      if (healPct > 0) {
        const vit = ctx.query.get(hitId, Vitality);
        if (vit) {
          const amount = Math.max(1, Math.floor((vit.maxHp | 0) * healPct));
          ctx.mutate.heal(hitId, amount);
        }
      }
      if (effectKey) {
        ctx.helpers.addEffect(hitId, {
          key: effectKey,
          potency,
          turnsLeft: duration,
          onsetLeft: 0,
          peakLeft: 0,
          stack: "refresh",
          maxStacks: 1,
          sourceId: itemId,
          meta: { source: sourceKind, delivery: "splash" },
        });
      }
    }

    if (hazardKind) {
      ctx.helpers.hazardSpawn({
        kind: hazardKind,
        medium: "floor",
        turnsLeft: hazardTurns,
        radius: 0,
        tickDamage: hazardTickDmg,
        damageType,
        cause: "potion_splash",
        sourceId: actorId,
        sourceKind,
        meta: { source: sourceKind, delivery: "thrown" },
      }, at);
    }

    ctx.io.emit(eventName, {
      actor: actorId,
      itemId,
      at: { ...at },
      effectKey: effectKey || null,
      hitCount: Array.isArray(hitIds) ? hitIds.length : 0,
    });

    return { consumed: true, at, effectKey: effectKey || null };
  };
}

export const EAT_ON_USE = createEatOnUseHook();
export const MAPPING_ON_USE = createMappingOnUseHook();
