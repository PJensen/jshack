import spellManifest from "../../../assets/icons/spells/manifest.js";
import itemManifest from "../../../assets/icons/items/manifest.js";

const SPELL_SHEET_URL = new URL("../../../assets/icons/spells/sheet.webp", import.meta.url).href;
const ITEM_SHEET_URL = new URL("../../../assets/icons/items/sheet.webp", import.meta.url).href;

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

/**
 * Apply a WebP atlas icon to an existing text-fallback element.
 * @param {HTMLElement} element
 * @param {{entries: Map<string, {x:number,y:number}>, columns:number, rows:number, sheetUrl:string}} atlas
 * @param {string} id
 * @param {string} fallback
 * @param {number} size
 * @returns {boolean}
 */
export function applyAtlasIcon(element, atlas, id, fallback = "", size = 24) {
  if (!element) return false;
  const entry = atlas?.entries?.get(String(id || "").trim());
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
