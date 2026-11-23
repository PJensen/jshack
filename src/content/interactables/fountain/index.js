import { defineInteractable } from "../../index.js";
import { FountainState } from "../../../rules/components/FountainState.js";
import { FountainOutcomeApplied } from "../../../rules/components/FountainOutcomeApplied.js";
import { Vitality } from "../../../rules/components/Vitality.js";
import { Mana } from "../../../rules/components/Mana.js";
import { Position } from "../../../rules/components/Position.js";
import { Beatitude } from "../../../rules/components/Beatitude.js";
import { DungeonState } from "../../../rules/components/DungeonState.js";
import { LightEmitter } from "../../../rules/components/LightEmitter.js";
import { NamedIdentity } from "../../../rules/components/NamedIdentity.js";
import { TILE_COBBLESTONE, TILE_FLOOR, TILE_GRASS } from "../../../rules/environment/dungeon/constants.js";
import { resolveLootTable } from "../../../rules/data/lootResolver.js";
import { inventoryItems } from "../../../rules/utils/inventoryFacade.js";
import { defineVerbRule } from "../../../rules/kernel/verbRule.js";
import { chanceTable } from "../../../rules/kernel/chanceTable.js";
import { RuleResult } from "../../../rules/kernel/RuleResult.js";
import { FountainDried } from "../../../events/FountainDried.js";
import { FountainDipPrompted } from "../../../events/FountainDipPrompted.js";
import { FountainDrinkResolved } from "../../../events/FountainDrinkResolved.js";
import { FountainDipResolved } from "../../../events/FountainDipResolved.js";
import { FountainPurified } from "../../../events/FountainPurified.js";
import { Teleported } from "../../../events/Teleported.js";

const HOLY_WATER_ID = "potion_holy_water";
const ACTIONS = Object.freeze([
  Object.freeze({ mode: "drink", label: "Drink" }),
  Object.freeze({ mode: "dip", label: "Dip" }),
]);
const PURIFY_ACTION = Object.freeze({ mode: "purify", label: "Purify" });

function stateOf(ctx) {
  return ctx.query.get(ctx.target, FountainState);
}

function findHolyWater(world, actor) {
  const actorId = Number(actor || 0) | 0;
  if (!(actorId > 0)) return 0;
  for (const itemId of inventoryItems(world, actorId)) {
    const named = world.get(itemId, NamedIdentity);
    if (String(named?.identity || "") === HOLY_WATER_ID) return itemId | 0;
  }
  return 0;
}

function holyWaterInInventory(ctx) {
  for (const itemId of ctx.query.inventoryItems(ctx.actor)) {
    if (ctx.query.identity(itemId) === HOLY_WATER_ID) return itemId | 0;
  }
  return 0;
}

function finishBlessedDrink(ctx) {
  ctx.mutate.upsertTimedEffect(ctx.actor, {
    key: "blessed",
    turnsLeft: 80,
    potency: 1,
    stacks: 1,
    sourceId: ctx.target,
  });
  ctx.mutate.record(FountainOutcomeApplied, {
    actor: ctx.actor,
    fountain: ctx.target,
    item: 0,
    verb: ctx.verb,
    outcome: "blessing",
    ruleId: String(ctx.params.ruleId || ""),
  });
  ctx.io.emit(new FountainDrinkResolved({
    actor: ctx.actor,
    targetId: ctx.target,
    effect: "blessing",
    turns: 80,
  }));
  return RuleResult.handled({ outcomeId: "blessing" });
}

function finish(ctx, outcomeId, event, item = 0) {
  const state = stateOf(ctx);
  const chargesRemaining = Math.max(0, (state.chargesRemaining | 0) - 1);
  const dryUntilStep = chargesRemaining > 0
    ? -1
    : ((ctx.query.worldStep() | 0) + Math.max(1, state.cooldownTurns | 0));

  ctx.mutate.patchComponent(ctx.target, FountainState, {
    chargesRemaining,
    dryUntilStep,
  });
  ctx.mutate.record(FountainOutcomeApplied, {
    actor: ctx.actor,
    fountain: ctx.target,
    item,
    verb: ctx.verb,
    outcome: outcomeId,
    ruleId: String(ctx.params.ruleId || ""),
  });
  if (event) ctx.io.emit(event);
  if (chargesRemaining <= 0) {
    ctx.io.emit(new FountainDried({
      actor: ctx.actor,
      targetId: ctx.target,
      cooldownTurns: state.cooldownTurns,
      dryUntilStep,
    }));
  }
  return RuleResult.handled({ outcomeId });
}

const drinkTable = chanceTable("fountain.drink", [
  {
    id: "primary",
    weight: 30,
    apply(ctx) {
      const state = stateOf(ctx);
      if (state.primaryEffect === "mana") {
        const mana = ctx.query.get(ctx.actor, Mana);
        if (!mana || mana.maxMana <= 0) {
          return finish(ctx, "nothing", new FountainDrinkResolved({
            actor: ctx.actor, targetId: ctx.target, effect: "nothing",
          }));
        }
        const amount = Math.max(1, Math.floor(mana.maxMana * 0.3));
        ctx.mutate.patchComponent(ctx.actor, Mana, {
          mana: Math.min(mana.maxMana, mana.mana + amount),
        });
        return finish(ctx, "mana", new FountainDrinkResolved({
          actor: ctx.actor, targetId: ctx.target, effect: "mana", amount,
        }));
      }

      const vitality = ctx.query.get(ctx.actor, Vitality);
      const amount = Math.max(1, Math.floor(vitality.maxHp * (0.2 + ctx.rng.next() * 0.2)));
      ctx.mutate.heal(ctx.actor, amount);
      return finish(ctx, "heal", new FountainDrinkResolved({
        actor: ctx.actor, targetId: ctx.target, effect: "heal", amount,
      }));
    },
  },
  {
    id: "buff",
    weight: 12,
    apply(ctx) {
      const buff = ["lucky", "keen_eye", "bear_vigor"][ctx.rng.int(0, 2)];
      const turns = ctx.rng.int(30, 69);
      ctx.mutate.upsertTimedEffect(ctx.actor, { key: buff, turnsLeft: turns, potency: 1 });
      return finish(ctx, "buff", new FountainDrinkResolved({
        actor: ctx.actor, targetId: ctx.target, effect: "buff", buff, turns,
      }));
    },
  },
  {
    id: "see-invisible",
    weight: 10,
    apply(ctx) {
      const turns = ctx.rng.int(40, 99);
      ctx.mutate.upsertTimedEffect(ctx.actor, { key: "esp_sense", turnsLeft: turns, potency: 1 });
      return finish(ctx, "see-invisible", new FountainDrinkResolved({
        actor: ctx.actor, targetId: ctx.target, effect: "see_invisible", turns,
      }));
    },
  },
  {
    id: "nothing",
    weight: 8,
    apply(ctx) {
      return finish(ctx, "nothing", new FountainDrinkResolved({
        actor: ctx.actor, targetId: ctx.target, effect: "nothing",
      }));
    },
  },
  {
    id: "gold",
    weight: 8,
    when: (ctx) => !!ctx.query.get(ctx.target, Position),
    apply(ctx) {
      const pos = ctx.query.get(ctx.target, Position);
      const amount = ctx.rng.int(8, 32);
      ctx.mutate.spawnGold(pos, amount);
      return finish(ctx, "gold", new FountainDrinkResolved({
        actor: ctx.actor, targetId: ctx.target, effect: "gold", amount,
      }));
    },
  },
  {
    id: "curse-item",
    weight: 7,
    when(ctx) {
      return ctx.query.inventoryItems(ctx.actor).some((item) =>
        ctx.query.beatitude(item) !== "cursed"
      );
    },
    apply(ctx) {
      const candidates = ctx.query.inventoryItems(ctx.actor).filter((item) =>
        ctx.query.beatitude(item) !== "cursed"
      );
      const item = candidates[ctx.rng.int(0, candidates.length - 1)];
      const cursedName = ctx.query.name(item) || "an item";
      ctx.mutate.setBeatitude(item, "cursed");
      return finish(ctx, "curse-item", new FountainDrinkResolved({
        actor: ctx.actor, targetId: ctx.target, effect: "curse", cursedName,
      }), item);
    },
  },
  {
    id: "poison",
    weight: 7,
    apply(ctx) {
      const vitality = ctx.query.get(ctx.actor, Vitality);
      const amount = Math.max(1, Math.floor(vitality.maxHp * (0.05 + ctx.rng.next() * 0.05)));
      ctx.mutate.queue({
        type: "damage",
        entityId: ctx.actor,
        amount,
        damageType: "poison",
        source: ctx.target,
      });
      return finish(ctx, "poison", new FountainDrinkResolved({
        actor: ctx.actor, targetId: ctx.target, effect: "poison", amount,
      }));
    },
  },
  {
    id: "creature",
    weight: 6,
    when: (ctx) => !!ctx.query.nearestValidTileAround(ctx.target, 2),
    apply(ctx) {
      const tile = ctx.query.nearestValidTileAround(ctx.target, 2);
      const monsterId = ctx.rng.next() < 0.5 ? "nymph" : "cave_snake";
      const spawnedName = monsterId === "nymph" ? "Water Nymph" : "Water Snake";
      ctx.mutate.spawnMonster(monsterId, tile.x, tile.y, { name: spawnedName });
      return finish(ctx, "creature", new FountainDrinkResolved({
        actor: ctx.actor, targetId: ctx.target, effect: "creature", spawnedName,
      }));
    },
  },
  {
    id: "teleport",
    weight: 5,
    apply(ctx) {
      const from = ctx.query.get(ctx.actor, Position);
      const candidates = ctx.query.loadedWalkableTiles().filter((tile) => {
        const dx = tile.x - from.x;
        const dy = tile.y - from.y;
        return (dx * dx) + (dy * dy) >= 36;
      });
      if (candidates.length === 0) {
        return finish(ctx, "nothing", new FountainDrinkResolved({
          actor: ctx.actor, targetId: ctx.target, effect: "nothing",
        }));
      }
      const to = candidates[ctx.rng.int(0, candidates.length - 1)];
      const origin = { x: from.x | 0, y: from.y | 0 };
      ctx.mutate.setPosition(ctx.actor, to);
      ctx.io.emit("moved", { id: ctx.actor, from: origin, to });
      ctx.io.emit(new Teleported({ id: ctx.actor, from: origin, to, source: "fountain" }));
      return finish(ctx, "teleport", new FountainDrinkResolved({
        actor: ctx.actor, targetId: ctx.target, effect: "teleport", from: origin, to,
      }));
    },
  },
  {
    id: "gush",
    weight: 4,
    when: (ctx) => !!ctx.query.get(ctx.target, Position),
    apply(ctx) {
      const receipt = { tilesFlooded: 0 };
      ctx.mutate.queue({
        type: "startFlood",
        entityId: ctx.target,
        params: { volume: 21, spreadPerTurn: 3, floodableTiles: [TILE_FLOOR, TILE_COBBLESTONE, TILE_GRASS] },
        receipt,
      });
      ctx.io.emitAfter(() => new FountainDrinkResolved({
        actor: ctx.actor, targetId: ctx.target, effect: "gush", tilesFlooded: receipt.tilesFlooded,
      }));
      return finish(ctx, "gush", null);
    },
  },
  {
    id: "wish",
    weight: 3,
    when: (ctx) => !!ctx.query.get(ctx.target, Position),
    apply(ctx) {
      const pos = ctx.query.get(ctx.target, Position);
      const depth = Math.max(1, Number(ctx.query.first(DungeonState)?.value?.currentDepth || 1));
      const drop = resolveLootTable("chest:magic", ctx.rng, depth, 0, {})[0];
      const receipt = drop ? ctx.mutate.materializeDrop(drop, pos) : { name: null };
      const result = finish(ctx, "wish", null);
      ctx.io.emitAfter(() => new FountainDrinkResolved({
        actor: ctx.actor,
        targetId: ctx.target,
        effect: "wish",
        wishedItem: receipt.name || null,
      }));
      return result;
    },
  },
]);

const dipTable = chanceTable("fountain.dip", [
  {
    id: "uncurse",
    weight: 30,
    when: (ctx) => ctx.query.beatitude(ctx.primary) === "cursed",
    apply(ctx) {
      ctx.mutate.setBeatitude(ctx.primary, "uncursed");
      return finish(ctx, "uncurse", new FountainDipResolved({
        actor: ctx.actor, targetId: ctx.target, itemId: ctx.primary,
        itemName: ctx.query.name(ctx.primary), effect: "uncurse",
      }), ctx.primary);
    },
  },
  {
    id: "bless",
    weight: 20,
    when: (ctx) => ctx.query.beatitude(ctx.primary) === "uncursed",
    apply(ctx) {
      ctx.mutate.setBeatitude(ctx.primary, "blessed");
      return finish(ctx, "bless", new FountainDipResolved({
        actor: ctx.actor, targetId: ctx.target, itemId: ctx.primary,
        itemName: ctx.query.name(ctx.primary), effect: "bless",
      }), ctx.primary);
    },
  },
  {
    id: "curse",
    weight: 15,
    when: (ctx) => ctx.query.beatitude(ctx.primary) !== "cursed",
    apply(ctx) {
      ctx.mutate.setBeatitude(ctx.primary, "cursed");
      return finish(ctx, "curse", new FountainDipResolved({
        actor: ctx.actor, targetId: ctx.target, itemId: ctx.primary,
        itemName: ctx.query.name(ctx.primary), effect: "curse",
      }), ctx.primary);
    },
  },
  {
    id: "nothing",
    weight: 15,
    apply(ctx) {
      return finish(ctx, "nothing", new FountainDipResolved({
        actor: ctx.actor, targetId: ctx.target, itemId: ctx.primary,
        itemName: ctx.query.name(ctx.primary), effect: "nothing",
      }), ctx.primary);
    },
  },
  {
    id: "water-reaction",
    weight: 10,
    apply(ctx) {
      const receipt = ctx.mutate.waterExposure(ctx.primary, {
        actorId: ctx.actor,
        sourceId: ctx.target,
        waterType: "plain",
      });
      const result = finish(ctx, "water-reaction", null, ctx.primary);
      ctx.io.emitAfter(() => new FountainDipResolved({
        actor: ctx.actor,
        targetId: ctx.target,
        itemId: ctx.primary,
        itemName: ctx.query.name(ctx.primary),
        effect: String(receipt.effect || "wet"),
        stacks: Number(receipt.stacks || 0) | 0,
        ruined: receipt.ruined === true,
      }));
      return result;
    },
  },
  {
    id: "creature",
    weight: 10,
    when: (ctx) => !!ctx.query.nearestValidTileAround(ctx.target, 2),
    apply(ctx) {
      const tile = ctx.query.nearestValidTileAround(ctx.target, 2);
      const monsterId = ctx.rng.next() < 0.5 ? "nymph" : "cave_snake";
      const spawnedName = monsterId === "nymph" ? "Water Nymph" : "Water Snake";
      ctx.mutate.spawnMonster(monsterId, tile.x, tile.y, { name: spawnedName });
      return finish(ctx, "creature", new FountainDipResolved({
        actor: ctx.actor, targetId: ctx.target, itemId: ctx.primary,
        itemName: ctx.query.name(ctx.primary), effect: "creature", spawnedName,
      }), ctx.primary);
    },
  },
]);

export const fountainDrinkRule = defineVerbRule({
  id: "fountain.drink",
  verb: "drink",
  when(ctx) {
    const state = stateOf(ctx);
    return !!state && state.chargesRemaining > 0 && !!ctx.query.get(ctx.actor, Vitality);
  },
  otherwise(ctx) {
    const state = stateOf(ctx);
    if (state && state.chargesRemaining <= 0) {
      ctx.io.emit(new FountainDried({
        actor: ctx.actor,
        targetId: ctx.target,
        cooldownTurns: state.cooldownTurns,
        dryUntilStep: state.dryUntilStep,
      }));
    }
    return RuleResult.unhandled({ ruleId: "fountain.drink" });
  },
  apply(ctx) {
    const state = stateOf(ctx);
    if (state?.blessed) return finishBlessedDrink(ctx);
    return drinkTable.resolve(ctx);
  },
});

export const fountainDipRule = defineVerbRule({
  id: "fountain.dip",
  verb: "dip",
  when(ctx) {
    const state = stateOf(ctx);
    return !!state
      && state.chargesRemaining > 0
      && ctx.primary > 0
      && ctx.query.alive(ctx.primary)
      && ctx.query.inventoryItems(ctx.actor).includes(ctx.primary);
  },
  otherwise(ctx) {
    const state = stateOf(ctx);
    if (state && state.chargesRemaining <= 0) {
      ctx.io.emit(new FountainDried({
        actor: ctx.actor,
        targetId: ctx.target,
        cooldownTurns: state.cooldownTurns,
        dryUntilStep: state.dryUntilStep,
      }));
    } else if (!ctx.query.inventoryItems(ctx.actor).includes(ctx.primary)) {
      ctx.io.emit(new FountainDipPrompted({
        actor: ctx.actor,
        targetId: ctx.target,
        items: ctx.query.inventoryItems(ctx.actor),
      }));
    }
    return RuleResult.unhandled({ ruleId: "fountain.dip" });
  },
  apply: (ctx) => dipTable.resolve(ctx),
});

export const fountainPurifyRule = defineVerbRule({
  id: "fountain.purify",
  verb: "purify",
  when(ctx) {
    const state = stateOf(ctx);
    return !!state
      && state.chargesRemaining > 0
      && !state.blessed
      && holyWaterInInventory(ctx) > 0;
  },
  otherwise(ctx) {
    const state = stateOf(ctx);
    if (state && state.chargesRemaining <= 0) {
      ctx.io.emit(new FountainDried({
        actor: ctx.actor,
        targetId: ctx.target,
        cooldownTurns: state.cooldownTurns,
        dryUntilStep: state.dryUntilStep,
      }));
    }
    return RuleResult.unhandled({ ruleId: "fountain.purify" });
  },
  apply(ctx) {
    const itemId = holyWaterInInventory(ctx);
    if (!(itemId > 0)) return RuleResult.unhandled({ ruleId: "fountain.purify" });
    ctx.mutate.consume(itemId, ctx.actor);
    ctx.mutate.patchComponent(ctx.target, FountainState, {
      blessed: true,
      chargesRemaining: Math.max(1, Number(stateOf(ctx)?.chargesRemaining || 0) | 0),
      dryUntilStep: -1,
    });
    if (ctx.query.has(ctx.target, LightEmitter)) {
      ctx.mutate.patchComponent(ctx.target, LightEmitter, {
        radius: 5.2,
        baseColor: "#fff0aa",
        temporalPattern: "holy",
        shadowSoftness: 4,
        colorShiftScale: 0.45,
      });
    }
    ctx.mutate.record(FountainOutcomeApplied, {
      actor: ctx.actor,
      fountain: ctx.target,
      item: itemId,
      verb: ctx.verb,
      outcome: "purify",
      ruleId: String(ctx.params.ruleId || ""),
    });
    ctx.io.emit(new FountainPurified({
      actor: ctx.actor,
      targetId: ctx.target,
      itemId,
      itemName: ctx.query.name(itemId) || "holy water",
    }));
    return RuleResult.handled({ outcomeId: "purify" });
  },
});

defineInteractable("fountain", {
  defaultVerb: "drink",
  actions(world, targetId, ctx = {}) {
    const state = world.get(targetId, FountainState);
    if (!state || state.chargesRemaining <= 0) return [];
    if (state.blessed || !(findHolyWater(world, ctx.actor) > 0)) return ACTIONS;
    return Object.freeze([...ACTIONS, PURIFY_ACTION]);
  },
  verbs: {
    drink: fountainDrinkRule,
    dip: fountainDipRule,
    purify: fountainPurifyRule,
  },
});

export const FOUNTAIN_DRINK_OUTCOMES = drinkTable.entries;
export const FOUNTAIN_DIP_OUTCOMES = dipTable.entries;
