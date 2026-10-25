// src/main/ui/inventoryDataProvider.js
// addEventListener handlers that feed inventory, usable, throwable, apply,
// message-log and death-log data to display overlays.

import { playerEntity, itemsAt, findNearestValidTileAround } from "../../rules/utils/queries.js";
import { Inventory } from "../../rules/components/Inventory.js";
import { getCarriedWeight, inventoryItems } from "../../rules/utils/inventoryFacade.js";
import { Equipment, GEAR_SLOTS, GEAR_SLOT_SET, getEquippedSlot } from "../../rules/components/Equipment.js";
import { ItemInfo } from "../../rules/components/ItemInfo.js";
import { NamedIdentity } from "../../rules/components/NamedIdentity.js";
import { Position } from "../../rules/components/Position.js";
import { Faction } from "../../rules/components/Faction.js";
import { Owner } from "../../rules/components/Owner.js";
import { Unpaid } from "../../rules/components/Unpaid.js";
import { Settings } from "../../rules/components/Settings.js";
import { Vitality } from "../../rules/components/Vitality.js";
import { Mana } from "../../rules/components/Mana.js";
import { Stamina } from "../../rules/components/Stamina.js";
import { Hunger } from "../../rules/components/Hunger.js";
import { DungeonState } from "../../rules/components/DungeonState.js";
import { CalendarState } from "../../rules/components/CalendarState.js";
import { Speed } from "../../rules/components/Speed.js";
import { getSpell, describeSpellDetailLines, describeSpellTargetEffects } from "../../rules/data/spells.js";
import { getCalendarDate } from "../../rules/data/calendar.js";
import { getHungerLevel } from "../../rules/data/food.js";
import { resolveCombatSnapshot } from "../../rules/utils/resolveCombatSnapshot.js";
import { resolveCanonicalStats } from "../../rules/utils/canonicalStats.js";
import { isApplyTool, listApplyTargetsForTool, resolveApplyPayloadForWorld } from "../../rules/content/items/applyPayloads.js";
import { resolveItemDisplayName, resolveAffixes, buildItemDisplayData as _buildItemDisplayData } from "../wiring/itemName.js";
import { makeRulesDispatcher } from "../input/rulesDispatch.js";
import { getIdentifiedSnapshot, isIdentificationEnabled, setIdentificationEnabled } from "../../rules/data/identification.js";
import { createItemById, listAllItemIds } from "../../rules/utils/itemFactory.js";
import { ScriptState } from "../../rules/components/ScriptState.js";
import { Charges } from "../../rules/components/Charges.js";
import { getCatalogItem } from "../../rules/data/itemCatalog.js";
import { addToInventory } from "../../rules/utils/inventoryFacade.js";
import { listAllMonsterIds } from "../../rules/data/monsters.js";
import { Pet } from "../../rules/components/Pet.js";
import { PetState } from "../../rules/components/PetState.js";
import { FOV_CONE_DISABLED_KEY, isFacingTurnCostEnabled, setFacingTurnCostEnabled } from "../../rules/utils/facing.js";
import { getItemCooldown } from "../../rules/utils/itemCooldowns.js";
import { groupDisplayItems } from "./itemGrouping.js";
import { spawnDebugMonsterNearPlayer } from "../debug/spawnDebugMonster.js";
import { getGemPricingSnapshot } from "../../rules/data/gemPricing.js";
import { getSavegameRegistryNames, serializeSavegameWorld } from "../wiring/savegameSerializationRegistry.js";
import { isChestIdentity } from "../../shared/chests.js";
import { readAISettings, writeAISettings } from "../../shared/aiSettings.js";
import { getPassiveBonuses } from "../../rules/utils/passiveBonuses.js";
import { QuestDefRef } from "../../rules/components/QuestDefRef.js";
import { QuestState } from "../../rules/components/QuestState.js";
import { QuestVars } from "../../rules/components/QuestVars.js";
import { getCarryCapacity, resolveEncumbrance } from "../../rules/utils/encumbrance.js";
import { Traits } from "../../rules/components/Traits.js";
import { getQuestDef } from "../../rules/quests/registry.js";
import { buildPalette } from "../../display/palette/index.js";
import { getItemHooksByIdentity } from "../../rules/content/items/itemHooks.js";
import { questRewardDetailText } from "./questRewards.js";
import { defineExtension } from "../../lib/ecs-js/index.js";
import { buildEffectRows } from "./effectRows.js";

const TRAIT_DISPLAY = Object.freeze({
  iron_stomach:  { label: "Iron Stomach",  description: "Halves sickness chance from spoiled food." },
  ambidextrous:  { label: "Ambidextrous",  description: "No off-hand penalties when dual-wielding." },
  gluttonous:    { label: "Gluttonous",    description: "Increased deity reaction to food events." },
});

const _installed = Symbol.for('inventoryDataProvider');
const _providers = new WeakMap();
const _uiEventTarget = globalThis.window || globalThis;
const _itemPalette = buildPalette();

function buildEncumbranceData(world, actorId) {
  const current = getCarriedWeight(world, actorId);
  return resolveEncumbrance(current, getCarryCapacity(world, actorId));
}

function titleCaseWords(value) {
  return String(value || "")
    .split(/[\s_\-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function questJournalFlavorText(questDef, vars, questId) {
  const explicit = String(questDef?.journal?.flavorText || vars?.journalFlavorText || "").trim();
  if (explicit) return explicit;

  const district = String(vars?.sourceLabel || vars?.sourceDistrict || "").trim();
  if (district) {
    return `The town board posted this work for ${district}. Finish the route and report back with proof the job is done.`;
  }

  if (String(questId || "") === "starter.priest_fetch") {
    return "The priest swore a forbidden volume was lost beneath town. He wants it recovered before grave-damp and grave-robbers ruin it completely.";
  }
  if (String(questId || "") === "starter.rat_infestation") {
    return "The barkeep wants the cellar cleared before vermin spread through the kegs, floorboards, and sleeping rooms.";
  }
  if (String(questId || "") === "run.contract") {
    return "Town wants a visible victory. Bring back a named trophy and make sure everyone knows the roads are safer for it.";
  }

  return "A standing job logged in your journal.";
}

function questJournalRewardText(questDef, vars, questId) {
  return questRewardDetailText(questDef, vars);
}

function questJournalCompletionText(state, vars) {
  const status = String(state?.status || "active");
  if (status === "complete") {
    const completed = String(vars?.completionText || vars?.objective || "").trim();
    return completed || "Quest complete.";
  }

  const objective = String(vars?.objective || "").trim();
  if (objective) return objective;

  const progress = Math.max(0, Number(vars?.progress || 0) | 0);
  const target = Math.max(0, Number(vars?.target || 0) | 0);
  if (target > 0) return `Progress: ${progress}/${target}`;

  return "";
}

/**
 * Install event listeners that supply inventory/use/throw/apply/message/death
 * data to the display overlays.
 *
 * @param {{
 *   world: import('../../lib/ecs-js/index.js').World,
 *   getActiveSpellId: () => string|null,
 *   isSimUiBlocked: () => boolean,
 *   getMessageLog: () => { getEntries(): any[] },
 *   tombstoneRepo: { getAll(): any[] },
 * }} deps
 * @returns {{ buildGroundPickupDetailAt: (actorId: number, x: number, y: number) => object|null }}
 */
export function installInventoryDataProvider({ world, getActiveSpellId, isSimUiBlocked, getMessageLog, tombstoneRepo }) {
  if (_providers.has(world)) return _providers.get(world);
  let provider;
  world.install(defineExtension("jshack:main:inventoryDataProvider", () => {
    provider = createInventoryDataProvider({ world, getActiveSpellId, isSimUiBlocked, getMessageLog, tombstoneRepo });
  }, { key: _installed }));
  _providers.set(world, provider);
  return provider;
}

function createInventoryDataProvider({ world, getActiveSpellId, isSimUiBlocked, getMessageLog, tombstoneRepo }) {

  function findScrollOfIdentify(playerId) {
    for (const id of inventoryItems(world, playerId)) {
      const ni = world.get(id, NamedIdentity);
      if (ni && ni.identity === 'scroll_identify') return id;
    }
    return 0;
  }

  function buildItemDisplayData(info, itemId) {
    const base = _buildItemDisplayData(world, itemId) || {
      id: itemId,
      type: info.type || 'item',
      name: resolveItemDisplayName(world, itemId),
      slot: info.slot || '',
      count: 1,
      rarityName: 'common',
      description: '',
      bonuses: {},
      affixes: [],
      damageDice: null,
      staminaCost: null,
      twoHanded: false,
      coating: null,
    };
    const identity = String(base?.identity || world.get(itemId, NamedIdentity)?.identity || "");
    const hooks = getItemHooksByIdentity(identity);
    const canUse = typeof hooks.beforeUse === "function"
      || typeof hooks.onUse === "function"
      || typeof hooks.afterUse === "function"
      || !!getCatalogItem(identity)?._contentDefaultAbility;
    const p = _itemPalette[identity] || null;
    // Content-DSL status lines: read ScriptState, call authored status function
    let contentStatus = null;
    const catDef = getCatalogItem(identity);
    if (catDef?._contentStatus) {
      const ss = world.get(itemId, ScriptState);
      if (ss?.data) {
        try { contentStatus = catDef._contentStatus(ss.data); } catch {}
      }
    }
    const charges = world.get(itemId, Charges);
    if (charges) contentStatus = [
      { text: `Charges: ${charges.current}/${charges.max}`, color: charges.current > 0 ? '#cfe8ff' : '#888888' },
      ...(contentStatus || []),
    ];
    return {
      ...base,
      canUse,
      glyph: String(base?.glyph || p?.glyph || ""),
      glyphColor: String(base?.glyphColor || p?.fg || "#cfe8ff"),
      contentStatus,
      ...(charges ? { charges: { current: charges.current, max: charges.max } } : {}),
    };
  }

  const _slotMap = Object.freeze({
    ...Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, [slot]])),
    ring: ['ring1', 'ring2'],
  });

  function buildEquippedComparison(eq, slot, currentItemId) {
    const fields = _slotMap[slot];
    if (!fields) return null;
    for (const field of fields) {
      const eqId = eq[field];
      if (!Number.isInteger(eqId) || eqId <= 0 || eqId === currentItemId) continue;
      const eqInfo = world.get(eqId, ItemInfo);
      if (!eqInfo) continue;
      return {
        name: resolveItemDisplayName(world, eqId),
        bonuses: eqInfo.bonuses || {},
        damageDice: eqInfo.damageDice || null,
        staminaCost: eqInfo.staminaCost ?? null,
        twoHanded: !!eqInfo.twoHanded,
        affixes: resolveAffixes(eqInfo.affixes),
      };
    }
    return null;
  }

  function buildEquippedBySlot(eq) {
    const out = Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, { item: null, blocked: false }]));
    if (!eq) return out;

    for (const slot of GEAR_SLOTS) {
      const eqId = Number(eq[slot] || 0) | 0;
      if (!(eqId > 0)) continue;
      const info = world.get(eqId, ItemInfo);
      if (!info) continue;
      out[slot] = {
        item: buildItemDisplayData(info, eqId),
        blocked: false,
      };
    }

    const weaponId = Number(eq.weapon || 0) | 0;
    const weaponInfo = weaponId > 0 ? world.get(weaponId, ItemInfo) : null;
    if (weaponInfo?.twoHanded) {
      out.offhand = {
        ...out.offhand,
        blocked: true,
        blockedBy: "weapon",
        reason: "Two-hand",
      };
    }

    return out;
  }

  function buildActiveSpellItem() {
    const activeSpellId = String(getActiveSpellId() || "").trim();
    const spell = activeSpellId ? getSpell(activeSpellId) : null;
    if (!spell) return null;
    return {
      id: `spell:${spell.id}`,
      type: "spell",
      name: spell.symbol ? `${spell.symbol} ${spell.name}` : spell.name,
      description: String(spell.description || "").trim(),
      detailLines: describeSpellDetailLines(spell),
      targetEffects: describeSpellTargetEffects(spell),
    };
  }

  function buildStatusRows(playerId) {
    return buildEffectRows(world, playerId);
  }

  function sumPlayerGold(playerId) {
    if (!(playerId > 0)) return 0;
    let total = 0;
    for (const id of inventoryItems(world, playerId)) {
      const info = world.get(id, ItemInfo);
      if (!info || info.type !== 'currency') continue;
      total += Math.max(0, Number(info.count || 0) | 0);
    }
    return Math.max(0, total | 0);
  }

  function buildGroundPickupDetailAt(actorId, x, y) {
    const tx = Number.isFinite(x) ? (x | 0) : 0;
    const ty = Number.isFinite(y) ? (y | 0) : 0;
    const ids = [...itemsAt(world, tx, ty)];
    const groundIds = [...ids];
    // Include chest contents on the tile.
    let chestId = 0;
    for (const [eid, pos, ni] of world.query(Position, NamedIdentity)) {
      if (!isChestIdentity(ni.identity) || pos.x !== tx || pos.y !== ty) continue;
      chestId = eid;
      for (const itemId of inventoryItems(world, eid)) ids.push(itemId);
    }

    const nonCurrencyItems = [];
    for (const itemId of ids) {
      const info = world.get(itemId, ItemInfo);
      if (!info || info.type === 'currency') continue;
      nonCurrencyItems.push(buildItemDisplayData(info, itemId));
    }

    const groupedItems = groupDisplayItems(nonCurrencyItems);
    const totalCount = groupedItems.reduce((sum, item) => sum + Math.max(1, Number(item?.count || 0) | 0), 0);

    const rawFloorItems = [];
    for (const itemId of groundIds) {
      const info = world.get(itemId, ItemInfo);
      if (!info || info.type === 'currency') continue;
      rawFloorItems.push(buildItemDisplayData(info, itemId));
    }
    const floorStackItems = groupDisplayItems(rawFloorItems);

    if (!groupedItems.length && !chestId) return null;

    const withChestMeta = (detail) => {
      if (!chestId || !detail || typeof detail !== "object") return detail;
      const chestNi = world.get(chestId, NamedIdentity);
      const chestName = (chestNi && chestNi.name) || "Chest";
      return { ...detail, chestId, chestName };
    };

    // Only show chest UI when there are no floor items to pick up first.
    if (chestId && !floorStackItems.length) {
      const chestNi = world.get(chestId, NamedIdentity);
      const chestName = (chestNi && chestNi.name) || "Chest";
      return {
        mode: 'multi',
        count: totalCount,
        items: groupedItems,
        fromChest: true,
        chestId,
        chestName,
      };
    }

    if (floorStackItems.length > 1) {
      return withChestMeta({
        mode: 'stack',
        count: floorStackItems.reduce((sum, item) => sum + Math.max(1, Number(item?.count || 0) | 0), 0),
        items: floorStackItems,
        stackIndex: 0,
      });
    }

    const single = floorStackItems[0] || groupedItems[0];
    const set = world.get(actorId, Settings);
    const pickupRange = Math.max(0, Number(set?.pickupRange ?? 0));
    return withChestMeta({
      mode: 'single',
      item: single,
      pickupRange,
    });
  }

  const SLOT_FILTER_MAP = Object.freeze({
    ring1: 'ring',
    ring2: 'ring',
  });
  /**
   * @param {any} raw
   * @returns {string|null}
   */
  function normalizeSlotFilter(raw) {
    const slot = String(raw || '').trim().toLowerCase();
    if (!slot) return null;
    return SLOT_FILTER_MAP[slot] || slot;
  }
  /**
   * @param {any} it
   * @param {string|null} slotFilter
   * @returns {boolean}
   */
  function matchesSlotFilter(it, slotFilter) {
    if (!slotFilter) return true;
    if (!it || !Number.isInteger(it.id) || it.id <= 0) return false;
    const itemSlot = String(it.slot || '').toLowerCase();
    const itemType = String(it.type || '').toLowerCase();
    if (slotFilter === 'ammo') return itemType === 'ammo' || itemSlot === 'ammo';
    if (slotFilter === 'ranged') return itemSlot === 'ranged' || itemType === 'wand';
    return itemSlot === slotFilter;
  }

  // Provide inventory data to overlay when requested
  addEventListener('ui:requestInventoryData', (ev) => {
    const slotFilter = normalizeSlotFilter(ev?.detail?.slotFilter);
    const p = playerEntity(world);
    const items = [];
    let ground = null;
    let equippedBySlot = Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, { item: null, blocked: false }]));
    if (p) {
      const inv = world.get(p.id, Inventory);
      const eq = world.get(p.id, Equipment);
      equippedBySlot = buildEquippedBySlot(eq);
      for (const id of inventoryItems(world, p.id)) {
        const info = world.get(id, ItemInfo);
        if (!info || info.type === 'currency') continue;
        const equippedSlot = eq ? getEquippedSlot(eq, id) : null;
        const applyTargetIds = listApplyTargetsForTool(world, p.id, id);
        const applyTargetCount = applyTargetIds.length;
        const canApply = isApplyTool(world, p.id, id);
        const cooldown = getItemCooldown(world, id);
        items.push({
          ...buildItemDisplayData(info, id),
          equipped: Boolean(equippedSlot),
          equippedSlot,
          equippedComparison: null,
          unpaid: world.has(id, Unpaid),
          unpaidPrice: world.get(id, Unpaid)?.price || 0,
          unpaidShopkeeperId: world.get(id, Unpaid)?.shopkeeperId || 0,
          canApply,
          applyTargetCount,
          cooldownTurnsRemaining: cooldown?.remaining ?? 0,
          cooldownTurnsMax: cooldown?.max ?? 0,
        });
      }
      // Attach comparison data for unequipped equippable items
      if (eq) {
        for (const it of items) {
          if (it.equipped || !(it.type === 'equip' || it.type === 'ammo' || it.type === 'wand' || it.slot === 'ranged')) continue;
          it.equippedComparison = buildEquippedComparison(eq, it.slot, it.id);
        }
      }
      ground = buildGroundPickupDetailAt(p.id, p.pos.x, p.pos.y);
    }
      const bagItems = items.filter((it) => !GEAR_SLOT_SET.has(String(it?.equippedSlot || "")));
      const groupedBagItems = groupDisplayItems(bagItems);
      const filteredItems = slotFilter ? groupedBagItems.filter((it) => matchesSlotFilter(it, slotFilter)) : groupedBagItems;
    const scrollOfIdentifyId = p ? findScrollOfIdentify(p.id) : 0;
    let encumbrance = null;
    if (p) {
      encumbrance = buildEncumbranceData(world, p.id);
    }
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:inventoryData', {
      detail: {
        items: filteredItems,
        bagItems: groupedBagItems,
        equippedBySlot,
        ground,
        slotFilter,
        scrollOfIdentifyId,
        encumbrance,
      },
    }));
  });

  addEventListener('ui:requestCharacterData', () => {
    const p = playerEntity(world);
    let equippedBySlot = Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, { item: null, blocked: false }]));
    let playerName = 'Hero';
    let calendar = null;
    const stats = {
      strength: 0,
      dexterity: 0,
      intelligence: 0,
      vitalityStat: 0,
      accuracy: 0,
      damagePower: 0,
      evade: 0,
      mitigation: 0,
      spellPower: 0,
      hp: 0,
      maxHp: 0,
      mana: 0,
      maxMana: 0,
      stamina: 0,
      maxStamina: 0,
      attack: 0,
      defense: 0,
      armorClass: 10,
      luck: 0,
      critChancePercent: 0,
      critMult: 0,
      damageFlatBonus: 0,
      manaRegen: 0,
      manaRegenDerived: 0,
      staminaRegen: 0,
      staminaRegenDerived: 0,
      maxHpDerived: 0,
      speed: 1,
      kineticDR: 0,
      fireResist: 0,
      poisonResist: 0,
      acidResist: 0,
      radiationResist: 0,
      electricResist: 0,
      bluntResist: 0,
      slashResist: 0,
      pierceResist: 0,
      hunger: 0,
      hungerLevel: "normal",
      gold: 0,
      turn: Math.max(0, Number(world.step || 0) | 0),
      depth: 0,
    };
    let activeEffects = [];
    const traits = [];
    equippedBySlot.brain = { item: null, blocked: false };
    if (p) {
      const eq = world.get(p.id, Equipment);
      const passive = getPassiveBonuses(world, p.id);
      const vit = world.get(p.id, Vitality);
      const mana = world.get(p.id, Mana);
      const stamina = world.get(p.id, Stamina);
      const hunger = world.get(p.id, Hunger);
      const combat = resolveCombatSnapshot(world, p.id, { mode: "melee" });
      const canonical = resolveCanonicalStats(world, p.id);
      equippedBySlot = buildEquippedBySlot(eq);
      equippedBySlot.brain = { item: null, blocked: false };
      playerName = String(world.get(p.id, NamedIdentity)?.name || 'Hero');
      const spellItem = buildActiveSpellItem();
      if (spellItem) {
        equippedBySlot.brain = { item: spellItem, blocked: false };
      }
      const maxManaBonus = Number(passive?.maxManaDerived ?? 0);
      const maxStaminaBonus = Number(passive?.maxStaminaDerived ?? 0);
      const rawHunger = Math.max(0, Number(hunger?.hunger || 0) | 0);
      const hungerLevel = (hunger?.satiation > 0) ? "satiated" : getHungerLevel(rawHunger);
      stats.hp = Math.max(0, Number(vit?.hp || 0) | 0);
      stats.maxHp = Math.max(0, Number(vit?.maxHp || 0) | 0);
      stats.mana = Math.max(0, Number(mana?.mana || 0) | 0);
      stats.maxMana = Math.max(0, (Number(mana?.maxMana || 0) | 0) + maxManaBonus);
      stats.stamina = Math.max(0, Number(stamina?.stamina || 0) | 0);
      stats.maxStamina = Math.max(0, (Number(stamina?.maxStamina || 0) | 0) + maxStaminaBonus);
      stats.strength = Number(canonical?.strength || 0);
      stats.dexterity = Number(canonical?.dexterity || 0);
      stats.intelligence = Number(canonical?.intelligence || 0);
      stats.vitalityStat = Number(canonical?.vitality || 0);
      stats.accuracy = Number(canonical?.accuracy || 0);
      stats.damagePower = Number(canonical?.damagePower || 0);
      stats.evade = Number(canonical?.evade || 0);
      stats.mitigation = Number(canonical?.mitigation || 0);
      stats.spellPower = Number(canonical?.spellPower || 0);
      stats.attack = Math.max(0, Number(combat?.attackBonus ?? (1 + stats.accuracy)));
      stats.defense = Math.max(0, Number(stats.evade));
      stats.armorClass = Math.max(0, Number(combat?.armorClass ?? (10 + stats.defense)));
      stats.luck = Number(combat?.luck ?? canonical?.luck ?? 0);
      stats.critChancePercent = (Number(combat?.critChance ?? canonical?.critChancePhysical ?? 0) * 100) + stats.luck;
      stats.critMult = Number(combat?.critMult ?? canonical?.critMultPhysical ?? 0);
      stats.damageFlatBonus = Number(combat?.damageFlatBonus ?? 0);
      stats.manaRegen = Number(mana?.manaRegen ?? 0) + Number(passive?.manaRegenDerived ?? 0);
      stats.manaRegenDerived = Number(passive?.manaRegenDerived ?? 0);
      stats.staminaRegen = Number(stamina?.staminaRegen ?? 0) + Number(passive?.staminaRegenDerived ?? 0);
      stats.staminaRegenDerived = Number(passive?.staminaRegenDerived ?? 0);
      const encumbrance = buildEncumbranceData(world, p.id);
      stats.carryWeight = encumbrance.current;
      stats.carryLimit = encumbrance.limit;
      stats.carryState = encumbrance.overloaded ? "overloaded"
        : encumbrance.heavilyLoaded ? "burdened"
        : "unburdened";
      stats.maxHpDerived = Number(passive?.maxHpDerived ?? 0);
      const spd = world.get(p.id, Speed);
      stats.speed = Number(spd?.actEvery ?? 1);
      stats.kineticDR = Number(canonical?.kineticDR ?? 0);
      stats.fireResist = Number(canonical?.fireResist ?? 0);
      stats.poisonResist = Number(canonical?.poisonResist ?? 0);
      stats.acidResist = Number(canonical?.acidResist ?? 0);
      stats.radiationResist = Number(canonical?.radiationResist ?? 0);
      stats.electricResist = Number(canonical?.electricOhms ?? 0);
      stats.bluntResist = Number(canonical?.bluntResist ?? 0);
      stats.slashResist = Number(canonical?.slashResist ?? 0);
      stats.pierceResist = Number(canonical?.pierceResist ?? 0);
      stats.hunger = rawHunger;
      stats.hungerLevel = String(hungerLevel || "normal");
      stats.gold = sumPlayerGold(p.id);
      activeEffects = buildStatusRows(p.id);
      const traitComp = world.get(p.id, Traits);
      if (traitComp) {
        for (const [key, meta] of Object.entries(TRAIT_DISPLAY)) {
          if (traitComp[key]) traits.push({ key, label: meta.label, description: meta.description });
        }
      }
      for (const [, ds] of world.query(DungeonState)) {
        stats.depth = Math.max(0, Number(ds?.currentDepth || 0) | 0);
        break;
      }
    }
    for (const [, cs] of world.query(CalendarState)) {
      calendar = getCalendarDate(world.step, cs.startDay, cs.startYear);
      break;
    }
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:characterData', {
      detail: { equippedBySlot, playerName, stats, activeEffects, traits, calendar },
    }));
  });

  addEventListener('ui:requestEquipmentData', () => {
    const p = playerEntity(world);
    let equippedBySlot = Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, { item: null, blocked: false }]));
    let playerName = 'Hero';
    let encumbrance = null;
    equippedBySlot.brain = { item: null, blocked: false };
    if (p) {
      const eq = world.get(p.id, Equipment);
      equippedBySlot = buildEquippedBySlot(eq);
      equippedBySlot.brain = { item: null, blocked: false };
      playerName = String(world.get(p.id, NamedIdentity)?.name || 'Hero');
      encumbrance = buildEncumbranceData(world, p.id);
      const spellItem = buildActiveSpellItem();
      if (spellItem) {
        equippedBySlot.brain = { item: spellItem, blocked: false };
      }
    }
    const scrollOfIdentifyId = p ? findScrollOfIdentify(p.id) : 0;
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:equipmentData', {
      detail: { equippedBySlot, playerName, scrollOfIdentifyId, encumbrance },
    }));
  });

  // Provide usable items to the use-chooser overlay when requested
  const USABLE_TYPES = new Set(['wand', 'scroll', 'book', 'learn', 'food', 'potion', 'tool']);
  addEventListener('ui:requestUsableItemsData', () => {
    const p = playerEntity(world);
    const items = [];
    if (p) {
      for (const id of inventoryItems(world, p.id)) {
        const info = world.get(id, ItemInfo);
        if (!info || !USABLE_TYPES.has(info.type)) continue;
        items.push(buildItemDisplayData(info, id));
      }
    }
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:usableItemsData', { detail: { items: groupDisplayItems(items) } }));
  });

  // Provide all inventory items to the throw-chooser overlay when requested
  addEventListener('ui:requestThrowableItemsData', () => {
    const p = playerEntity(world);
    const items = [];
    if (p) {
      for (const id of inventoryItems(world, p.id)) {
        const info = world.get(id, ItemInfo);
        if (!info) continue;
        items.push(buildItemDisplayData(info, id));
      }
    }
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:throwableItemsData', { detail: { items: groupDisplayItems(items) } }));
  });

  // Provide applicable tools to the apply-tool chooser
  addEventListener('ui:requestApplyToolsData', () => {
    const p = playerEntity(world);
    const items = [];
    if (p) {
      for (const id of inventoryItems(world, p.id)) {
        if (!isApplyTool(world, p.id, id)) continue;
        items.push({ id, name: resolveItemDisplayName(world, id) });
      }
    }
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:applyToolsData', { detail: { items } }));
  });

  // Provide socketable gems for a weapon's "Add Gem" selector
  addEventListener('ui:requestSocketableGemsData', (ev) => {
    const weaponId = Number(ev?.detail?.weaponId || 0) | 0;
    const p = playerEntity(world);
    const items = [];
    if (p && weaponId > 0) {
      for (const id of inventoryItems(world, p.id)) {
        if (id === weaponId) continue;
        const { payloadDef } = resolveApplyPayloadForWorld(world, { actor: p.id, toolId: id, targetId: weaponId });
        if (payloadDef) items.push({ id, name: resolveItemDisplayName(world, id) });
      }
    }
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:socketableGemsData', { detail: { items, weaponId } }));
  });

  // Provide filtered targets for an apply tool
  addEventListener('ui:requestApplyTargetsData', (ev) => {
    const toolId = ev?.detail?.toolId || 0;
    const p = playerEntity(world);
    const items = [];
    if (p && toolId) {
      const targetIds = listApplyTargetsForTool(world, p.id, toolId);
      for (let i = 0; i < targetIds.length; i++) {
        const id = targetIds[i];
        const info = world.get(id, ItemInfo);
        items.push({ id, name: resolveItemDisplayName(world, id), description: info?.description || '' });
      }
    }
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:applyTargetsData', { detail: { items } }));
  });

  // When user confirms an apply action from the UI
  addEventListener('ui:requestApply', (ev) => {
    if (isSimUiBlocked()) return;
    const toolId = ev?.detail?.toolId || 0;
    const targetItemId = ev?.detail?.targetItemId || 0;
    if (!toolId || !targetItemId) return;
    const rulesHandler = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0));
    rulesHandler({ type: 'rules.applyItem', payload: { itemId: toolId, targetItemId } });
  });

  // Provide message log entries
  addEventListener('ui:requestMessageLogData', () => {
    const entries = getMessageLog().getEntries();
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:messageLogData', { detail: { entries } }));
  });

  // Provide death log records from tombstone repository
  addEventListener('ui:requestDeathLogData', () => {
    const records = tombstoneRepo.getAll();
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:deathLogData', { detail: { records } }));
  });

  // --- Settings panel data & actions ---

  addEventListener('ui:requestBugReportData', () => {
    const p = playerEntity(world);
    let playerName = 'Hero';
    let playerClass = 'unknown';
    let seed = 0;
    const stats = {};
    const gear = [];
    const inv = [];
    const effects = [];
    if (p) {
      const ni = world.get(p.id, NamedIdentity);
      playerName = String(ni?.name || 'Hero');
      playerClass = String(ni?.identity || '').replace(/^player_/, '') || 'unknown';
      const eq = world.get(p.id, Equipment);
      const passive = getPassiveBonuses(world, p.id);
      const vit = world.get(p.id, Vitality);
      const mana = world.get(p.id, Mana);
      const stamina = world.get(p.id, Stamina);
      const hunger = world.get(p.id, Hunger);
      const combat = resolveCombatSnapshot(world, p.id, { mode: "melee" });
      const canonical = resolveCanonicalStats(world, p.id);
      const rawHunger = Math.max(0, Number(hunger?.hunger || 0) | 0);
      stats.hp = `${Math.max(0, Number(vit?.hp || 0) | 0)}/${Math.max(0, Number(vit?.maxHp || 0) | 0)}`;
      stats.mana = `${Math.max(0, Number(mana?.mana || 0) | 0)}/${Math.max(0, Number(mana?.maxMana || 0) | 0)}`;
      stats.stamina = `${Math.max(0, Number(stamina?.stamina || 0) | 0)}/${Math.max(0, Number(stamina?.maxStamina || 0) | 0)}`;
      stats.attack = Math.max(0, Number(combat?.attackBonus ?? (1 + Number(canonical?.accuracy || 0))));
      stats.defense = Math.max(0, Number(canonical?.evade || 0));
      stats.armorClass = Math.max(0, Number(combat?.armorClass ?? (10 + stats.defense)));
      stats.luck = Number(combat?.luck ?? canonical?.luck ?? 0);
      stats.gold = sumPlayerGold(p.id);
      stats.hungerLevel = (hunger?.satiation > 0) ? "satiated" : getHungerLevel(rawHunger);
      stats.turn = Math.max(0, Number(world.step || 0) | 0);
      for (const [, ds] of world.query(DungeonState)) {
        stats.depth = Math.max(0, Number(ds?.currentDepth || 0) | 0);
        seed = ds?.worldSeed ?? 0;
        break;
      }
      if (eq) {
        for (const slot of GEAR_SLOTS) {
          const eqId = Number(eq[slot] || 0) | 0;
          if (!(eqId > 0)) continue;
          gear.push({ slot, name: resolveItemDisplayName(world, eqId) });
        }
      }
      for (const id of inventoryItems(world, p.id)) {
        const info = world.get(id, ItemInfo);
        if (!info || info.type === 'currency') continue;
        const name = resolveItemDisplayName(world, id);
        const count = Number(info.count || 1);
        inv.push(count > 1 ? `${name} ×${count}` : name);
      }
      for (const { key, turns, stacks } of buildStatusRows(p.id)) {
        effects.push(stacks > 1 ? `${key}×${stacks}(${turns}t)` : `${key}(${turns}t)`);
      }
    }
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:bugReportData', {
      detail: { playerName, playerClass, stats, gear, inv, effects, seed },
    }));
  });

  function stripCorpseName(value) {
    return String(value || "Pet")
      .replace(/^half-eaten\s+/i, "")
      .replace(/^corpse of\s+/i, "")
      .replace(/\s+corpse$/i, "")
      .trim() || "Pet";
  }

  function isLivePetEntity(petId) {
    if (world.has(petId, ItemInfo)) return false;
    const vit = world.get(petId, Vitality);
    return !!vit && (Number(vit.hp || 0) | 0) > 0 && world.has(petId, Position);
  }

  function findPetStatus() {
    let hasPet = false;
    let petAlive = false;
    let petCorpseId = 0;
    for (const [petId] of world.query(Pet)) {
      hasPet = true;
      if (isLivePetEntity(petId)) {
        petAlive = true;
        break;
      }
      const info = world.get(petId, ItemInfo);
      if (!petCorpseId && info && world.has(petId, Position)) petCorpseId = petId;
    }
    return { hasPet, petAlive, petCorpseId };
  }

  function spawnResurrectedPetFromCorpse(corpseId, playerId, playerPos) {
    const spawnPos = findNearestValidTileAround(world, playerPos, {
      maxDistance: 1,
      exclude: [{ x: playerPos.x | 0, y: playerPos.y | 0 }],
    }) || { x: playerPos.x | 0, y: playerPos.y | 0 };
    const ident = world.get(corpseId, NamedIdentity);
    const petName = stripCorpseName(ident?.name || "Pet");
    const petIdentity = String(ident?.identity || "")
      .replace(/^corpse_/i, "")
      .trim() || "pet";

    try { world.destroy(corpseId); } catch {}

    const petId = world.create();
    world.add(petId, Pet);
    world.add(petId, Position, { x: spawnPos.x | 0, y: spawnPos.y | 0 });
    world.add(petId, NamedIdentity, { name: petName, identity: petIdentity });
    world.add(petId, Faction, { key: "pet" });
    world.add(petId, Owner, { ownerId: playerId });
    world.add(petId, Inventory, { items: [], capacity: 1 });
    world.add(petId, Settings, {
      autoPickup: true,
      autoPickupKinds: ["currency", "potion", "ammo", "scroll", "equip"],
    });
    world.add(petId, Vitality, { maxHp: 30, hp: 30 });
    world.add(petId, Equipment, {
      accuracyDerived: 2,
      damagePowerDerived: 2,
      evadeDerived: 2,
    });
    world.add(petId, PetState, {
      state: "following",
      targetX: null,
      targetY: null,
      targetItemId: 0,
      stateEnteredTurn: world.step | 0,
      lastPlayerX: playerPos.x | 0,
      lastPlayerY: playerPos.y | 0,
      commandCooldown: 0,
      rangedCooldown: 0,
    });
    return petId;
  }

  function buildSaveDataExport() {
    const registryNames = getSavegameRegistryNames(world);
    return {
      v: 1,
      exportedAt: Date.now(),
      reason: "settings_export",
      world: serializeSavegameWorld(world, { note: "settings_export", include: registryNames }),
      schema: { registry: registryNames },
      identified: getIdentifiedSnapshot(),
      gemPricing: getGemPricingSnapshot(),
      app: {
        activeSpellId: typeof getActiveSpellId === "function" ? (getActiveSpellId() || null) : null,
        actionBarSlots: null,
        pinnedSpellSlots: null,
      },
    };
  }

  addEventListener('ui:requestSettingsData', () => {
    const { hasPet, petAlive } = findPetStatus();
    const p = playerEntity(world);
    const set = p ? world.get(p.id, Settings) : null;
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:settingsData', {
      detail: {
        identificationEnabled: isIdentificationEnabled(),
        hungerEnabled: set ? set.hungerEnabled !== false : true,
        deityDebugPinned: set ? set.deityDebugPinned === true : false,
        fovConeDisabled: world[FOV_CONE_DISABLED_KEY] === true,
        facingTurnCostEnabled: isFacingTurnCostEnabled(world),
        allItemIds: listAllItemIds(),
        allMonsterIds: listAllMonsterIds(),
        aiSettings: readAISettings(),
        hasPet,
        petAlive,
      },
    }));
  });

  addEventListener('ui:requestSaveDataExport', () => {
    try {
      const payload = buildSaveDataExport();
      _uiEventTarget.dispatchEvent(new CustomEvent('ui:saveDataExport', {
        detail: {
          json: JSON.stringify(payload, null, 2),
          filename: `jshack-save-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        },
      }));
    } catch (e) {
      console.warn("[settings] save export failed:", e);
    }
  });

  addEventListener('ui:setIdentification', (ev) => {
    const enabled = !!ev?.detail?.enabled;
    setIdentificationEnabled(enabled);
  });

  addEventListener('ui:setHunger', (ev) => {
    const enabled = !!ev?.detail?.enabled;
    const p = playerEntity(world);
    if (!p) return;
    const cur = world.get(p.id, Settings);
    if (cur) {
      cur.hungerEnabled = enabled;
    }
  });

  addEventListener('ui:setDeityDebugPinned', (ev) => {
    const enabled = !!ev?.detail?.enabled;
    const p = playerEntity(world);
    if (!p) return;
    const cur = world.get(p.id, Settings);
    if (!cur) return;
    cur.deityDebugPinned = enabled;
  });

  addEventListener('ui:setFovConeDisabled', (ev) => {
    const disabled = !!ev?.detail?.disabled;
    world[FOV_CONE_DISABLED_KEY] = disabled;
    try { localStorage.setItem('jshack.disableFovCone', String(disabled)); } catch {}
  });

  addEventListener('ui:setFacingTurnCost', (ev) => {
    const enabled = !!ev?.detail?.enabled;
    setFacingTurnCostEnabled(world, enabled);
    try { localStorage.setItem('jshack.facingTurnCost', String(enabled)); } catch {}
  });

  addEventListener('ui:setAISettings', (ev) => {
    writeAISettings(ev?.detail || {});
  });

  addEventListener('ui:debugGiveItem', (ev) => {
    const itemId = String(ev?.detail?.itemId || '').trim();
    if (!itemId) return;
    const p = playerEntity(world);
    if (!p) return;
    const inv = world.get(p.id, Inventory);
    if (!inv) return;
    const created = createItemById(world, itemId);
    if (created === null) {
      console.warn(`[settings] Unknown item: "${itemId}"`);
      return;
    }
    addToInventory(world, p.id, created);
    console.debug(`[settings] Gave 1x ${itemId}`);
  });

  addEventListener('ui:debugSpawnMonster', (ev) => {
    const monsterId = String(ev?.detail?.monsterId || '').trim();
    if (!monsterId) return;
    const result = spawnDebugMonsterNearPlayer(world, monsterId);
    if (!result.ok) {
      console.warn(`[settings] ${result.error}`);
      return;
    }
    console.debug(`[settings] Spawned ${result.monsterId} at (${result.x}, ${result.y})`);
  });

  addEventListener('ui:debugResurrectPet', () => {
    const p = playerEntity(world);
    if (!p) return;
    const pPos = world.get(p.id, Position);
    if (!pPos) return;
    const status = findPetStatus();
    if (status.petAlive) return;
    if (status.petCorpseId > 0) {
      const petId = spawnResurrectedPetFromCorpse(status.petCorpseId, p.id, pPos);
      console.debug(`[settings] Resurrected pet ${petId}`);
      return;
    }
    for (const [petId] of world.query(Pet)) {
      if (world.has(petId, ItemInfo)) continue;
      const vit = world.get(petId, Vitality);
      if (!vit) continue;
      vit.hp = Math.max(1, Number(vit.maxHp || 1) | 0);
      if (world.has(petId, Position)) world.set(petId, Position, { x: pPos.x, y: pPos.y });
      else world.add(petId, Position, { x: pPos.x, y: pPos.y });
      console.debug(`[settings] Resurrected pet ${petId}`);
      break;
    }
  });

  addEventListener('ui:requestQuestJournalData', () => {
    const questMap = new Map();
    for (const [, def, state, vars] of world.query(QuestDefRef, QuestState, QuestVars)) {
      const questDef = getQuestDef(def.id);
      const rewardText = questJournalRewardText(questDef, vars?.data, def.id);
      const completionText = questJournalCompletionText(state, vars?.data);
      const rec = {
        questId: String(def.id || ''),
        title: String(questDef?.title || def.id || ''),
        status: String(state.status || 'active'),
        node: String(state.node || ''),
        t0: Number(state.t0 || 0),
        summary: String(vars?.data?.objective || ''),
        flavorText: questJournalFlavorText(questDef, vars?.data, def.id),
        rewardText,
        completionText,
        progress: Math.max(0, Number(vars?.data?.progress || 0) | 0),
        target: Math.max(0, Number(vars?.data?.target || 0) | 0),
        checklist: Array.isArray(vars?.data?.checklist)
          ? vars.data.checklist.map((entry) => ({
            text: String(entry?.text || ''),
            done: !!entry?.done,
          }))
          : [],
      };
      const prev = questMap.get(rec.questId);
      if (!prev || rec.t0 >= prev.t0) questMap.set(rec.questId, rec);
    }
    const quests = Array.from(questMap.values()).sort((a, b) => a.t0 - b.t0 || a.title.localeCompare(b.title));
    _uiEventTarget.dispatchEvent(new CustomEvent('ui:questJournalData', { detail: { quests } }));
  });

  return { buildGroundPickupDetailAt };
}
