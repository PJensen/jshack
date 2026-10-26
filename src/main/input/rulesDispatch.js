// src/main/input/rulesDispatch.js
// App-owned translation from display/input Actions → rules intents on the ECS world.
// This file is allowed to import rules and the ECS World (per Separation Manifest).

import { MoveIntent, WaitIntent, PrayIntent, DrinkIntent, CastSpellIntent, PickupIntent, DropIntent, EquipIntent, RangedAttackIntent, AttackDirectionIntent, EngraveIntent, DisarmIntent, SetPostureIntent, Position, ItemInfo, Settings, TargetLock } from "../../rules/components/index.js";
import { Equipment } from "../../rules/components/Equipment.js";
import { NamedIdentity } from "../../rules/components/NamedIdentity.js";
import { Faction } from "../../rules/components/Faction.js";
import { Vitality } from "../../rules/components/Vitality.js";
import { UseIntent } from "../../rules/components/Intents/UseIntent.js";
import { ApplyIntent } from "../../rules/components/Intents/ApplyIntent.js";
import { ThrowIntent } from "../../rules/components/Intents/ThrowIntent.js";
import { InteractIntent } from "../../rules/components/Intents/InteractIntent.js";
import { SearchIntent } from "../../rules/components/Intents/SearchIntent.js";
import { Interactable } from "../../rules/components/Interactable.js";
import { itemsAt } from "../../rules/utils/queries.js";
import { inventoryItems } from "../../rules/utils/inventoryFacade.js";
import { statusStrength } from "../../rules/utils/statusFacade.js";
import { forEachInRadius } from "../../rules/utils/spatialIndex.js";
import { chebyshevScalar } from "../../rules/utils/distance.js";
import { buildBlocksVisionMap, blockedCallback } from "../../rules/utils/vision.js";
import { hasLOS } from "../../shared/math/gridLOS.js";
import { getSpell } from "../../rules/data/spells.js";
import { getEffectiveVisionRange } from "../../rules/utils/blind.js";
import { getEntityFacingConeDegrees, getNormalizedEntityFacing } from "../../rules/utils/facing.js";
import { updateFOV, isVisible as isTileVisible } from "../../rules/environment/dungeon/exploredMap.js";
import { classifyAttackDirection } from "../../rules/utils/attackActionPolicy.js";
import { resolveInteractableAffordance } from "../../rules/interaction/interactableAffordance.js";

/**
 * Create a rules dispatcher bound to a world and an actor resolver.
 * @param {World} world - ECS world
 * @param {() => number} getActorId - Returns the current controlled actor id
 * @param {{ onAction?: (turn:number, type:string, payload:object) => void }} [opts]
 * @returns {(action:{type:string,payload?:object})=>void}
 */
export function makeRulesDispatcher(world, getActorId, opts = {}) {
  const _onAction = typeof opts.onAction === "function" ? opts.onAction : null;
  const uiTarget = /** @type {any} */ ((typeof window !== "undefined") ? window : globalThis);
  const dispatchUiEvent = (name, detail = undefined) => {
    try {
      if (uiTarget && typeof uiTarget.dispatchEvent === "function") {
        uiTarget.dispatchEvent(new CustomEvent(name, { detail }));
      }
    } catch (e) { console.debug(`[rulesDispatch] dispatch ${name}:`, e); }
  };

  return function dispatch(action) {
    // Display-side lock: used for brief blocking FX windows (e.g. thrown-item flight).
    if (typeof window !== "undefined") {
      try {
        if (/** @type {any} */ (window).__JSHACK_INPUT_LOCKED === true) return;
        if (
          /** @type {any} */ (window).__JSHACK_OPENING_AWAITING_PRAYER === true
          && String(action?.type || "") !== "rules.pray"
        ) {
          try {
            window.dispatchEvent(new CustomEvent("ui:openingPrayerOnly"));
          } catch {}
          return;
        }
      } catch (e) { console.debug('[rulesDispatch] input lock check failed:', e); }
    }

    const actorId = (typeof getActorId === "function") ? getActorId() : 0;
    if (!actorId) return;

    // Forced-wait state: any gameplay input while stunned spends the turn waiting.
    if (
      typeof action?.type === "string"
      && action.type.startsWith("rules.")
      && statusStrength(world, actorId, "stunned") > 0
    ) {
      if (_onAction) { try { _onAction(world?.step ?? 0, "rules.wait", {}); } catch {} }
      try { world?.add?.(actorId, WaitIntent, {}); } catch {}
      world?.tick?.(1);
      return;
    }

    // Record the player action for proof chain before processing.
    if (_onAction && typeof action?.type === "string" && action.type.startsWith("rules.")) {
      try { _onAction(world?.step ?? 0, action.type, action.payload || {}); } catch {}
    }

    switch (action.type) {
      case "rules.move": {
        const { dx = 0, dy = 0 } = action.payload || {};
        world?.add?.(actorId, MoveIntent, { dx, dy });
        world?.tick?.(1);
        break;
      }
      case "rules.attackDirection": {
        const { dx = 0, dy = 0, confirmed = false } = action.payload || {};
        const adx = Number(dx) | 0;
        const ady = Number(dy) | 0;
        const plan = classifyAttackDirection(world, { actorId, dx: adx, dy: ady });
        if (plan.reason === "invalid_direction") {
          world?.emit?.("attack:direction-failed", { actor: actorId, dx: adx, dy: ady, reason: plan.reason });
          break;
        }
        const ok = confirmed === true;
        if (plan.requiresConfirm && !ok) {
          const confirmedAction = {
            type: "rules.attackDirection",
            payload: { dx: adx, dy: ady, confirmed: true },
          };
          dispatchUiEvent("ui:confirmAction", {
            title: "Confirm attack",
            message: plan.message || "Attack?",
            confirmLabel: "Attack",
            cancelLabel: "Cancel",
            action: confirmedAction,
            offense: plan.offense || null,
            targetId: plan.targetId || 0,
          });
          world?.emit?.("attack:confirmation-requested", {
            actor: actorId,
            dx: adx,
            dy: ady,
            targetId: plan.targetId || 0,
            offense: plan.offense || null,
          });
          break;
        }
        world?.add?.(actorId, AttackDirectionIntent, { dx: adx, dy: ady, confirmed: ok });
        world?.tick?.(1);
        break;
      }
      case "rules.wait": {
        world?.add?.(actorId, WaitIntent, {});
        world?.tick?.(1);
        break;
      }
      case "rules.search": {
        world?.add?.(actorId, SearchIntent, {});
        world?.tick?.(1);
        break;
      }
      case "rules.cyclePosture": {
        world?.add?.(actorId, SetPostureIntent, { mode: "cycle" });
        world?.tick?.(1);
        break;
      }
      case "rules.pray": {
        world?.add?.(actorId, PrayIntent, {});
        world?.tick?.(1);
        break;
      }
      case "rules.drinkPotion": {
        const { itemId = 0, targetId = actorId } = action.payload || {};
        world?.add?.(actorId, DrinkIntent, { itemId, targetId });
        world?.tick?.(1);
        break;
      }
      case "rules.castActiveSpell": {
        const { spellId, targetId = actorId, x = null, y = null } = action.payload || {};
        if (!spellId) {
          // No spell specified (keyboard shortcut); delegate to app-side
          // active spell resolution via the same path as the Cast button.
          dispatchUiEvent('ui:castActiveSpell');
          break;
        }
        const cast = { spellId, targetId };
        if (Number.isFinite(x) && Number.isFinite(y)) {
          cast.x = Math.floor(Number(x));
          cast.y = Math.floor(Number(y));
        }
        world?.add?.(actorId, CastSpellIntent, cast);
        world?.tick?.(1);
        break;
      }
      case "rules.equipItem": {
        const { itemId = 0, targetSlot = '' } = action.payload || {};
        if (!Number.isInteger(itemId) || itemId <= 0) break;
        world?.add?.(actorId, EquipIntent, { itemId, targetSlot });
        world?.tick?.(1);
        break;
      }
      case "rules.useItem": {
        const { itemId = 0, targetId = actorId, abilityId = "", x = null, y = null } = action.payload || {};
        if (!Number.isInteger(itemId) || itemId <= 0) break;
        const use = { itemId, targetId, abilityId };
        if (Number.isFinite(x) && Number.isFinite(y)) {
          use.x = Math.floor(Number(x));
          use.y = Math.floor(Number(y));
        }
        world?.add?.(actorId, UseIntent, use);
        world?.tick?.(1);
        break;
      }
      case "rules.throwItem": {
        const { itemId = 0, targetId = 0, x = null, y = null } = action.payload || {};
        if (!Number.isInteger(itemId) || itemId <= 0) break;
        const throwIntent = { itemId, targetId };
        if (Number.isFinite(x) && Number.isFinite(y)) {
          throwIntent.x = Math.floor(Number(x));
          throwIntent.y = Math.floor(Number(y));
        }
        world?.add?.(actorId, ThrowIntent, throwIntent);
        world?.tick?.(1);
        break;
      }
      case "rules.shootRanged": {
        const actorPos = world?.get?.(actorId, Position);
        if (!actorPos) break;
        const eq = world?.get?.(actorId, Equipment);
        const rangedId = Number(eq?.ranged || 0) | 0;
        const rangedInfo = rangedId > 0 ? world?.get?.(rangedId, ItemInfo) : null;
        if (!rangedInfo) {
          world?.emit?.("message", { text: "Nothing equipped in ranged slot.", type: "system" });
          break;
        }

        const isWand = rangedInfo.type === "wand";
        const isBow = rangedInfo.subtype === "bow";
        if (!isWand && !isBow) {
          world?.emit?.("message", { text: "Nothing equipped in ranged slot.", type: "system" });
          break;
        }

        let maxRange = Number(rangedInfo.range || 0);
        if (!Number.isFinite(maxRange) || maxRange <= 0) {
          const identity = String(world?.get?.(rangedId, NamedIdentity)?.identity || "");
          const spellId = identity.startsWith("wand_") ? identity.slice(5) : "";
          const spell = spellId ? getSpell(spellId) : null;
          maxRange = Number(spell?.range || 8);
        }
        maxRange = Math.max(1, maxRange | 0);

        const px = actorPos.x | 0;
        const py = actorPos.y | 0;
        const blocked = buildBlocksVisionMap(world);
        const isBlocked = blockedCallback(blocked);
        const facing = getNormalizedEntityFacing(world, actorId) || { dx: 0, dy: 0 };
        const coneDegrees = getEntityFacingConeDegrees(world, actorId);
        const visionRange = Math.max(1, getEffectiveVisionRange(world, actorId) | 0);
        updateFOV(world?.step ?? 0, px, py, visionRange, isBlocked, {
          facingDx: facing.dx,
          facingDy: facing.dy,
          coneDegrees,
        });

        const lockedId = Number(world?.get?.(actorId, TargetLock)?.targetId || 0) | 0;
        const lockedPos = lockedId > 0 ? world?.get?.(lockedId, Position) : null;
        const lockedFaction = lockedId > 0 ? world?.get?.(lockedId, Faction)?.key : "";
        const lockedVit = lockedId > 0 ? world?.get?.(lockedId, Vitality) : null;
        const lockValid = lockedId > 0 && world?.isAlive?.(lockedId) && lockedPos && lockedVit
          && (lockedVit.hp | 0) > 0 && lockedFaction === "enemy";

        if (lockedId > 0 && !lockValid) {
          world?.remove?.(actorId, TargetLock);
          world?.emit?.("message", { text: "Your target is no longer valid.", type: "system" });
          break;
        }

        if (isBow && lockValid) {
          world?.add?.(actorId, RangedAttackIntent, {
            targetId: lockedId,
            toX: lockedPos.x | 0,
            toY: lockedPos.y | 0,
          });
          world?.tick?.(1);
          break;
        }

        if (isWand && lockValid) {
          const identity = String(world?.get?.(rangedId, NamedIdentity)?.identity || "");
          const spellId = identity.startsWith("wand_") ? identity.slice(5) : "";
          const spell = spellId ? getSpell(spellId) : null;
          const targeting = String(spell?.targeting || "enemy");
          if (targeting === "enemy" || targeting === "auto") {
            world?.add?.(actorId, UseIntent, {
              itemId: rangedId,
              targetId: lockedId,
              x: lockedPos.x | 0,
              y: lockedPos.y | 0,
            });
            world?.tick?.(1);
            break;
          }
          if (targeting === "self") {
            world?.add?.(actorId, UseIntent, { itemId: rangedId, targetId: actorId });
            world?.tick?.(1);
            break;
          }
        } else if (isWand) {
          const identity = String(world?.get?.(rangedId, NamedIdentity)?.identity || "");
          const spellId = identity.startsWith("wand_") ? identity.slice(5) : "";
          const spell = spellId ? getSpell(spellId) : null;
          const targeting = String(spell?.targeting || "enemy");
          if (targeting === "enemy" || targeting === "auto") {
            world?.emit?.("message", { text: "Select a hostile target first (Tab or tap an enemy).", type: "system" });
            break;
          }
          if (targeting === "self") {
            world?.add?.(actorId, UseIntent, { itemId: rangedId, targetId: actorId });
            world?.tick?.(1);
            break;
          }
        }

        dispatchUiEvent("ui:openRangedPointTargeting", {
          actorId,
          itemId: rangedId,
          itemName: world?.get?.(rangedId, NamedIdentity)?.name || rangedInfo.name || "ranged weapon",
          range: maxRange,
          isBow,
          isWand,
        });
        break;
      }
      case "rules.setHostileTarget": {
        const targetId = Number(action?.payload?.targetId || 0) | 0;
        const targetPos = targetId > 0 ? world?.get?.(targetId, Position) : null;
        const targetFaction = targetId > 0 ? world?.get?.(targetId, Faction)?.key : "";
        const targetVit = targetId > 0 ? world?.get?.(targetId, Vitality) : null;
        if (!(targetId > 0) || !world?.isAlive?.(targetId) || !targetPos || targetFaction !== "enemy" || !targetVit || (targetVit.hp | 0) <= 0) break;
        world?.add?.(actorId, TargetLock, { targetId });
        break;
      }
      case "rules.clearHostileTarget": {
        world?.remove?.(actorId, TargetLock);
        break;
      }
      case "rules.rangedAttack": {
        const payload = action.payload || {};
        const { targetId = 0, toX = 0, toY = 0 } = payload;
        const hasCoordinates = Number.isFinite(payload.toX) && Number.isFinite(payload.toY);
        if ((!Number.isInteger(targetId) || targetId <= 0) && !hasCoordinates) break;
        world?.add?.(actorId, RangedAttackIntent, { targetId, toX, toY });
        world?.tick?.(1);
        break;
      }
      case "rules.engrave": {
        const { text = "" } = action.payload || {};
        if (!text) break;
        world?.add?.(actorId, EngraveIntent, { text });
        world?.tick?.(1);
        break;
      }
      case "rules.applyItem": {
        const { itemId = 0, targetItemId = 0 } = action.payload || {};
        if (!Number.isInteger(itemId) || itemId <= 0) break;
        if (!Number.isInteger(targetItemId) || targetItemId <= 0) break;
        world?.add?.(actorId, ApplyIntent, { itemId, targetItemId });
        world?.tick?.(1);
        break;
      }
      case "rules.openPickupChooser": {
        const actorPos = world?.get?.(actorId, Position);
        if (!actorPos) break;

        // Gather items at actor position, then nearby tiles (death-scatter convenience).
        let pickupIds = itemsAt(world, actorPos.x, actorPos.y);
        if (pickupIds.length === 0) {
          const PICKUP_SCAN = 3;
          for (let radius = 1; radius <= PICKUP_SCAN && pickupIds.length === 0; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                const nearby = itemsAt(world, (actorPos.x | 0) + dx, (actorPos.y | 0) + dy);
                for (const id of nearby) pickupIds.push(id);
              }
            }
          }
        }

        if (pickupIds.length > 0) {
          const top = Number(pickupIds[0] || 0) | 0;
          if (top > 0) {
            world?.add?.(actorId, PickupIntent, { targetId: top });
            world?.tick?.(1);
          }
          break;
        }

        // If no floor pickup is available, open a nearby chest (same behavior as old main.js path).
        let chestTargetId = 0;
        for (const [id, pos, inter] of world.query(Position, Interactable)) {
          if ((pos.x | 0) !== (actorPos.x | 0) || (pos.y | 0) !== (actorPos.y | 0)) continue;
          if (String(inter?.action || "") !== "openChest") continue;
          if (inventoryItems(world, id).length <= 0) continue;
          chestTargetId = Number(id || 0) | 0;
          break;
        }
        if (chestTargetId > 0) {
          world?.add?.(actorId, InteractIntent, { targetId: chestTargetId });
          world?.tick?.(1);
        }
        break;
      }
      case "rules.traverseStairs": {
        const explicitTargetId = Number(action?.payload?.targetId || 0) | 0;
        const explicitDirection = String(action?.payload?.direction || "").trim().toLowerCase();

        if (explicitTargetId > 0) {
          if (explicitDirection === "return") {
            world?.emit?.("portal:return", {
              actor: actorId,
              targetId: explicitTargetId,
              portalId: explicitTargetId,
            });
          } else {
            const direction = explicitDirection === "up" ? "up" : "down";
            world?.emit?.("stair:traverse", {
              actor: actorId,
              targetId: explicitTargetId,
              direction,
            });
          }
          break;
        }

        const actorPos = world?.get?.(actorId, Position);
        if (!actorPos) break;

        // Contextual Enter behavior: pickup first, interact, then traverse.
        const underfoot = itemsAt(world, actorPos.x, actorPos.y);
        if (Array.isArray(underfoot) && underfoot.length > 0) {
          const nonCurrency = underfoot.filter((id) => {
            const info = world.get(id, ItemInfo);
            return info && info.type !== "currency";
          });
          const targetId = Number(nonCurrency[0] ?? underfoot[0] ?? 0) | 0;
          if (targetId > 0) {
            world?.add?.(actorId, PickupIntent, { targetId });
            world?.tick?.(1);
          }
          break;
        }

        let didInteract = false;
        for (const [id, pos, inter] of world.query(Position, Interactable)) {
          if (!inter) continue;
          if ((pos.x | 0) !== (actorPos.x | 0) || (pos.y | 0) !== (actorPos.y | 0)) continue;
          const targetId = Number(id || 0) | 0;
          if (!resolveInteractableAffordance(world, targetId)) continue;
          world?.add?.(actorId, InteractIntent, { targetId });
          world?.tick?.(1);
          didInteract = true;
          break;
        }
        if (didInteract) break;

        let nearest = null;
        let nearestDist = Infinity;
        for (const [id, pos, ni] of world.query(Position, NamedIdentity)) {
          const ident = String(ni?.identity || "");
          if (ident !== "stair_down" && ident !== "stair_up" && ident !== "return_portal") continue;
          const dist = chebyshevScalar(pos.x, pos.y, actorPos.x, actorPos.y);
          if (dist > 0) continue;
          const prefer = dist < nearestDist
            || (dist === nearestDist && ident === "return_portal" && nearest?.identity !== "return_portal");
          if (prefer) {
            nearestDist = dist;
            nearest = { id: Number(id || 0) | 0, identity: ident };
          }
        }
        if (!nearest?.id) break;
        if (nearest.identity === "return_portal") {
          world?.emit?.("portal:return", {
            actor: actorId,
            targetId: nearest.id,
            portalId: nearest.id,
          });
        } else {
          world?.emit?.("stair:traverse", {
            actor: actorId,
            targetId: nearest.id,
            direction: nearest.identity === "stair_down" ? "down" : "up",
          });
        }
        break;
      }
      case "rules.pickupItem": {
        // Determine which item to pick up: prefer payload.itemId; otherwise choose a ground item at actor's tile.
        const { itemId = 0, count = null } = action.payload || {};
        let targetId = 0;

        if (Number.isInteger(itemId) && itemId > 0) {
          targetId = itemId;
        } else {
          const pos = world?.get?.(actorId, Position);
          if (!pos) break;
          const ids = itemsAt(world, pos.x, pos.y);
          if (!ids || ids.length === 0) break;
          // Prefer non-currency items when multiple are present; fall back to any item (incl. currency)
          const nonCurrency = ids.filter((id) => {
            const info = world.get(id, ItemInfo);
            return info && info.type !== "currency";
          });
          targetId = (nonCurrency[0] ?? ids[0]) || 0;
        }

        if (!targetId) break;

        const intent = { targetId };
        if (Number.isFinite(count) && count > 0) intent.count = count;
        world?.add?.(actorId, PickupIntent, intent);
        world?.tick?.(1);
        break;
      }
      case "rules.dropItem": {
        const { itemId = 0, count = null } = action.payload || {};
        if (!Number.isInteger(itemId) || itemId <= 0) break;

        const intent = { itemId };
        if (Number.isFinite(count) && count > 0) intent.count = count;
        world?.add?.(actorId, DropIntent, intent);
        world?.tick?.(1);
        break;
      }
      case "rules.disarmTrap": {
        const { trapId = 0 } = action.payload || {};
        const disarm = {};
        if (Number.isInteger(trapId) && trapId > 0) disarm.trapId = trapId;
        world?.add?.(actorId, DisarmIntent, disarm);
        world?.tick?.(1);
        break;
      }
      case "rules.brewAlchemy": {
        const { benchId = 0, recipe = "" } = action.payload || {};
        if (!Number.isInteger(benchId) || benchId <= 0) break;
        const recipeKey = String(recipe || "").trim().toLowerCase();
        if (!recipeKey) break;
        world?.add?.(actorId, InteractIntent, { targetId: benchId, mode: "brew", recipe: recipeKey });
        world?.tick?.(1);
        break;
      }
      case "rules.craftEnchant": {
        const { benchId = 0, recipe = "" } = action.payload || {};
        if (!Number.isInteger(benchId) || benchId <= 0) break;
        const recipeKey = String(recipe || "").trim().toLowerCase();
        if (!recipeKey) break;
        world?.add?.(actorId, InteractIntent, { targetId: benchId, mode: "enchant", recipe: recipeKey });
        world?.tick?.(1);
        break;
      }
      case "rules.cookFood": {
        const { fireId = 0, itemId: cookItemId = 0, recipe = "" } = action.payload || {};
        if (!Number.isInteger(fireId) || fireId <= 0) break;
        const recipeKey = String(recipe || "").trim().toLowerCase();
        if (recipeKey) {
          world?.add?.(actorId, InteractIntent, { targetId: fireId, mode: "cook", recipe: recipeKey });
        } else {
          if (!Number.isInteger(cookItemId) || cookItemId <= 0) break;
          world?.add?.(actorId, InteractIntent, { targetId: fireId, mode: "cook", itemId: cookItemId });
        }
        world?.tick?.(1);
        break;
      }
      case "rules.forgeAtAnvil": {
        const { anvilId = 0, recipe = "" } = action.payload || {};
        if (!Number.isInteger(anvilId) || anvilId <= 0) break;
        const recipeKey = String(recipe || "").trim().toLowerCase();
        if (!recipeKey) break;
        world?.add?.(actorId, InteractIntent, { targetId: anvilId, mode: "forge", recipe: recipeKey });
        world?.tick?.(1);
        break;
      }
      case "rules.altarOffer": {
        const { altarId = 0, itemId = 0 } = action.payload || {};
        if (!Number.isInteger(altarId) || altarId <= 0) break;
        if (!Number.isInteger(itemId) || itemId <= 0) break;
        world?.add?.(actorId, InteractIntent, { targetId: altarId, mode: "offer", itemId });
        world?.tick?.(1);
        break;
      }
      case "rules.actionSelect": {
        const { targetId = 0, mode = "" } = action.payload || {};
        if (!Number.isInteger(targetId) || targetId <= 0) break;
        const modeStr = String(mode || "").trim();
        if (!modeStr) break;
        world?.add?.(actorId, InteractIntent, { targetId, mode: modeStr });
        world?.tick?.(1);
        break;
      }
      case "rules.interact": {
        const { targetId = 0, mode = "" } = action.payload || {};
        if (!Number.isInteger(targetId) || targetId <= 0) break;
        const modeStr = String(mode || "").trim();
        world?.add?.(actorId, InteractIntent, modeStr ? { targetId, mode: modeStr } : { targetId });
        world?.tick?.(1);
        break;
      }
      case "rules.fountainDip": {
        const { fountainId = 0, itemId = 0 } = action.payload || {};
        if (!Number.isInteger(fountainId) || fountainId <= 0) break;
        if (!Number.isInteger(itemId) || itemId <= 0) break;
        world?.add?.(actorId, InteractIntent, { targetId: fountainId, mode: "dip", itemId });
        world?.tick?.(1);
        break;
      }
      case "rules.lockpickDoorResult": {
        const { targetId = 0, success = false, reason = "" } = action.payload || {};
        if (!Number.isInteger(targetId) || targetId <= 0) break;
        world?.add?.(actorId, InteractIntent, {
          targetId,
          mode: "lockpickResult",
          success: success === true,
          reason: String(reason || ""),
        });
        world?.tick?.(1);
        break;
      }
      case "rules.quickInteract": {
        const actorPos = world?.get?.(actorId, Position);
        if (!actorPos) break;
        const px = actorPos.x | 0;
        const py = actorPos.y | 0;
        let doorTargetId = 0;
        for (const [id, pos, inter] of world.query(Position, Interactable)) {
          if (!inter || String(inter.action || "") !== "toggleDoor") continue;
          const dx = Math.abs((pos.x | 0) - px);
          const dy = Math.abs((pos.y | 0) - py);
          if ((dx + dy) !== 1) continue;
          doorTargetId = Number(id || 0) | 0;
          break;
        }
        if (!(doorTargetId > 0)) break;
        world?.add?.(actorId, InteractIntent, { targetId: doorTargetId });
        world?.tick?.(1);
        break;
      }
      case "rules.worldTap": {
        const { x = null, y = null } = action.payload || {};
        if (!Number.isFinite(x) || !Number.isFinite(y)) break;
        const tapX = Math.floor(Number(x));
        const tapY = Math.floor(Number(y));
        const actorPos = world?.get?.(actorId, Position);
        if (!actorPos) break;
        const px = actorPos.x | 0;
        const py = actorPos.y | 0;
        const set = world?.get?.(actorId, Settings);
        const pickupRange = Math.max(0, Number(set?.pickupRange ?? 0));

        const nearbyOffsets = [
          { x: 0, y: 0 },
          { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
          { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
        ];

        const inPickupRange = (xv, yv) => Math.abs((xv | 0) - px) + Math.abs((yv | 0) - py) <= pickupRange;

        const resolveInteractAt = (xv, yv) => {
          let id = 0;
          let dist = Infinity;
          let action = "";
          for (const [eid, pos, inter] of world.query(Position, Interactable)) {
            if ((pos.x | 0) !== (xv | 0) || (pos.y | 0) !== (yv | 0)) continue;
            const d = Math.abs((pos.x | 0) - px) + Math.abs((pos.y | 0) - py);
            if (d < dist) {
              dist = d;
              id = Number(eid || 0) | 0;
              action = String(inter?.action || "");
            }
          }
          return { id, dist, action };
        };

        let tx = tapX | 0;
        let ty = tapY | 0;
        let bestPickup = null;
        for (let i = 0; i < nearbyOffsets.length; i++) {
          const off = nearbyOffsets[i];
          const cx = (tapX | 0) + (off.x | 0);
          const cy = (tapY | 0) + (off.y | 0);
          const ids = itemsAt(world, cx, cy);
          if (!Array.isArray(ids) || ids.length <= 0) continue;
          if (!inPickupRange(cx, cy)) continue;
          const tapDist = Math.abs(cx - (tapX | 0)) + Math.abs(cy - (tapY | 0));
          const actorDist = Math.abs(cx - px) + Math.abs(cy - py);
          const score = tapDist * 10 + actorDist;
          if (!bestPickup || score < bestPickup.score) {
            bestPickup = { x: cx, y: cy, score };
          }
        }
        if (bestPickup) {
          tx = bestPickup.x | 0;
          ty = bestPickup.y | 0;
        } else {
          let bestInteract = null;
          for (let i = 0; i < nearbyOffsets.length; i++) {
            const off = nearbyOffsets[i];
            const cx = (tapX | 0) + (off.x | 0);
            const cy = (tapY | 0) + (off.y | 0);
            const inter = resolveInteractAt(cx, cy);
            if (!(inter.id > 0) || inter.dist > 1) continue;
            const tapDist = Math.abs(cx - (tapX | 0)) + Math.abs(cy - (tapY | 0));
            const score = tapDist * 10 + inter.dist;
            if (!bestInteract || score < bestInteract.score) {
              bestInteract = { x: cx, y: cy, score };
            }
          }
          if (bestInteract) {
            tx = bestInteract.x | 0;
            ty = bestInteract.y | 0;
          }
        }

        let interactTargetId = 0;
        let interactDist = Infinity;
        let interactAction = "";
        for (const [id, pos, inter] of world.query(Position, Interactable)) {
          if ((pos.x | 0) !== tx || (pos.y | 0) !== ty) continue;
          const dist = Math.abs((pos.x | 0) - px) + Math.abs((pos.y | 0) - py);
          if (dist < interactDist) {
            interactDist = dist;
            interactTargetId = Number(id || 0) | 0;
            interactAction = String(inter?.action || "");
          }
        }
        const canReachInteract = interactTargetId > 0 && interactDist <= 1;
        if (canReachInteract && interactAction === "openChest" && inventoryItems(world, interactTargetId).length > 0) {
          world?.add?.(actorId, InteractIntent, { targetId: interactTargetId });
          world?.tick?.(1);
          break;
        }

        const tappedItems = itemsAt(world, tx, ty);
        if (Array.isArray(tappedItems) && tappedItems.length > 0) {
          const dist = Math.abs(tx - px) + Math.abs(ty - py);
          if (dist <= pickupRange) {
            world?.add?.(actorId, PickupIntent, { targetId: tappedItems[0] });
            world?.tick?.(1);
            break;
          }
        }
        if (canReachInteract) {
          world?.add?.(actorId, InteractIntent, { targetId: interactTargetId });
          world?.tick?.(1);
          break;
        }

        const dxRaw = tx - px;
        const dyRaw = ty - py;
        if (dxRaw === 0 && dyRaw === 0) break;
        const move = (Math.abs(dxRaw) >= Math.abs(dyRaw))
          ? { dx: Math.sign(dxRaw), dy: 0 }
          : { dx: 0, dy: Math.sign(dyRaw) };
        world?.add?.(actorId, MoveIntent, move);
        world?.tick?.(1);
        break;
      }
    }
  };
}
