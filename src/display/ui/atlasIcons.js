import spellManifest from "../../../assets/icons/spells/manifest.js";
import itemManifest from "../../../assets/icons/items/manifest.js";
import statusManifest from "../../../assets/icons/statuses/manifest.js";
import corpseManifest from "../../../assets/icons/corpses/manifest.js";
import uxManifest from "../../../assets/icons/ux/manifest.js";
import classManifest from "../../../assets/icons/classes/manifest.js";

const SPELL_SHEET_URL = new URL("../../../assets/icons/spells/sheet.webp", import.meta.url).href;
const ITEM_SHEET_URL = new URL("../../../assets/icons/items/sheet.webp", import.meta.url).href;
const STATUS_SHEET_URL = new URL("../../../assets/icons/statuses/sheet.webp", import.meta.url).href;
const CORPSE_SHEET_URL = new URL("../../../assets/icons/corpses/sheet.webp", import.meta.url).href;
const UX_SHEET_URL = new URL("../../../assets/icons/ux/sheet.webp", import.meta.url);
UX_SHEET_URL.searchParams.set("v", String(globalThis.VERSION || "dev"));
const CLASS_SHEET_URL = new URL(`../../../assets/icons/classes/${classManifest.image}`, import.meta.url).href;

function buildAtlas(manifest, sheetUrl) {
  const entries = new Map();
  let columns = Math.max(1, Number(manifest?.columns) | 0);
  let rows = Math.max(1, Number(manifest?.rows) | 0);
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

function buildSpriteAtlas(manifest, sheetUrl) {
  const entries = new Map();
  const sprites = manifest?.sprites && typeof manifest.sprites === "object" ? manifest.sprites : {};
  for (const [id, sprite] of Object.entries(sprites)) {
    const x = Math.max(0, Number(sprite?.column) | 0);
    const y = Math.max(0, Number(sprite?.row) | 0);
    entries.set(String(id), { x, y });
  }
  return Object.freeze({
    entries,
    columns: Math.max(1, Number(manifest?.columns) | 0),
    rows: Math.max(1, Number(manifest?.rows) | 0),
    sheetUrl,
  });
}

export const SPELL_ICON_ATLAS = buildAtlas(spellManifest, SPELL_SHEET_URL);
export const ITEM_ICON_ATLAS = buildAtlas(itemManifest, ITEM_SHEET_URL);
export const STATUS_ICON_ATLAS = buildAtlas(statusManifest, STATUS_SHEET_URL);
export const CORPSE_ICON_ATLAS = buildAtlas(corpseManifest, CORPSE_SHEET_URL);
export const UX_ICON_ATLAS = buildSpriteAtlas(uxManifest, UX_SHEET_URL.href);
export const CLASS_ICON_ATLAS = buildSpriteAtlas(classManifest, CLASS_SHEET_URL);
export const CLASS_NORMAL_MAP_URL = new URL("../../../assets/icons/classes/normal.png", import.meta.url).href;

export const ICON_ATLASES = Object.freeze({
  spells: SPELL_ICON_ATLAS,
  items: ITEM_ICON_ATLAS,
  statuses: STATUS_ICON_ATLAS,
  corpses: CORPSE_ICON_ATLAS,
  ux: UX_ICON_ATLAS,
  classes: CLASS_ICON_ATLAS,
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
    id: identified
      ? String(rawId).replace(/^spell:/, "")
      : type === "scroll" ? "scroll_unknown" : "",
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

  // Use exact tile pixels rather than percentage positioning. Percentages
  // can round differently at small UI sizes and expose adjacent atlas cells.
  Object.assign(element.style, {
    display: "inline-block",
    width: `${size}px`,
    height: `${size}px`,
    backgroundImage: `url("${atlas.sheetUrl}")`,
    backgroundSize: `${atlas.columns * size}px ${atlas.rows * size}px`,
    backgroundPosition: `-${entry.x * size}px -${entry.y * size}px`,
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
    flex: "0 0 auto",
  });
  if (typeof element.setAttribute === "function") element.setAttribute("aria-hidden", "true");
  element.textContent = "";
  return true;
}
