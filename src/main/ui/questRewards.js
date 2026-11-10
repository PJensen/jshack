import { getCatalogItem } from "../../rules/data/itemCatalog.js";

/**
 * @param {any} questDef
 * @param {any} vars
 * @returns {string[]}
 */
export function listQuestRewardItemIds(questDef, vars) {
  const raw = Array.isArray(vars?.rewardItemIds)
    ? vars.rewardItemIds
    : (Array.isArray(questDef?.journal?.rewardItemIds) ? questDef.journal.rewardItemIds : []);
  return raw.map((id) => String(id || "").trim()).filter(Boolean);
}

/**
 * @param {string} itemId
 * @returns {{ itemId:string, name:string, description:string }}
 */
export function describeQuestRewardItem(itemId) {
  const id = String(itemId || "").trim();
  const def = id ? getCatalogItem(id) : null;
  const name = String(def?.name || id || "Reward").trim();
  const description = String(def?.description || "").trim();
  const rarity = Number(def?.rarity || 0) | 0;
  const rarityName = String(def?.rarityName || (["common", "uncommon", "rare", "epic", "legendary"][rarity] || "common"));
  const type = String(def?.type || "item");
  const slot = String(def?.slot || (type === "ranged" ? "ranged" : type === "weapon" ? "weapon" : ""));
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
      rarityName,
      description,
      bonuses: def?.bonuses && typeof def.bonuses === "object" ? { ...def.bonuses } : {},
      damageDice: def?.damageDice || null,
      staminaCost: def?.staminaCost ?? null,
      twoHanded: !!def?.twoHanded,
      weight: Number(def?.weight || 0),
      glyph: String(def?.glyph || ""),
      glyphColor: String(def?.color || "#cfe8ff"),
      mechanics: [],
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
  const authored = Array.isArray(questDef?.journal?.rewardItems)
    ? questDef.journal.rewardItems.filter((item) => item?.itemId)
    : [];
  const ids = authored.length > 0
    ? authored.map((item) => String(item.itemId || ""))
    : listQuestRewardItemIds(questDef, vars);
  return ids.map((id, index) => ({
    ...describeQuestRewardItem(id),
    count: Math.max(1, Number(authored[index]?.count || vars?.rewardItemCounts?.[id] || 1) | 0),
  }));
}

/**
 * Compact single-line text for HUD surfaces.
 * @param {any} questDef
 * @param {any} vars
 * @returns {string}
 */
export function questRewardPreviewText(questDef, vars) {
  const explicit = String(vars?.rewardText || questDef?.journal?.rewardText || "").trim();
  const items = listQuestRewardItems(questDef, vars);
  if (items.length <= 0) return explicit;
  if (questDef?.journal?.rewardChoice === true) {
    const labels = items.map((item) => `${item.count > 1 ? `${item.count}x ` : ""}${item.name}`);
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
  for (const item of listQuestRewardItems(questDef, vars)) {
    const label = item.count > 1 ? `${item.count}x ${item.name}` : item.name;
    parts.push(item.description ? `${label} - ${item.description}` : label);
  }

  const rewardGold = Math.max(0, Number(vars?.rewardGold || questDef?.journal?.rewardGold || 0) | 0);
  if (rewardGold > 0) parts.push(`${rewardGold} gold`);

  if (questDef?.journal?.rewardChoice === true && parts.length > 0) {
    const itemParts = listQuestRewardItems(questDef, vars)
      .map((item) => `${item.count > 1 ? `${item.count}x ` : ""}${item.name}`);
    const goldParts = parts.filter((part) => /^\d+ gold$/.test(part));
    return `Choose one: ${itemParts.join(", ")}${goldParts.length > 0 ? `; plus ${goldParts[0]}` : ""}`;
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
