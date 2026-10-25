import { playerEntity } from "../../rules/utils/queries.js";
import { Vitality } from "../../rules/components/Vitality.js";
import { Stamina } from "../../rules/components/Stamina.js";
import { Equipment, NON_AMMO_GEAR_SLOTS } from "../../rules/components/Equipment.js";
import { ItemInfo } from "../../rules/components/ItemInfo.js";
import { NamedIdentity } from "../../rules/components/NamedIdentity.js";
import { inventoryItems } from "../../rules/utils/inventoryFacade.js";
import { getAffixName } from "../../rules/data/affixes.js";
import { DungeonState } from "../../rules/components/DungeonState.js";
import { CalendarState } from "../../rules/components/CalendarState.js";
import { getCalendarDate, TURNS_PER_DAY } from "../../rules/data/calendar.js";
import { Hunger } from "../../rules/components/Hunger.js";
import { getHungerLevel } from "../../rules/data/food.js";
import { Pet } from "../../rules/components/Pet.js";
import { PetState } from "../../rules/components/PetState.js";
import { resolveCombatSnapshot } from "../../rules/utils/resolveCombatSnapshot.js";
import { resolveResistance } from "../../rules/utils/dealDamage.js";
import { getPassiveBonuses, effectiveMaxHp, effectiveMaxMana } from "../../rules/utils/passiveBonuses.js";
import { resolveCanonicalStats } from "../../rules/utils/canonicalStats.js";
import { getSpell } from "../../rules/data/spells.js";
import { getSpellCooldown } from "../../rules/utils/spellCooldowns.js";
import { getItemCooldown } from "../../rules/utils/itemCooldowns.js";
import { spellCost, spellCostResource } from "../../rules/data/spells.js";
import { getCatalogItem } from "../../rules/data/itemCatalog.js";
import { impactTracker } from "../../display/fx/projectileImpactTracker.js";
import { QuestBindings } from "../../rules/components/QuestBindings.js";
import { QuestDefRef } from "../../rules/components/QuestDefRef.js";
import { QuestState } from "../../rules/components/QuestState.js";
import { QuestVars } from "../../rules/components/QuestVars.js";
import { getQuestDef } from "../../rules/quests/registry.js";
import { STARTER_RAT_QUEST_ID } from "../../rules/quests/runtime.js";
import { REQUIRED_RAT_KILLS } from "../../rules/quests/definitions/ratInfestation.js";
import { questRewardPreviewText } from "./questRewards.js";
import { enrichStatusRowDisplay } from "./statusDisplayMetadata.js";
import { buildEffectRows } from "./effectRows.js";

export function formatClockLabel12Hour(turn) {
  const safeTurn = Math.max(0, Number(turn || 0) | 0);
  const totalMinutes = (safeTurn % TURNS_PER_DAY) * 2;
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const hour12 = (hour24 % 12) || 12;
  const period = hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

/**
 * Provides HUD feed updaters that cache the last dispatched values.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {{ getPlayerMana: () => { mana: number, maxMana: number }, ensureActiveSpell: () => string|null, updateActiveSpellLabel: () => void, knownSpellIds?: () => string[], getActionBarSlots?: () => (string|null)[], getPinnedSpellSlots?: () => (string|null)[], autoAssignSlot?: (id: string) => number, autoAssignPinnedSlot?: (id: string) => number, getFxTime?: () => number }} deps
 */
export function createHudFeeds(world, deps) {
  const { getPlayerMana, ensureActiveSpell, updateActiveSpellLabel, getFxTime } = deps;

  let lastVitals = { hp: -1, maxHp: -1, mana: -1, maxMana: -1, stamina: -1, maxStamina: -1 };
  let lastCombatHud = {
    weaponId: -1,
    rangedId: -1,
    rangedCount: -1,
    atk: -999,
    def: -999,
    luck: -999,
    ac: -999,
    critPct: -999,
    statusSig: "",
    affixSig: "",
    ammo: -1,
    coatingSig: "",
    posture: "",
  };
  let lastDepth = -1;
  let lastTurn = -1;
  let lastGold = -1;
  let lastPetExists = false;
  let lastPetState = "";
  let lastSpellResourceSig = "";
  let lastCalendarDay = -1;
  let lastQuestTrackerSig = "";
  let _lastSpellBarSig = '';
  let _lastPinnedSpellBarSig = '';
  /** @type {Set<string>} */
  let _prevKnownSpells = new Set();

  const CLOCK_HOURS = Object.freeze([
    "\uD83D\uDD5B", // 12
    "\uD83D\uDD50", // 1
    "\uD83D\uDD51", // 2
    "\uD83D\uDD52", // 3
    "\uD83D\uDD53", // 4
    "\uD83D\uDD54", // 5
    "\uD83D\uDD55", // 6
    "\uD83D\uDD56", // 7
    "\uD83D\uDD57", // 8
    "\uD83D\uDD58", // 9
    "\uD83D\uDD59", // 10
    "\uD83D\uDD5A", // 11
  ]);
  const CLOCK_HALVES = Object.freeze([
    "\uD83D\uDD67", // 12:30
    "\uD83D\uDD5C", // 1:30
    "\uD83D\uDD5D", // 2:30
    "\uD83D\uDD5E", // 3:30
    "\uD83D\uDD5F", // 4:30
    "\uD83D\uDD60", // 5:30
    "\uD83D\uDD61", // 6:30
    "\uD83D\uDD62", // 7:30
    "\uD83D\uDD63", // 8:30
    "\uD83D\uDD64", // 9:30
    "\uD83D\uDD65", // 10:30
    "\uD83D\uDD66", // 11:30
  ]);

  function resolveClockFromTurn(turn) {
    const safeTurn = Math.max(0, Number(turn || 0) | 0);
    const turnOfDay = safeTurn % TURNS_PER_DAY;
    const totalMinutes = turnOfDay * 2;

    // Pick the closest emoji clock in 30-minute increments.
    const halfHourSlot = Math.round(totalMinutes / 30) % 48;
    const hour12 = ((Math.floor(halfHourSlot / 2) + 11) % 12) + 1;
    const isHalf = (halfHourSlot % 2) === 1;
    const emoji = isHalf ? CLOCK_HALVES[hour12 % 12] : CLOCK_HOURS[hour12 % 12];

    const label = formatClockLabel12Hour(safeTurn);
    return { turnOfDay, emoji, label };
  }

  function sumPlayerGold(playerId) {
    const items = inventoryItems(world, playerId);
    if (!items.length) return 0;
    let total = 0;
    for (const iid of items) {
      const info = world.get(iid, ItemInfo);
      if (!info || info.type !== "currency") continue;
      total += Math.max(0, Number(info.count || 0) | 0);
    }
    return Math.max(0, total | 0);
  }

  function buildQuestTrackerEntry(defId, questDef, state, vars) {
    const questId = String(defId || "");
    const title = String(questDef?.title || questId || "Quest");
    const node = String(state?.node || "");
    const data = vars?.data && typeof vars.data === "object" ? vars.data : {};

    let progress = 0;
    let target = 0;
    if (questId === STARTER_RAT_QUEST_ID) {
      progress = Math.max(0, Number(data.killCount || 0) | 0);
      target = REQUIRED_RAT_KILLS;
    } else if (Number.isFinite(Number(data.target || NaN)) && Number(data.target || 0) > 0) {
      target = Math.max(0, Number(data.target || 0) | 0);
      progress = Math.max(0, Number(data.progress || 0) | 0);
    } else if (Array.isArray(data.checklist) && data.checklist.length > 0) {
      target = data.checklist.length;
      progress = data.checklist.reduce((sum, entry) => sum + (entry?.done ? 1 : 0), 0);
    }

    let summary = String(data.objective || "").trim();
    if (!summary && questId === STARTER_RAT_QUEST_ID) {
      if (node === "hunt") summary = "Clear the tavern cellar";
      else if (node === "report") summary = "Return to the barkeep";
      else if (node === "offer") summary = "Talk to the barkeep";
    }
    if (!summary && node === "report") summary = "Turn it in";

    const rewardPreview = questRewardPreviewText(questDef, data);

    let icon = "✦";
    if (questId === STARTER_RAT_QUEST_ID) icon = "🐀";
    else if (questId === "starter.priest_fetch") icon = "📕";
    else if (summary.toLowerCase().includes("return")) icon = "↩";

    return {
      questId,
      title,
      node,
      progress,
      target,
      summary,
      rewardPreview,
      icon,
      sortKey: Number(state?.t0 || 0),
      priority: (
        (target > 0 ? 100 : 0)
        + (progress > 0 ? 20 : 0)
        + (node === "report" ? 10 : 0)
      ),
    };
  }

  function listEligibleQuestTrackerEntries(playerId) {
    const active = [];
    for (const [, def, state, vars, bindings] of world.query(QuestDefRef, QuestState, QuestVars, QuestBindings)) {
      if (String(state?.status || "active") !== "active") continue;
      if (Number(bindings?.player || 0) !== Number(playerId || 0)) continue;
      if (vars?.data?.accepted === false) continue;
      active.push(buildQuestTrackerEntry(def?.id, getQuestDef(def?.id), state, vars));
    }
    return active;
  }

  function pickFocusedQuestTrackerEntry(entries) {
    const active = Array.isArray(entries) ? entries.slice() : [];
    active.sort((a, b) => b.priority - a.priority || b.sortKey - a.sortKey || a.title.localeCompare(b.title));
    return active[0] || null;
  }

  function updateQuestTrackerHUD() {
    const pe = playerEntity(world);
    if (!pe) return;

    const active = listEligibleQuestTrackerEntries(pe.id);
    const focused = pickFocusedQuestTrackerEntry(active);
    const sig = JSON.stringify({
      focused: focused ? {
        questId: focused.questId,
        node: focused.node,
        progress: focused.progress,
        target: focused.target,
        summary: focused.summary,
        rewardPreview: focused.rewardPreview,
      } : null,
    });
    if (sig === lastQuestTrackerSig) return;
    lastQuestTrackerSig = sig;

    try {
      window.dispatchEvent(new CustomEvent("ui:updateQuestTracker", {
        detail: {
          focused: focused ? {
            questId: focused.questId,
            title: focused.title,
            progress: focused.progress,
            target: focused.target,
            summary: focused.summary,
            rewardPreview: focused.rewardPreview,
            icon: focused.icon,
          } : null,
        },
      }));
    } catch (e) { console.debug("[hudFeeds] dispatch ui:updateQuestTracker:", e); }
  }

  /**
   * Generic resolver: checks equipped gear for content-DSL abilities.
   * Weapon abilities stay first, then the rest of the loadout in slot order.
   * Returns action objects for the spell bar, or empty array.
   */
  function resolveEquippedContentAbilities(playerId) {
    const eq = /** @type any */ (world.get(playerId, Equipment));
    if (!eq) return [];
    const results = [];
    const seenItems = new Set();
    const slotOrder = ['weapon', ...NON_AMMO_GEAR_SLOTS.filter((slot) => slot !== 'weapon')];

    for (const slot of slotOrder) {
      const itemId = Number(eq?.[slot] || 0) | 0;
      if (!(itemId > 0) || seenItems.has(itemId)) continue;
      seenItems.add(itemId);

      const identity = String(world.get(itemId, NamedIdentity)?.identity || '').toLowerCase();
      if (!identity) continue;
      const def = getCatalogItem(identity);
      if (!def?._contentAbilities) continue;

      for (const [abilityId, spec] of Object.entries(def._contentAbilities)) {
        const cd = getItemCooldown(world, itemId);
        results.push({
          kind: 'item-use',
          id: `item-use:${identity}:${abilityId}:${itemId}`,
          itemId,
          identity,
          abilityId,
          name: spec.name || abilityId,
          symbol: spec.icon || '?',
          cost: spec.cost || 0,
          costKind: spec.costKind || 'item',
          cdRemaining: cd ? Math.max(0, Number(cd.remaining || 0) | 0) : 0,
          cdMax: cd ? Math.max(0, Number(cd.max || 0) | 0) : (spec.cooldown || 0),
          auto: true,
        });
      }
    }
    return results;
  }

  function updateVitalsHUD() {
    const pe = playerEntity(world);
    if (!pe) return;
    /** @type {{ hp?:number, maxHp?:number }|null} */
    const vit = /** @type any */ (world.get(pe.id, Vitality));
    const mana = getPlayerMana();
    const stam = /** @type any */ (world.get(pe.id, Stamina));
    const passive = getPassiveBonuses(world, pe.id);

    const rawHp = Number(vit?.hp ?? 0);
    const maxHp = vit ? effectiveMaxHp(world, pe.id, vit) : 0;
    const fxT = typeof getFxTime === 'function' ? getFxTime() : 0;
    const hp = impactTracker.visualHp(pe.id, rawHp, maxHp, fxT);
    const stamina = Number(stam?.stamina ?? 0);
    const maxStaminaBonus = Number(passive?.maxStaminaDerived ?? 0);
    const maxStamina = Number(stam?.maxStamina ?? 100) + maxStaminaBonus;
    if (hp !== lastVitals.hp || maxHp !== lastVitals.maxHp ||
        mana.mana !== lastVitals.mana || mana.maxMana !== lastVitals.maxMana ||
        stamina !== lastVitals.stamina || maxStamina !== lastVitals.maxStamina) {
      lastVitals = { hp, maxHp, mana: mana.mana, maxMana: mana.maxMana, stamina, maxStamina };
      try {
        window.dispatchEvent(new CustomEvent("ui:updateVitals", { detail: lastVitals }));
      } catch (e) { console.debug('[hudFeeds] dispatch ui:updateVitals:', e); }
    }
  }

  /**
   * Average roll for a dice spec like "2d6" → 7.
   * @param {string} spec
   * @returns {number}
   */
  function averageDice(spec) {
    const m = /^\s*(\d+)d(\d+)\s*$/i.exec(String(spec || ""));
    if (!m) return 1;
    const count = Math.max(1, parseInt(m[1], 10) | 0);
    const sides = Math.max(2, parseInt(m[2], 10) | 0);
    return count * (sides + 1) / 2;
  }

  function updateCombatHUD() {
    const pe = playerEntity(world);
    if (!pe) return;
    const eq = /** @type any */ (world.get(pe.id, Equipment));
    const passive = getPassiveBonuses(world, pe.id);
    const canonical = resolveCanonicalStats(world, pe.id);
    const wid = Number(eq?.weapon || 0);
    const rangedId = Number(eq?.ranged || 0);
    const combat = resolveCombatSnapshot(world, pe.id, { mode: "melee" });

    // Compute actual expected damage: avg dice + flat bonus, scaled by mult
    const wInfo = wid ? world.get(wid, ItemInfo) : null;
    const dmgDice = wInfo?.damageDice ? String(wInfo.damageDice) : (wid ? "1d2" : "1d2");
    const avgRoll = averageDice(dmgDice);
    const flatBonus = Number(combat?.damageFlatBonus ?? 0);
    const damageMult = Number(combat?.damageMult ?? 1);
    const atk = Math.max(0, Math.floor((avgRoll + flatBonus) * damageMult));

    const luck = Number(combat?.luck ?? canonical?.luck ?? 0);
    const evade = Number(canonical?.evade ?? 0);
    const armorClass = Number(combat?.armorClass ?? (10 + evade));
    const defenseContribution = Math.max(0, Math.round(armorClass - 10));
    // DEF% is an at-a-glance composite: physical reduction plus to-hit defense.
    const CANONICAL_HIT = 100;
    const afterBlunt = resolveResistance(world, pe.id, CANONICAL_HIT, 'blunt');
    const afterSlash = resolveResistance(world, pe.id, CANONICAL_HIT, 'slash');
    const afterPierce = resolveResistance(world, pe.id, CANONICAL_HIT, 'pierce');
    const physicalReduction = Math.round(CANONICAL_HIT - (afterBlunt + afterSlash + afterPierce) / 3);
    const def = Math.max(0, physicalReduction + defenseContribution);
    const critPct = (Number(combat?.critChance ?? canonical?.critChancePhysical ?? 0) * 100) + luck;
    const posture = String(combat?.posture?.stance || "balanced");
    const mitigation = Number(canonical?.mitigation ?? 0);
    const rangedInfo = rangedId ? world.get(rangedId, ItemInfo) : null;
    const rangedCount = Number(rangedInfo?.count || 0);
    const wName = wid ? (world.get(wid, NamedIdentity)?.name || wInfo?.description || wInfo?.type) : "";
    const rangedName = rangedId ? (world.get(rangedId, NamedIdentity)?.name || rangedInfo?.description || rangedInfo?.type) : "";
    const wCoating = wInfo?.coating && typeof wInfo.coating === 'object' ? wInfo.coating : null;
    const coatingSig = wCoating ? `${wCoating.kind}:${wCoating.charges || 0}` : "";
    const rangedType = String(rangedInfo?.type || "");
    /** @type {Map<string, { key: string, turns: number, stacks: number }>} */
    const statusMap = new Map();
    const effectRows = buildEffectRows(world, pe.id);
    for (const row of effectRows) statusMap.set(row.instanceId || row.key, row);
    const hc = /** @type any */ (world.get(pe.id, Hunger));
    if (hc) {
      const level = hc.satiation > 0 ? "satiated" : getHungerLevel(Number(hc.hunger || 0));
      if (level !== "normal") {
        const key = String(level).toLowerCase();
        const turns = hc.satiation > 0 ? Math.max(0, Number(hc.satiation || 0)) : 9999;
        const stacks = 1;
        const prev = statusMap.get(key);
        if (!prev) statusMap.set(key, { key, turns, stacks, potency: 1, masked: false });
        else statusMap.set(key, { key, turns: Math.max(prev.turns, turns), stacks: Math.max(prev.stacks, stacks), potency: Math.max(Number(prev.potency || 0), 1), masked: false });
      }
    }
    const statuses = Array.from(statusMap.values()).map(enrichStatusRowDisplay);
    // Enrich statuses with spell glyph/name so display layer never imports rules
    for (const s of statuses) {
      if (s.masked) continue;
      const spDef = getSpell(s.key);
      if (spDef?.symbol) { s.spellGlyph = spDef.symbol; s.spellName = spDef.name; }
    }
    const statusSig = statuses.map((s) => `${s.instanceId || s.key}:${s.turns}:${s.stacks}:${Number(s.potency || 0)}:${s.sourceKey || ''}:${s.masked ? 1 : 0}`).join("|");

    const affixIds = [];
    const pushAffixes = (id) => {
      const info = id ? world.get(id, ItemInfo) : null;
      const arr = info && Array.isArray(info.affixes) ? info.affixes : [];
      for (const a of arr) affixIds.push(String(a));
    };
    if (eq) {
      for (const slot of NON_AMMO_GEAR_SLOTS) pushAffixes(Number(eq[slot] || 0));
    }
    const affixNames = affixIds
      .filter((id) => !/^thorns/i.test(String(id)))
      .map((id) => getAffixName(id));
    const affixSig = affixNames.join("|");

    // Count ammo in player inventory
    let ammo = 0;
    for (const iid of inventoryItems(world, pe.id)) {
      const info = world.get(iid, ItemInfo);
      if (info && info.type === 'ammo') ammo += Number(info.count || 1);
    }

    if (lastCombatHud.weaponId !== wid || lastCombatHud.rangedId !== rangedId || lastCombatHud.rangedCount !== rangedCount ||
      lastCombatHud.atk !== atk || lastCombatHud.def !== def || lastCombatHud.luck !== luck ||
      lastCombatHud.ac !== armorClass || lastCombatHud.critPct !== critPct ||
      lastCombatHud.statusSig !== statusSig || lastCombatHud.affixSig !== affixSig || lastCombatHud.ammo !== ammo || lastCombatHud.coatingSig !== coatingSig || lastCombatHud.posture !== posture) {
      lastCombatHud = { weaponId: wid, rangedId, rangedCount, atk, def, luck, ac: armorClass, critPct, statusSig, affixSig, ammo, coatingSig, posture };
      try {
        window.dispatchEvent(new CustomEvent("ui:updateCombatHUD", { detail: {
          attack: atk,
          weapon: wid ? { id: wid, name: wName || null, damageDice: wInfo?.damageDice || null, attack: atk, coating: wCoating } : null,
          ranged: rangedId ? { id: rangedId, name: rangedName || null, isWand: rangedType === 'wand', count: rangedCount } : null,
          defense: def,
          mitigation,
          luck,
          armorClass,
          critChancePercent: critPct,
          posture,
          statuses,
          affixes: affixNames,
          ammo,
        } }));
      } catch (e) { console.debug('[hudFeeds] dispatch ui:updateCombatHUD:', e); }
    }
  }

  function updateDepthHUD() {
    for (const [, state] of world.query(DungeonState)) {
      const d = state.currentDepth;
      if (d !== lastDepth) {
        lastDepth = d;
        try {
          window.dispatchEvent(new CustomEvent("ui:updateDepth", { detail: { depth: d } }));
        } catch (e) { console.debug('[hudFeeds] dispatch ui:updateDepth:', e); }
      }
      break;
    }
  }

  function updateTurnHUD() {
    const turn = Math.max(0, Number(world.step || 0) | 0);
    if (turn !== lastTurn) {
      lastTurn = turn;
      const clock = resolveClockFromTurn(turn);
      try {
        window.dispatchEvent(new CustomEvent("ui:updateTurn", {
          detail: {
            turn,
            turnOfDay: clock.turnOfDay,
            clockEmoji: clock.emoji,
            clockLabel: clock.label,
          }
        }));
      } catch (e) { console.debug('[hudFeeds] dispatch ui:updateTurn:', e); }
    }
  }

  function updateGoldHUD() {
    const pe = playerEntity(world);
    const gold = pe ? sumPlayerGold(pe.id) : 0;
    if (gold !== lastGold) {
      lastGold = gold;
      try {
        window.dispatchEvent(new CustomEvent("ui:updateGold", { detail: { gold } }));
      } catch (e) { console.debug('[hudFeeds] dispatch ui:updateGold:', e); }
    }
  }

  function updatePetHUD() {
    // Check if pet exists
    let petExists = false;
    let petState = "";
    for (const [petId, _pet, vit] of world.query(Pet, Vitality)) {
      if (!vit || vit.hp <= 0) continue;
      petExists = true;
      const state = world.get(petId, PetState);
      petState = state?.state || "following";
      break; // Only one pet for now
    }

    // Update visibility if changed
    if (petExists !== lastPetExists) {
      lastPetExists = petExists;
      try {
        window.dispatchEvent(new CustomEvent("ui:petExists", {
          detail: { exists: petExists }
        }));
      } catch (e) { console.debug('[hudFeeds] dispatch ui:petExists:', e); }
    }

    // Update state if changed
    if (petExists && petState !== lastPetState) {
      lastPetState = petState;
      try {
        window.dispatchEvent(new CustomEvent("ui:updatePetButton", {
          detail: { state: petState }
        }));
      } catch (e) { console.debug('[hudFeeds] dispatch ui:updatePetButton:', e); }
    }
  }

  function updateActiveSpellHUD() {
    const activeId = ensureActiveSpell();
    const pe = playerEntity(world);
    const { mana } = getPlayerMana();
    const staminaComp = pe ? /** @type any */ (world.get(pe.id, Stamina)) : null;
    const stamina = Number(staminaComp?.stamina ?? 0);
    const spellResourceSig = `${mana}|${stamina}`;
    if (spellResourceSig !== lastSpellResourceSig) {
      lastSpellResourceSig = spellResourceSig;
      updateActiveSpellLabel();
    }

    // Auto-assign newly learned spells to empty action bar + pinned slots
    if (typeof deps.knownSpellIds === 'function' && typeof deps.autoAssignSlot === 'function') {
      const ids = deps.knownSpellIds();
      for (const id of ids) {
        if (!_prevKnownSpells.has(id)) {
          deps.autoAssignSlot(id);
          if (typeof deps.autoAssignPinnedSlot === 'function') deps.autoAssignPinnedSlot(id);
        }
      }
      _prevKnownSpells = new Set(ids);
    }

    // Dispatch spell bar state for desktop HUD
    if (typeof deps.getActionBarSlots === 'function') {
      const slots = deps.getActionBarSlots();
      const resolved = [];
      if (pe) resolved.push(...resolveEquippedContentAbilities(pe.id));
      for (let i = 0; i < slots.length && resolved.length < slots.length; i++) {
        const id = slots[i];
        if (!id) {
          resolved.push(null);
          continue;
        }
        const def = getSpell(id);
        if (!def) {
          resolved.push(null);
          continue;
        }
        const cd = getSpellCooldown(world, id);
        const resource = spellCostResource(def);
        const cost = spellCost(def);
        resolved.push({
          kind: 'spell',
          id,
          name: def.name,
          symbol: def.symbol,
          cost,
          costKind: resource,
          cdRemaining: cd ? cd.remaining : 0,
          cdMax: cd ? cd.max : 0,
        });
      }
      while (resolved.length < slots.length) resolved.push(null);
      const sig = resolved.map((entry) => {
        if (!entry) return 'empty';
        return `${entry.kind}:${entry.id}:${Number(entry.cdRemaining || 0)}`;
      }).join(',') + '|' + (activeId || '') + '|' + mana + '|' + stamina;
      if (sig !== _lastSpellBarSig) {
        _lastSpellBarSig = sig;
        try {
          window.dispatchEvent(new CustomEvent('ui:updateSpellBar', {
            detail: { slots: resolved, activeSpellId: activeId, mana, stamina }
          }));
        } catch (e) { console.debug('[hudFeeds] dispatch ui:updateSpellBar:', e); }
      }
    }

    // Dispatch pinned spell bar state for mobile spell dock
    if (typeof deps.getPinnedSpellSlots === 'function') {
      const pSlots = deps.getPinnedSpellSlots();
      const hasSpells = typeof deps.knownSpellIds === 'function' && deps.knownSpellIds().length > 0;
      const resolved = [];
      if (pe) resolved.push(...resolveEquippedContentAbilities(pe.id));
      for (let i = 0; i < pSlots.length && resolved.length < pSlots.length; i++) {
        const id = pSlots[i];
        if (!id) {
          resolved.push(null);
          continue;
        }
        const def = getSpell(id);
        if (!def) {
          resolved.push(null);
          continue;
        }
        const cd = getSpellCooldown(world, id);
        const resource = spellCostResource(def);
        const cost = spellCost(def);
        resolved.push({
          kind: 'spell',
          id,
          name: def.name,
          symbol: def.symbol,
          cost,
          costKind: resource,
          cdRemaining: cd ? cd.remaining : 0,
          cdMax: cd ? cd.max : 0,
        });
      }
      while (resolved.length < pSlots.length) resolved.push(null);
      const pSig = resolved.map((entry) => {
        if (!entry) return 'empty';
        return `${entry.kind}:${entry.id}:${Number(entry.cdRemaining || 0)}`;
      }).join(',') + '|' + mana + '|' + stamina + '|' + hasSpells;
      if (pSig !== _lastPinnedSpellBarSig) {
        _lastPinnedSpellBarSig = pSig;
        try {
          window.dispatchEvent(new CustomEvent('ui:updatePinnedSpellBar', {
            detail: { pinnedSlots: resolved, mana, stamina, hasLearnedSpells: hasSpells }
          }));
        } catch (e) { console.debug('[hudFeeds] dispatch ui:updatePinnedSpellBar:', e); }
      }
    }
  }

  function updateCalendarHUD() {
    for (const [, cs] of world.query(CalendarState)) {
      const day = cs.dayTotal;
      if (day === lastCalendarDay) break;
      lastCalendarDay = day;
      const date = getCalendarDate(world.step, cs.startDay, cs.startYear);
      try {
        window.dispatchEvent(new CustomEvent("ui:updateCalendar", { detail: date }));
      } catch (e) { console.debug('[hudFeeds] dispatch ui:updateCalendar:', e); }
      break;
    }
  }

  return {
    updateVitalsHUD,
    updateCombatHUD,
    updateDepthHUD,
    updateTurnHUD,
    updateGoldHUD,
    updatePetHUD,
    updateActiveSpellHUD,
    updateCalendarHUD,
    updateQuestTrackerHUD,
  };
}
