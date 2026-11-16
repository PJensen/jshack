import { getClass, listClassIds } from "../rules/data/classes.js";
import { getDeity } from "../rules/data/deities.js";

export function getClassDisplayOrder() {
  const displayOrder = listClassIds();
  const idxDruid = displayOrder.indexOf('druid');
  const idxWarden = displayOrder.indexOf('warden');
  if (idxDruid !== -1 && idxWarden !== -1) {
    [displayOrder[idxDruid], displayOrder[idxWarden]] = [displayOrder[idxWarden], displayOrder[idxDruid]];
  }
  return displayOrder;
}

export function buildClassDisplayData() {
  return getClassDisplayOrder().map((id) => {
    const cls = getClass(id);
    const deity = getDeity(cls.deityId);
    return {
      id: cls.id,
      name: cls.name,
      glyph: cls.glyph || cls.id[0] || "?",
      icon: cls.icon || cls.name[0],
      iconAtlas: "classes",
      iconId: cls.id,
      description: cls.description,
      deityName: deity?.name ?? cls.deityId,
      deityAlignment: deity?.alignment ?? '',
    };
  });
}
