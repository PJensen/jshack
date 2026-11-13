import { getCatalogItem } from "../../rules/data/itemCatalog.js";
import { getGem, describeGemDetailLines, describeGemMechanics } from "../../rules/data/gems.js";
import { getProcPackage } from "../../rules/data/procPackages.js";
import { getEnchantScrollDef } from "../../rules/content/enchanting/enchantCatalog.js";
import { listQuestRewardBonusItems, listQuestRewardOptions } from "../../rules/quests/rewardOptions.js";

/**
 * @param {any} questDef
 * @param {any} vars
 * @returns {string[]}
 */
export function listQuestRewardItemIds(questDef, vars) {
  const raw = listQuestRewardOptions(questDef, vars).flatMap((choice) => choice.items.map((item) => item.itemId));
  return raw.map((id) => String(id || "").trim()).filter(Boolean);
}

/**
 * @param {string} itemId
 * @returns {{ itemId:string, name:string, description:string }}
 */
export function describeQuestRewardItem(itemId) {
  const id = String(itemId || "").trim();
  const def = id ? getCatalogItem(id) : null;
  const gem = !def && id ? getGem(id) : null;
  const name = String(def?.name || gem?.name || id || "Reward").trim();
  const gemDetails = gem ? describeGemDetailLines(gem) : [];
  const description = String(
    def?.description
      || (gemDetails.length ? gemDetails.join(" ") : (gem ? `${gem.socketable ? "Socketable " : ""}${gem.appearance}.` : "")),
  ).trim();
  const rarity = Number(def?.rarity || (gem?.value >= 2500 ? 4 : gem?.value >= 800 ? 3 : 1)) | 0;
  const rarityName = String(def?.rarityName || (["common", "uncommon", "rare", "epic", "legendary"][rarity] || "common"));
  const type = String(def?.type || (gem ? "gem" : "item"));
  const slot = String(def?.slot || (type === "ranged" ? "ranged" : type === "weapon" ? "weapon" : ""));
  const mechanics = [];
  if (gem) {
    mechanics.push(...describeGemMechanics(gem));
  }
  const enchantScroll = getEnchantScrollDef(id);
  if (enchantScroll?.effectSummary) {
    mechanics.push({
      context: 'Enchant',
      text: String(enchantScroll.effectSummary).trim(),
      iconId: id,
    });
  }
  for (const ability of Object.values(def?._contentAbilities || {})) {
    const text = String(ability?.displayFormat || ability?.description || "").trim();
    if (text) mechanics.push({ context: `Use — ${String(ability?.name || ability?.id || "Ability")}`, text });
  }
  for (const packageId of Array.isArray(def?.procPackages) ? def.procPackages : []) {
    const pkg = getProcPackage(packageId);
    const format = pkg?.display?.format || "{summary}";
    const text = String(format).replace(/\{summary\}/g, String(pkg?.summary || ""));
    if (text.trim()) mechanics.push({ context: String(pkg?.display?.context || "Equip"), text: text.trim() });
  }
  return {
    itemId: id,
    name,
    description,
    tooltip: {
      id: 0,
      identity: id,
      type,
      name,
      slot,
      iconId: id,
      rarityName,
      description,
      bonuses: def?.bonuses && typeof def.bonuses === "object" ? { ...def.bonuses } : {},
      damageDice: def?.damageDice || null,
      staminaCost: def?.staminaCost ?? null,
      twoHanded: !!def?.twoHanded,
      weight: Number(def?.weight || 0),
      glyph: String(def?.glyph || ""),
      glyphColor: String(def?.color || "#cfe8ff"),
      mechanics,
      affixes: [],
      detailLines: [],
      targetEffects: [],
    },
  };
}

/**
 * @param {any} questDef
 * @param {any} vars
 * @returns {Array<{itemId:string,name:string,description:string,count:number}>}
 */
export function listQuestRewardItems(questDef, vars) {
  const choiceItems = listQuestRewardOptions(questDef, vars).flatMap((choice) => choice.items.map((item) => ({
    ...describeQuestRewardItem(item.itemId),
    count: item.count,
    choiceId: choice.id,
    choiceLabel: choice.label,
  })));
  return choiceItems.concat(listQuestRewardBonusItems(questDef, vars).map((item) => ({
    ...describeQuestRewardItem(item.itemId),
    count: item.count,
    choiceId: "",
    choiceLabel: "",
  })));
}

/**
 * Compact single-line text for HUD surfaces.
 * @param {any} questDef
 * @param {any} vars
 * @returns {string}
 */
export function questRewardPreviewText(questDef, vars) {
  const explicit = String(vars?.rewardText || questDef?.journal?.rewardText || "").trim();
  const options = listQuestRewardOptions(questDef, vars);
  const items = listQuestRewardItems(questDef, vars);
  if (items.length <= 0) return explicit;
  if (questDef?.journal?.rewardChoice === true) {
    const labels = options.map((choice) => choice.label || choice.items.map((item) => {
      const detail = describeQuestRewardItem(item.itemId);
      return `${item.count > 1 ? `${item.count}x ` : ""}${detail.name}`;
    }).join(" + "));
    return `Choose one: ${labels.join(", ")}`;
  }
  if (items.length === 1) {
    const item = items[0];
    return item.description ? `${item.name} - ${item.description}` : item.name;
  }
  return `Choose one: ${items.map((item) => item.name).join(", ")}`;
}

/**
 * Richer reward text for quest journal surfaces.
 * @param {any} questDef
 * @param {any} vars
 * @returns {string}
 */
export function questRewardDetailText(questDef, vars) {
  const explicit = String(vars?.rewardText || questDef?.journal?.rewardText || "").trim();
  const parts = [];
  const itemRows = listQuestRewardItems(questDef, vars)
    .filter((item) => questDef?.journal?.rewardChoice !== true || item.choiceId);
  for (const item of itemRows) {
    const label = item.count > 1 ? `${item.count}x ${item.name}` : item.name;
    parts.push(item.description ? `${label} - ${item.description}` : label);
  }

  const rewardGold = Math.max(0, Number(vars?.rewardGold || questDef?.journal?.rewardGold || 0) | 0);
  if (rewardGold > 0) parts.push(`${rewardGold} gold`);

  if (questDef?.journal?.rewardChoice === true && parts.length > 0) {
    const itemParts = listQuestRewardOptions(questDef, vars).map((choice) => choice.label || choice.items.map((item) => {
      const detail = describeQuestRewardItem(item.itemId);
      return `${item.count > 1 ? `${item.count}x ` : ""}${detail.name}`;
    }).join(" + "));
    const goldParts = parts.filter((part) => /^\d+ gold$/.test(part));
    const bonusParts = listQuestRewardBonusItems(questDef, vars).map((item) => {
      const detail = describeQuestRewardItem(item.itemId);
      return `${item.count > 1 ? `${item.count}x ` : ""}${item.label || detail.name}`;
    });
    const suffix = [...goldParts, ...bonusParts].join(" and ");
    return `Choose one: ${itemParts.join(", ")}${suffix ? `; plus ${suffix}` : ""}`;
  }

  const rewardItems = Array.isArray(questDef?.journal?.rewardItems)
    ? questDef.journal.rewardItems
    : [];
  const itemNames = new Set(listQuestRewardItems(questDef, vars).map((item) => item.name.toLowerCase()));
  for (const item of rewardItems) {
    const label = String(item?.label || "").trim();
    if (!label) continue;
    if (itemNames.has(label.toLowerCase())) continue;
    const count = Math.max(1, Number(item?.count || 1) | 0);
    parts.push(count > 1 ? `${count}x ${label}` : label);
  }

  if (parts.length <= 0 && explicit) return explicit;
  if (parts.length > 0) return parts.join(" and ");
  return "No reward recorded.";
}
