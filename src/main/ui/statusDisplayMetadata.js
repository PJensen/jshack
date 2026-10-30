import { basePalette } from "../../display/palette/base.js";
import { equipmentPalette } from "../../display/palette/equipment.js";
import { EFFECT_DEFS } from "../../rules/data/effectDefs.js";
import { getEffectDefinition } from "../../rules/data/effectInstances.js";

function hexToHue(value, fallback = 210) {
  const hex = String(value || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return fallback;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = ((b - r) / d) + 2;
  else h = ((r - g) / d) + 4;
  return Math.round((h * 60 + 360) % 360);
}

const EFFECT_META_BY_KEY = (() => {
  const map = new Map();
  for (let i = 0; i < EFFECT_DEFS.length; i++) {
    const def = EFFECT_DEFS[i];
    const keys = []
      .concat(Array.isArray(def?.keys) ? def.keys : [])
      .concat(Array.isArray(def?.statuses) ? def.statuses : []);
    for (let k = 0; k < keys.length; k++) {
      const key = String(keys[k] || "").trim().toLowerCase();
      if (!key || map.has(key)) continue;
      map.set(key, def);
    }
  }
  return map;
})();

function effectDefForKey(key) {
  return EFFECT_META_BY_KEY.get(String(key || "").trim().toLowerCase()) || null;
}

function humanizeKey(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_DISPLAY_META = Object.freeze({
  lethargic: Object.freeze({ name: "Lethargic", glyph: "\u{1F9A5}", hue: 210 }),
  slowed: Object.freeze({ name: "Slowed", glyph: "\u{1F40C}", hue: 195 }),
});

const SOURCE_DISPLAY_META = Object.freeze({
  "stun:potion_paralysis": Object.freeze({ name: "Paralyzed", glyph: "\u{1F512}", hue: 45 }),
  "stunned:potion_paralysis": Object.freeze({ name: "Paralyzed", glyph: "\u{1F512}", hue: 45 }),
});

function operationLine(operation, potency) {
  const amount = Math.max(0, Number(potency || 0));
  const suffix = amount > 0 ? ` ${amount}/turn` : "";
  switch (String(operation || "none")) {
    case "damage": return `Deals damage${suffix}.`;
    case "heal": return `Restores HP${suffix}.`;
    case "stamina_restore": return `Restores stamina${suffix}.`;
    case "mana_restore": return `Restores mana${suffix}.`;
    case "none": return "";
    default: return humanizeKey(operation);
  }
}

function effectDetailData(row) {
  const def = effectDefForKey(row?.key);
  const turns = row?.turns === Infinity ? Infinity : Math.max(0, Number(row?.turns || 0) | 0);
  const stacks = Math.max(1, Number(row?.stacks || 1) | 0);
  const potency = Number(row?.potency || 0);
  const detailLines = [];
  if (turns === Infinity || turns >= 9999) detailLines.push("Duration indefinite");
  else detailLines.push(`${turns} turns remaining`);
  if (stacks > 1) detailLines.push(`Stacks x${stacks}`);
  if (potency > 0) detailLines.push(`Potency ${potency}`);

  const operations = Array.isArray(def?.operations) && def.operations.length > 0
    ? def.operations
    : (def?.operation ? [def.operation] : []);
  const targetEffects = operations
    .map((op) => operationLine(op, potency))
    .filter(Boolean);

  const statusKeys = Array.isArray(def?.statuses) ? def.statuses : [];
  for (const status of statusKeys) {
    const statusKey = String(status || "").trim();
    if (!statusKey || statusKey === row?.key) continue;
    targetEffects.push(`Projects ${humanizeKey(statusKey)}.`);
  }

  return {
    description: String(def?.description || "").trim(),
    detailLines,
    targetEffects,
  };
}

export function statusDisplayMetadata(key, sourceKey = "") {
  const sourceMeta = SOURCE_DISPLAY_META[`${String(key || "").toLowerCase()}:${String(sourceKey || "").toLowerCase()}`];
  if (sourceMeta) return sourceMeta;
  const statusMeta = STATUS_DISPLAY_META[String(key || "").toLowerCase()];
  if (statusMeta) return statusMeta;
  const definition = getEffectDefinition(key);
  if (!definition) return null;
  const identity = definition.visualIdentity || sourceKey;
  const palette = equipmentPalette[identity] || basePalette[identity];
  return {
    name: definition.name || humanizeKey(key),
    ...(palette ? { glyph: palette.glyph, glyphColor: palette.fg, glowColor: palette.glow, hue: hexToHue(palette.glow || palette.fg) } : {}),
  };
}

export function enrichStatusRowDisplay(row) {
  if (!row || typeof row !== "object") return row;
  const definition = getEffectDefinition(row.key);
  const meta = statusDisplayMetadata(row.key, row.sourceKey);
  const details = effectDetailData(row);
  if (definition) {
    if (row.sourceKey) details.detailLines.push(`Source: ${humanizeKey(row.sourceKey)}`);
    details.description = definition.description || "";
    details.targetEffects = definition.periodic.map((op) => {
      const amount = op.amount * Number(row.potency ?? 1) * Number(row.stacks || 1);
      const cadence = op.interval === 1 ? "each turn" : `every ${op.interval} turns`;
      const labels = { heal: "Restores HP", damage: "Deals damage", stamina_restore: "Restores stamina", mana_restore: "Restores mana", mana_drain: "Drains mana", stamina_drain: "Drains stamina" };
      return `${labels[op.operation]} ${amount} ${cadence}.`;
    });
    for (const status of definition.statuses) {
      if (status !== row.key) details.targetEffects.push(humanizeKey(status));
    }
  }
  return meta ? { ...row, ...meta, ...details } : { ...row, ...details };
}
