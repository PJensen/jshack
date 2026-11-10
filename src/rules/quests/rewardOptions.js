/**
 * Normalize authored quest reward choices into one canonical shape.
 *
 * A choice may contain a single item (legacy rewardItemIds/rewardItems) or a
 * package of items. The latter keeps reward balance and presentation in the
 * quest definition instead of scattering grant logic through quest scripts.
 */
export function listQuestRewardOptions(questDef, vars = {}) {
  const authored = Array.isArray(vars?.rewardChoices)
    ? vars.rewardChoices
    : (Array.isArray(questDef?.journal?.rewardChoices) ? questDef.journal.rewardChoices : []);
  if (authored.length > 0) {
    return authored.map((choice, index) => {
      const items = Array.isArray(choice?.items)
        ? choice.items
        : (choice?.itemId ? [{ itemId: choice.itemId, count: choice.count }] : []);
      return {
        id: String(choice?.id || items[0]?.itemId || `choice_${index + 1}`),
        label: String(choice?.label || "").trim(),
        items: items
          .filter((item) => item?.itemId)
          .map((item) => ({
            itemId: String(item.itemId),
            count: Math.max(1, Number(item.count || 1) | 0),
          })),
      };
    }).filter((choice) => choice.items.length > 0);
  }

  const authoredItems = Array.isArray(questDef?.journal?.rewardItems)
    ? questDef.journal.rewardItems.filter((item) => item?.itemId)
    : [];
  const ids = authoredItems.length > 0
    ? authoredItems
    : (Array.isArray(questDef?.journal?.rewardItemIds)
      ? questDef.journal.rewardItemIds.map((itemId) => ({ itemId }))
      : []);
  return ids.map((item, index) => ({
    id: String(item.itemId || `choice_${index + 1}`),
    label: String(item.label || "").trim(),
    items: [{
      itemId: String(item.itemId),
      count: Math.max(1, Number(item.count || vars?.rewardItemCounts?.[item.itemId] || 1) | 0),
    }],
  }));
}

export function listQuestRewardItems(questDef, vars = {}) {
  return listQuestRewardOptions(questDef, vars).flatMap((choice) => choice.items);
}

export function listQuestRewardBonusItems(questDef, vars = {}) {
  const authored = Array.isArray(vars?.rewardBonusItems)
    ? vars.rewardBonusItems
    : (Array.isArray(questDef?.journal?.rewardBonusItems) ? questDef.journal.rewardBonusItems : []);
  return authored.filter((item) => item?.itemId).map((item) => ({
    itemId: String(item.itemId),
    count: Math.max(1, Number(item.count || 1) | 0),
    label: String(item.label || "").trim(),
  }));
}

export function selectedQuestRewardItemIds(questDef, vars, rewardId) {
  const selected = listQuestRewardOptions(questDef, vars)
    .find((choice) => choice.id === String(rewardId || "")
      || choice.items.some((item) => item.itemId === String(rewardId || "")));
  return selected ? selected.items.map((item) => item.itemId) : [];
}
