import spellManifest from "../../../assets/icons/spells/manifest.js";
import itemManifest from "../../../assets/icons/items/manifest.js";
import statusManifest from "../../../assets/icons/statuses/manifest.js";
import corpseManifest from "../../../assets/icons/corpses/manifest.js";

const SPELL_SHEET_URL = new URL("../../../assets/icons/spells/sheet.webp", import.meta.url).href;
const ITEM_SHEET_URL = new URL("../../../assets/icons/items/sheet.webp", import.meta.url).href;
const STATUS_SHEET_URL = new URL("../../../assets/icons/statuses/sheet.webp", import.meta.url).href;
const CORPSE_SHEET_URL = new URL("../../../assets/icons/corpses/sheet.webp", import.meta.url).href;

function buildAtlas(manifest, sheetUrl) {
  const entries = new Map();
  let columns = 1;
  let rows = 1;
  for (const entry of Array.isArray(manifest?.entries) ? manifest.entries : []) {
    const id = String(entry?.id || "").trim();
    if (!id) continue;
    const x = Math.max(0, Number(entry.x) | 0);
    const y = Math.max(0, Number(entry.y) | 0);
    entries.set(id, { x, y });
    columns = Math.max(columns, x + 1);
    rows = Math.max(rows, y + 1);
  }
  return Object.freeze({ entries, columns, rows, sheetUrl });
}

export const SPELL_ICON_ATLAS = buildAtlas(spellManifest, SPELL_SHEET_URL);
export const ITEM_ICON_ATLAS = buildAtlas(itemManifest, ITEM_SHEET_URL);
export const STATUS_ICON_ATLAS = buildAtlas(statusManifest, STATUS_SHEET_URL);
export const CORPSE_ICON_ATLAS = buildAtlas(corpseManifest, CORPSE_SHEET_URL);

export const ICON_ATLASES = Object.freeze({
  spells: SPELL_ICON_ATLAS,
  items: ITEM_ICON_ATLAS,
  statuses: STATUS_ICON_ATLAS,
  corpses: CORPSE_ICON_ATLAS,
});

/** @param {string} name */
export function getIconAtlas(name) {
  return ICON_ATLASES[String(name || "").trim()] || ITEM_ICON_ATLAS;
}

/**
 * Resolve the canonical atlas and identity for an item-shaped display record.
 * Callers still own their fallback glyph and size, but atlas selection and
 * unidentified-item protection live here.
 * @param {any} item
 * @param {string} [defaultAtlas]
 * @returns {{atlas:any, id:string}}
 */
export function resolveIconReference(item, defaultAtlas = "items") {
  const type = String(item?.type || "").toLowerCase();
  const identified = item?.identified !== false;
  const identity = String(item?.identity || item?.details?.identity || "").trim();
  const inferredAtlas = identity.startsWith("corpse_")
    ? "corpses"
    : type === "spell" ? "spells" : defaultAtlas;
  const atlasName = String(identity.startsWith("corpse_")
    ? "corpses"
    : item?.iconAtlas || inferredAtlas || "items");
  const isSpellAtlas = atlasName === "spells";
  const rawId = isSpellAtlas
    ? (item?.iconId || item?.spellId || item?.id || "")
    : (item?.iconId || identity || item?.id || "");
  return {
    atlas: getIconAtlas(atlasName),
    id: identified ? String(rawId).replace(/^spell:/, "") : "",
  };
}

/**
 * Apply a WebP atlas icon to an existing text-fallback element.
 * @param {HTMLElement} element
 * @param {{atlas:any, id:string}} iconRef
 * @param {string} fallback
 * @param {number} size
 * @returns {boolean}
 */
export function applyAtlasIcon(element, iconRef, fallback = "", size = 24) {
  if (!element) return false;
  const atlas = iconRef?.atlas;
  const normalizedId = String(iconRef?.id || "").trim();
  const entry = atlas?.entries?.get(normalizedId);
  element.textContent = fallback;
  element.style.backgroundImage = "";
  element.style.backgroundSize = "";
  element.style.backgroundPosition = "";
  element.style.backgroundRepeat = "";
  element.style.imageRendering = "";
  element.style.width = "";
  element.style.height = "";
  element.style.display = "";

  if (!entry) return false;

  const xPct = atlas.columns > 1 ? (entry.x / (atlas.columns - 1)) * 100 : 0;
  const yPct = atlas.rows > 1 ? (entry.y / (atlas.rows - 1)) * 100 : 0;
  Object.assign(element.style, {
    display: "inline-block",
    width: `${size}px`,
    height: `${size}px`,
    backgroundImage: `url("${atlas.sheetUrl}")`,
    backgroundSize: `${atlas.columns * 100}% ${atlas.rows * 100}%`,
    backgroundPosition: `${xPct}% ${yPct}%`,
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
    flex: "0 0 auto",
  });
  if (typeof element.setAttribute === "function") element.setAttribute("aria-hidden", "true");
  element.textContent = "";
  return true;
}
