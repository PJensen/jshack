// display/ui/hud.js
// Minimal HUD with an Active Spell button.
import { createConcentricGauge } from './concentricGauge.js';
import { renderItemDetails } from './overlay.js';
import { ensureItemTooltip, positionTooltip, rarityStyle, UX_THEME } from './overlayUtils.js';
import { UI_ACTION_GLYPHS, UI_PET_STATE_GLYPHS } from './iconGlyphs.js';
import { GAME_TEXT_FONT_FAMILY } from '../fonts.js';
import { createPinnedItemSlots } from './pinnedItemSlots.js';
import { createMobileSpellRadial } from './mobileRadial.js';
import { createPinnedSpellDock } from './spellDock.js';

const HUD_BUTTON_BG = 'linear-gradient(180deg, #2a2f35 0%, #1f2329 100%)';
const HUD_BUTTON_ACTIVE_BG = 'linear-gradient(180deg, #3a3328 0%, #2a231c 100%)';
const HUD_BUTTON_BORDER = '1px solid #6f7d8d';

/**
 * @template T
 * @param {T[]} stack
 * @returns {T|undefined}
 */
export function peekStackTop(stack) {
  if (!Array.isArray(stack) || stack.length <= 0) return undefined;
  return stack[stack.length - 1];
}

/**
 * @template T
 * @param {T[]} stack
 * @param {(entry: T) => boolean} isActionable
 */
export function popUntilActionableTop(stack, isActionable) {
  if (!Array.isArray(stack)) return;
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (isActionable(top)) break;
    stack.pop();
  }
}

/**
 * @param {any} it
 * @returns {"identify"|"apply"|"equip"|"drink"|"use"}
 */
export function getQuickChipPrimaryAction(it) {
  const identity = String(it?.identity || it?.details?.identity || '');
  if (identity === 'scroll_identify') return 'apply';
  const t = String(it?.type || '');
  if (t === 'potion') return 'drink';
  if (it?.canApply) return 'apply';
  if (it?.canUse && !!it?.equipped) return 'use';
  if (t === 'gem') return 'apply';
  if (t === 'equip' || t === 'ammo' || t === 'wand') return 'equip';
  return 'use';
}

/**
 * @param {any} it
 * @returns {boolean}
 */
export function canQuickChipIdentify(it) {
  const identity = String(it?.identity || '');
  if (identity === 'scroll_identify') return false;
  const identified = it?.identified ?? it?.details?.identified;
  return identified === false;
}

/**
 * @param {any} it
 * @returns {boolean}
 */
export function hasScrollForIdentify(it) {
  return !!it?.hasScrollOfIdentify;
}

/**
 * @param {any} it
 * @returns {string}
 */
export function getQuickChipPrimaryActionLabel(it) {
  const action = getQuickChipPrimaryAction(it);
  if (action === 'apply') return String(it?.type || '') === 'gem' ? 'Socket' : 'Apply';
  if (action === 'equip') return 'Equip';
  if (action === 'drink') return 'Drink';
  return 'Use';
}

/**
 * @param {any} it
 * @param {{ expanded?: boolean }} opts
 * @returns {string}
 */
export function getQuickChipDetailLine(it, opts = {}) {
  const expanded = !!opts?.expanded;
  const count = normalizePositiveCount(it?.count);
  if (expanded) return `x${count} • details open`;
  const actionable = isQuickChipActionable(it);
  if (actionable && !!it?.justPickedUp) return `x${count} • just picked up • tap for details/pin`;
  if (actionable) return `x${count} • tap for details`;
  return `x${count} • picked up`;
}

/**
 * @param {any} it
 * @returns {boolean}
 */
export function isQuickChipActionable(it) {
  const t = String(it?.type || '');
  if (t === 'equip' || t === 'ammo' || t === 'wand') return true;
  if (t === 'tool') return true;
  if (t === 'potion' || t === 'scroll' || t === 'learn' || t === 'book' || t === 'food' || t === 'gem') return (it?.count || 0) > 0;
  return false;
}

export const QUICK_CHIP_DISMISS_LAYOUT = Object.freeze({
  chipPosition: 'relative',
  contentPaddingRight: '66px',
  top: '6px',
  right: '8px',
});

export const MOBILE_ACTION_BAR_GRID_AREAS = Object.freeze({
  character: Object.freeze({ col: '1', row: '1' }),
  pet: Object.freeze({ col: '2', row: '1' }),
  posture: Object.freeze({ col: '3', row: '1' }),
  pray: Object.freeze({ col: '4', row: '1' }),
  wait: Object.freeze({ col: '5', row: '1' }),
  attack: Object.freeze({ col: '6', row: '1' }),
  shoot: Object.freeze({ col: '7', row: '1' }),
});

const STARTER_PIN_PRIORITY = Object.freeze([
  Object.freeze(['hearthstone']),
  Object.freeze(['potion_mana', 'mana_potion']),
  Object.freeze(['potion_health', 'healing_potion']),
]);

const STARTER_PIN_SKIP_IDENTITIES = new Set([
  'scroll_identify',
  'ammo_arrows',
  'ammo_fire_arrows',
  'ammo_piercing_arrows',
  'ammo_bodkin_arrows',
  'ammo_blunt_arrows',
  'ammo_bomb_arrows',
]);

/**
 * @param {any} item
 * @returns {string}
 */
export function getQuickPinKey(item) {
  const identity = String(item?.identity || item?.details?.identity || '');
  if (identity) return identity;
  const id = Number(item?.id || 0) | 0;
  return id > 0 ? `id:${id}` : '';
}

/**
 * @param {Array<any>} pinned
 * @param {any} item
 * @returns {boolean}
 */
export function isPinnedQuickItem(pinned, item) {
  const key = getQuickPinKey(item);
  if (!key) return false;
  const source = Array.isArray(pinned) ? pinned : [];
  return source.some((entry) => getQuickPinKey(entry) === key);
}

/**
 * @param {Array<any>} inventoryItems
 * @param {number} capacity
 * @returns {Array<any>}
 */
export function buildStartingPinnedQuickItems(inventoryItems, capacity = 4) {
  const max = Math.max(1, Number(capacity || 4) | 0);
  const bag = Array.isArray(inventoryItems)
    ? inventoryItems.filter((item) => Math.max(0, Number(item?.count || 0) | 0) > 0)
    : [];
  if (!bag.length) return [];

  const selected = [];
  const usedKeys = new Set();
  const pushUnique = (item) => {
    if (!item || selected.length >= max) return;
    const key = getQuickPinKey(item);
    if (!key || usedKeys.has(key)) return;
    usedKeys.add(key);
    selected.push(item);
  };

  for (const aliases of STARTER_PIN_PRIORITY) {
    const pick = bag.find((item) => aliases.includes(String(item?.identity || '').toLowerCase()));
    if (pick) pushUnique(pick);
    if (selected.length >= max) return selected;
  }

  const coreIdentities = new Set(STARTER_PIN_PRIORITY.flat());
  for (const item of bag) {
    const identity = String(item?.identity || '').toLowerCase();
    if (!identity) continue;
    if (coreIdentities.has(identity)) continue;
    if (STARTER_PIN_SKIP_IDENTITIES.has(identity)) continue;
    pushUnique(item);
    break;
  }

  return selected;
}

/**
 * @param {Array<any>} pinned
 * @param {any} item
 * @param {number} capacity
 * @returns {Array<any>}
 */
export function upsertPinnedQuickItemLifo(pinned, item, capacity = 3) {
  const max = Math.max(1, Number(capacity || 3) | 0);
  const source = Array.isArray(pinned) ? pinned : [];
  const next = source.slice();
  const id = Number(item?.id || 0) | 0;
  const identity = String(item?.identity || item?.details?.identity || '');
  const pinKey = getQuickPinKey(item);
  if (!pinKey) return next;
  const idx = next.findIndex((entry) => String(entry?.pinKey || '') === pinKey);
  if (idx >= 0) next.splice(idx, 1);
  if (next.length >= max) next.shift();
  next.push({ ...item, id, identity, pinKey });
  return next;
}

/**
 * @param {Array<any>} pinned
 * @param {Array<any>} inventoryItems
 * @returns {Array<any>}
 */
export function reconcilePinnedQuickItemsWithInventory(pinned, inventoryItems) {
  const source = Array.isArray(pinned) ? pinned : [];
  const items = Array.isArray(inventoryItems) ? inventoryItems : [];
  /** @type {Map<string, { count:number, item:any }>} */
  const byPinKey = new Map();
  for (const item of items) {
    const count = Math.max(0, Number(item?.count || 0) | 0);
    const identity = String(item?.identity || item?.details?.identity || '');
    if (identity) {
      const prev = byPinKey.get(identity);
      byPinKey.set(identity, { count: (prev?.count || 0) + count, item: item });
      continue;
    }
    const rawIds = Array.isArray(item?.entityIds) ? item.entityIds : [item?.id];
    for (const rawId of rawIds) {
      const id = Number(rawId || 0) | 0;
      if (!(id > 0)) continue;
      byPinKey.set(`id:${id}`, { count, item });
    }
  }
  const out = [];
  for (const entry of source) {
    const entryId = Number(entry?.id || 0) | 0;
    const entryIdentity = String(entry?.identity || entry?.details?.identity || '');
    const key = String(entry?.pinKey || entryIdentity || (entryId > 0 ? `id:${entryId}` : ''));
    if (!key) continue;
    const rec = byPinKey.get(key);
    const count = Number(rec?.count || 0) | 0;
    if (!(count > 0)) continue;
    const fresh = rec?.item && typeof rec.item === 'object' ? rec.item : null;
    out.push({
      ...entry,
      ...(fresh || {}),
      pinKey: key,
      count,
      id: Number(fresh?.id || entry?.id || 0) | 0,
      identity: String(fresh?.identity || entry?.identity || ''),
      details: fresh?.details || entry?.details,
    });
  }
  return out;
}

/**
 * @param {Array<any>} pinned
 * @param {{ pinKey?:string, identity?:string, itemId?:number } | null | undefined} usedDetail
 * @returns {Array<any>}
 */
export function applyPinnedQuickItemUse(pinned, usedDetail) {
  const source = Array.isArray(pinned) ? pinned : [];
  const key = String(usedDetail?.pinKey || usedDetail?.identity || '');
  const hasKey = key.length > 0;
  const itemId = Number(usedDetail?.itemId || 0) | 0;
  const hasItemId = itemId > 0;
  if (!hasKey && !hasItemId) return source.slice();
  const out = [];
  for (const entry of source) {
    const entryId = Number(entry?.id || 0) | 0;
    const entryIdentity = String(entry?.identity || entry?.details?.identity || '');
    const entryKey = String(entry?.pinKey || entryIdentity || (entryId > 0 ? `id:${entryId}` : ''));
    const matches = (hasKey && entryKey === key) || (!hasKey && hasItemId && entryId === itemId);
    if (!matches) {
      out.push(entry);
      continue;
    }
    const nextCount = Math.max(0, Number(entry?.count || 0) - 1);
    if (!(nextCount > 0)) continue;
    out.push({ ...entry, count: nextCount });
  }
  return out;
}

/**
 * @param {Array<any>} a
 * @param {Array<any>} b
 * @returns {boolean}
 */
export function arePinnedArraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (String(a[i]?.pinKey || '') !== String(b[i]?.pinKey || '')) return false;
    if (Number(a[i]?.id || 0) !== Number(b[i]?.id || 0)) return false;
    if (Number(a[i]?.count || 0) !== Number(b[i]?.count || 0)) return false;
  }
  return true;
}

/**
 * @param {any} value
 * @returns {number}
 */
export function normalizePositiveCount(value) {
  return Math.max(1, Number(value || 1) | 0);
}

/**
 * @param {string} text
 * @returns {string}
 */
function bracketizeLabel(text) {
  const s = String(text || "");
  if (s.startsWith("[") && s.endsWith("]")) return s;
  return `[${s}]`;
}

export function initHUD() {
  const root = ensureRoot();
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed', left: '8px', right: '8px', bottom: 'calc(var(--jshack-ticker-height, 30px) + 8px + env(safe-area-inset-bottom, 0px))',
    display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center',
    pointerEvents: 'auto', zIndex: 900
  });

  // Top-right HUD cluster for gauge + active effects (vertical stack).
  const topRightHud = document.createElement('div');
  Object.assign(topRightHud.style, {
    position: 'fixed',
    right: 'calc(8px + env(safe-area-inset-right, 0px))',
    top: 'calc(8px + env(safe-area-inset-top, 0px))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '8px',
    pointerEvents: 'none',
    zIndex: 905,
  });

  // Top-right concentric vitals gauge (HP/Mana/Stamina)
  const vitals = document.createElement('div');
  vitals.id = 'hud-vitals';
  Object.assign(vitals.style, {
    position: 'relative',
    width: 'min(188px, 22vw)',
    height: 'min(188px, 22vw)',
    flex: '0 0 auto',
    pointerEvents: 'none',
  });
  const vitalsGauge = createConcentricGauge(vitals, {
    health: 1,
    mana: 1,
    stamina: 1,
    hpValue: 1,
    hpMax: 1,
    manaValue: 1,
    manaMax: 1,
    staminaValue: 1,
    staminaMax: 1,
  });

  // Camera zoom buttons (+ / −) below the gauge
  function makeZoomBtn(label, factor) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.title = factor > 1 ? 'Zoom in' : 'Zoom out';
    Object.assign(btn.style, {
      width: '22px', height: '22px',
      padding: '0', margin: '0',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: '4px',
      background: 'rgba(16,22,38,0.75)',
      color: 'rgba(255,255,255,0.7)',
      fontSize: '14px', lineHeight: '1',
      cursor: 'pointer',
      pointerEvents: 'auto',
      display: 'grid', placeItems: 'center',
      touchAction: 'manipulation',
    });
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('ui:zoom', { detail: { factor } }));
    });
    return btn;
  }

  const moonPhaseEl = document.createElement('div');
  let moonEmoji = '\uD83C\uDF11';
  let moonLabel = 'New Moon';
  let clockEmoji = '\uD83D\uDD5B';
  let clockLabel = '12:00 AM';

  function syncSkyChip() {
    moonPhaseEl.textContent = `${moonEmoji} ${clockEmoji} ${clockLabel}`;
    moonPhaseEl.title = `${moonLabel} • ${clockLabel}`;
  }

  Object.assign(moonPhaseEl.style, {
    minWidth: '104px',
    minHeight: '28px',
    padding: '4px 10px',
    borderRadius: '14px',
    border: UX_THEME.surfaceBorder,
    background: 'linear-gradient(180deg, rgba(42,47,53,0.92) 0%, rgba(24,22,20,0.94) 100%)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.28), inset 0 1px 0 rgba(188,206,224,0.08)',
    color: UX_THEME.textStrong,
    fontSize: '16px',
    fontWeight: '700',
    lineHeight: '20px',
    letterSpacing: '0.02em',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    textShadow: '0 1px 0 rgba(0,0,0,0.7)',
  });
  syncSkyChip();

  const zoomBar = document.createElement('div');
  Object.assign(zoomBar.style, {
    display: 'flex',
    gap: '4px',
    justifyContent: 'center',
    pointerEvents: 'auto',
  });
  zoomBar.appendChild(makeZoomBtn('\u2212', 1 / 1.2)); // zoom out
  zoomBar.appendChild(makeZoomBtn('+', 1.2));           // zoom in

  const zoomHud = document.createElement('div');
  Object.assign(zoomHud.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
    marginTop: '4px',
    pointerEvents: 'auto',
  });
  zoomHud.appendChild(zoomBar);
  zoomHud.appendChild(moonPhaseEl);

  // Active effects HUD: vertical stack below the gauge on the right side.
  // Effects HUD — anchored top-left, horizontal flex row across the top.
  const effectsHud = document.createElement('div');
  Object.assign(effectsHud.style, {
    position: 'fixed',
    left: 'calc(8px + env(safe-area-inset-left, 0px))',
    top: 'calc(8px + env(safe-area-inset-top, 0px))',
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px',
    padding: '6px 8px', borderRadius: UX_THEME.radius,
    background: 'rgba(10, 9, 8, 0.58)', border: UX_THEME.surfaceBorderSoft,
    boxShadow: 'inset 0 0 0 1px rgba(188,206,224,0.04)',
    pointerEvents: 'none',
    zIndex: 905,
  });
  const statusRow = document.createElement('div');
  Object.assign(statusRow.style, {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: '6px',
  });
  const affixRow = document.createElement('div');
  Object.assign(affixRow.style, { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: '4px' });
  const questRow = document.createElement('div');
  Object.assign(questRow.style, {
    display: 'none',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '4px',
    width: 'min(280px, calc(100vw - 32px))',
    pointerEvents: 'auto',
  });
  effectsHud.appendChild(statusRow);
  effectsHud.appendChild(questRow);
  effectsHud.appendChild(affixRow);
  topRightHud.appendChild(vitals);
  topRightHud.appendChild(zoomHud);
  root.appendChild(topRightHud);
  root.appendChild(effectsHud);
  vitalsGauge.draw();

  // Help button — desktop only, top-left corner
  const helpBtn = document.createElement('button');
  helpBtn.textContent = '\u2139'; // ℹ information symbol
  helpBtn.title = 'Help & Reference';
  Object.assign(helpBtn.style, {
    position: 'fixed', left: '8px', bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
    width: '36px', height: '36px',
    padding: '0', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    fontSize: '20px', cursor: 'pointer',
    pointerEvents: 'auto', zIndex: 910,
    lineHeight: '36px', textAlign: 'center',
    display: 'none'
  });
  helpBtn.addEventListener('click', () => window.open('./tools/help/', '_blank'));
  root.appendChild(helpBtn);

  const charBtn = document.createElement('button');
  charBtn.id = 'btn-character-sheet';
  charBtn.textContent = 'Character';
  Object.assign(charBtn.style, {
    padding: '8px 12px', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    cursor: 'pointer'
  });
  charBtn.addEventListener('click', () => {
    try { window.dispatchEvent(new CustomEvent('ui:toggleCharacter')); } catch (e) { console.debug('[hud] dispatch ui:toggleCharacter:', e); }
  });

  // Bag (inventory) button
  const bagBtn = document.createElement('button');
  bagBtn.id = 'btn-bag';
  bagBtn.textContent = 'Bag';
  Object.assign(bagBtn.style, {
    padding: '8px 12px', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    cursor: 'pointer'
  });
  bagBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('ui:openInventory'));
  });

  const castBtn = document.createElement('button');
  castBtn.id = 'active-spell';
  castBtn.textContent = 'Cast';
  Object.assign(castBtn.style, {
    padding: '8px 12px', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    cursor: 'pointer'
  });
  castBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('ui:castActiveSpell'));
  });
  // Shift-click (or right-click) opens spell picker
  castBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('ui:openSpellPicker')); });
  castBtn.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.shiftKey && e.button === 0)) { // middle or Shift+Left
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('ui:openSpellPicker'));
    }
  });

  // Spell-select button (opens spell picker directly)
  const spellSelectBtn = document.createElement('button');
  spellSelectBtn.id = 'btn-spell-select';
  spellSelectBtn.textContent = 'Spells';
  Object.assign(spellSelectBtn.style, {
    padding: '8px 12px', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    cursor: 'pointer'
  });
  spellSelectBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('ui:openSpellPicker'));
  });

  // Ranged attack button (to the right of Cast)
  const shootBtn = document.createElement('button');
  shootBtn.id = 'btn-shoot';
  shootBtn.textContent = 'Shoot';
  Object.assign(shootBtn.style, {
    padding: '8px 12px', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    cursor: 'pointer'
  });
  shootBtn.addEventListener('click', () => {
    try { window.dispatchEvent(new CustomEvent('ui:shootRanged')); } catch (e) { console.debug('[hud] dispatch ui:shootRanged:', e); }
  });

  const attackBtn = document.createElement('button');
  attackBtn.id = 'btn-melee-attack';
  attackBtn.textContent = 'Attack';
  Object.assign(attackBtn.style, {
    padding: '8px 12px', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    cursor: 'pointer'
  });
  attackBtn.addEventListener('click', () => {
    try { window.dispatchEvent(new CustomEvent('ui:beginAttackDirection')); } catch (e) { console.debug('[hud] dispatch ui:beginAttackDirection:', e); }
  });

  // Pray button
  const prayBtn = document.createElement('button');
  prayBtn.id = 'btn-pray';
  prayBtn.textContent = 'Pray';
  Object.assign(prayBtn.style, {
    padding: '8px 12px', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    cursor: 'pointer'
  });
  prayBtn.addEventListener('click', () => {
    try { window.dispatchEvent(new CustomEvent('ui:pray')); } catch (e) { console.debug('[hud] dispatch ui:pray:', e); }
  });

  const quickInteractBtn = document.createElement('button');
  quickInteractBtn.id = 'btn-quick-interact';
  Object.assign(quickInteractBtn.style, {
    padding: '8px 12px', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    cursor: 'pointer'
  });
  quickInteractBtn.addEventListener('click', () => {
    try { window.dispatchEvent(new CustomEvent('ui:quickInteract')); } catch (e) { console.debug('[hud] dispatch ui:quickInteract:', e); }
  });

  const postureBtn = document.createElement('button');
  postureBtn.id = 'btn-posture';
  postureBtn.textContent = 'Posture';
  Object.assign(postureBtn.style, {
    padding: '8px 12px', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    cursor: 'pointer'
  });
  postureBtn.addEventListener('click', () => {
    try { window.dispatchEvent(new CustomEvent('ui:cyclePosture')); } catch (e) { console.debug('[hud] dispatch ui:cyclePosture:', e); }
  });

  // Search/Wait button
  // Short tap → search action (reveals hidden traps, etc.)
  // Long hold (≥500ms) → continuously emit wait at 222ms intervals while held
  const waitBtn = document.createElement('button');
  waitBtn.id = 'btn-wait';
  waitBtn.textContent = 'Search';
  Object.assign(waitBtn.style, {
    padding: '8px 12px', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    cursor: 'pointer'
  });

  function attachButtonHoldRing(btn) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    Object.assign(svg.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '4',
      opacity: '0',
      transition: 'opacity 120ms ease',
      filter: 'drop-shadow(0 0 2px rgba(95,179,255,0.35))',
    });
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M 8 3 H 92 A 8 8 0 0 1 97 8 V 92 A 8 8 0 0 1 92 97 H 8 A 8 8 0 0 1 3 92 V 8 A 8 8 0 0 1 8 3 Z');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#5fb3ff');
    path.setAttribute('stroke-width', '4');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    const pathLength = path.getTotalLength();
    path.style.strokeDasharray = String(pathLength);
    path.style.strokeDashoffset = String(pathLength);
    svg.appendChild(path);
    const ring = {
      svg,
      path,
      pathLength,
      setProgress(progress) {
        const p = Math.max(0, Math.min(1, Number(progress || 0)));
        svg.style.opacity = p > 0 ? '1' : '0';
        path.style.strokeDashoffset = String(pathLength * (1 - p));
      },
      reset() {
        svg.style.opacity = '0';
        path.style.strokeDashoffset = String(pathLength);
      },
    };
    btn.appendChild(svg);
    btn.__holdRing = ring;
    return ring;
  }

  const waitHoldRing = attachButtonHoldRing(waitBtn);

  {
    const SEARCH_LONG_PRESS_MS = 500;
    const WAIT_REPEAT_MS = 140;
    let searchPressTimer = null;
    let searchRepeatTimer = null;
    let searchProgressTimer = null;
    let searchPressStartedAt = 0;
    let searchIsLongPress = false;

    function setSearchButtonHoldVisual(waitMode) {
      const active = !!waitMode;
      setDesktopIcon(waitBtn, active ? ACTION_ICONS.wait : ACTION_ICONS.search);
      setMobileIcon(waitBtn, active ? ACTION_ICONS.wait : ACTION_ICONS.search);
      setBarLabel(waitBtn, active ? 'Wait' : 'Search');
      refreshCommandLabels();
    }

    function searchStartPress() {
      searchIsLongPress = false;
      searchPressStartedAt = performance.now();
      waitHoldRing.setProgress(0.02);
      const tickProgress = () => {
        const elapsed = Math.max(0, performance.now() - searchPressStartedAt);
        waitHoldRing.setProgress(elapsed / SEARCH_LONG_PRESS_MS);
        if (searchPressTimer && !searchIsLongPress) {
          searchProgressTimer = requestAnimationFrame(tickProgress);
        }
      };
      searchProgressTimer = requestAnimationFrame(tickProgress);
      searchPressTimer = setTimeout(() => {
        searchIsLongPress = true;
        waitHoldRing.setProgress(1);
        setSearchButtonHoldVisual(true);
        waitBtn.style.background = HUD_BUTTON_ACTIVE_BG;
        // Immediately emit one wait, then repeat
        try { window.dispatchEvent(new CustomEvent('ui:wait')); } catch (e) { console.debug('[hud] dispatch ui:wait:', e); }
        searchRepeatTimer = setInterval(() => {
          try { window.dispatchEvent(new CustomEvent('ui:wait')); } catch (e) { console.debug('[hud] dispatch ui:wait:', e); }
        }, WAIT_REPEAT_MS);
      }, SEARCH_LONG_PRESS_MS);
    }

    function searchEndPress() {
      if (searchPressTimer) { clearTimeout(searchPressTimer); searchPressTimer = null; }
      if (searchRepeatTimer) { clearInterval(searchRepeatTimer); searchRepeatTimer = null; }
      if (searchProgressTimer) { cancelAnimationFrame(searchProgressTimer); searchProgressTimer = null; }
      waitHoldRing.reset();
      setSearchButtonHoldVisual(false);
      waitBtn.style.background = HUD_BUTTON_BG;
      if (!searchIsLongPress) {
        // Short tap → search
        try { window.dispatchEvent(new CustomEvent('ui:search')); } catch (e) { console.debug('[hud] dispatch ui:search:', e); }
      }
      searchIsLongPress = false;
    }

    function searchCancelPress() {
      if (searchPressTimer) { clearTimeout(searchPressTimer); searchPressTimer = null; }
      if (searchRepeatTimer) { clearInterval(searchRepeatTimer); searchRepeatTimer = null; }
      if (searchProgressTimer) { cancelAnimationFrame(searchProgressTimer); searchProgressTimer = null; }
      waitHoldRing.reset();
      setSearchButtonHoldVisual(false);
      waitBtn.style.background = HUD_BUTTON_BG;
      searchIsLongPress = false;
    }

    waitBtn.addEventListener('touchstart', () => searchStartPress(), { passive: true });
    waitBtn.addEventListener('touchend', () => searchEndPress(), { passive: true });
    waitBtn.addEventListener('touchcancel', () => searchCancelPress(), { passive: true });
    waitBtn.addEventListener('mousedown', (e) => { if (e.button === 0) searchStartPress(); });
    waitBtn.addEventListener('mouseup', (e) => { if (e.button === 0) searchEndPress(); });
    waitBtn.addEventListener('mouseleave', () => searchCancelPress());
  }

  // Pet control button (touch/press interface)
  const petBtn = document.createElement('button');
  petBtn.id = 'btn-pet';
  petBtn.textContent = 'Pet: Following';
  Object.assign(petBtn.style, {
    padding: '8px 12px', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    cursor: 'pointer',
    visibility: 'hidden',
    pointerEvents: 'none',
  });
  const petHoldRing = attachButtonHoldRing(petBtn);

  const ACTION_ICONS = UI_ACTION_GLYPHS;
  const PET_STATE_ICONS = UI_PET_STATE_GLYPHS;

  // Long-press detection for state rotation vs menu (touch and mouse interface)
  let pressTimer = null;
  let pressProgressTimer = null;
  let pressStartedAt = 0;
  let isLongPress = false;
  const LONG_PRESS_DURATION = 500; // ms

  function resetBackground() {
    const currentState = petBtn.dataset.state || 'following';
    if (currentState === 'fleeing') {
      petBtn.style.background = 'linear-gradient(180deg, #4a1f1b 0%, #2a1513 100%)';
    } else if (currentState === 'guarding') {
      petBtn.style.background = 'linear-gradient(180deg, #2f3b46 0%, #1f252b 100%)';
    } else if (currentState === 'aggressive') {
      petBtn.style.background = HUD_BUTTON_ACTIVE_BG;
    } else {
      petBtn.style.background = HUD_BUTTON_BG;
    }
  }

  function startPress() {
    isLongPress = false;
    pressStartedAt = performance.now();
    petHoldRing.setProgress(0.02);
    const tickProgress = () => {
      const elapsed = Math.max(0, performance.now() - pressStartedAt);
      petHoldRing.setProgress(elapsed / LONG_PRESS_DURATION);
      if (pressTimer && !isLongPress) {
        pressProgressTimer = requestAnimationFrame(tickProgress);
      }
    };
    pressProgressTimer = requestAnimationFrame(tickProgress);
    pressTimer = setTimeout(() => {
      isLongPress = true;
      petHoldRing.setProgress(1);
      window.dispatchEvent(new CustomEvent('ui:openPetMenu'));
      // Visual feedback for long press
      petBtn.style.background = '#1a2636';
    }, LONG_PRESS_DURATION);
  }

  function endPress() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    if (pressProgressTimer) {
      cancelAnimationFrame(pressProgressTimer);
      pressProgressTimer = null;
    }
    petHoldRing.reset();
    resetBackground();
    // If not a long press, rotate state
    if (!isLongPress) {
      try { window.dispatchEvent(new CustomEvent('ui:rotatePetState')); } catch (e) { console.debug('[hud] dispatch ui:rotatePetState:', e); }
    }
    isLongPress = false;
  }

  function cancelPress() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    if (pressProgressTimer) {
      cancelAnimationFrame(pressProgressTimer);
      pressProgressTimer = null;
    }
    petHoldRing.reset();
    isLongPress = false;
    resetBackground();
  }

  // Touch event handlers
  petBtn.addEventListener('touchstart', () => {
    startPress();
  }, { passive: true });

  petBtn.addEventListener('touchend', () => {
    endPress();
  }, { passive: true });

  petBtn.addEventListener('touchcancel', () => {
    cancelPress();
  }, { passive: true });

  // Mouse event handlers
  petBtn.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click only
      startPress();
    }
  });

  petBtn.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      endPress();
    }
  });

  petBtn.addEventListener('mouseleave', () => {
    cancelPress();
  });

  // Right-click or context menu: Open full menu immediately
  petBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    cancelPress(); // Cancel any ongoing long-press
    window.dispatchEvent(new CustomEvent('ui:openPetMenu'));
  });

  const commandButtons = [charBtn, bagBtn, petBtn, castBtn, spellSelectBtn, attackBtn, shootBtn, prayBtn, quickInteractBtn, postureBtn, waitBtn];
  for (const btn of commandButtons) {
    Object.assign(btn.style, {
      position: 'relative',
      minHeight: '44px',
      minWidth: '44px',
      fontSize: '22px',
      lineHeight: '1',
      display: 'grid',
      placeItems: 'center',
      whiteSpace: 'nowrap',
      touchAction: 'manipulation',
      background: HUD_BUTTON_BG,
      color: '#dce5ef',
      border: HUD_BUTTON_BORDER,
      borderRadius: UX_THEME.radius,
      boxShadow: '0 8px 22px rgba(0,0,0,0.32), inset 0 0 0 1px rgba(188,206,224,0.06)',
      transition: 'transform 120ms, border-color 120ms, box-shadow 120ms, background 120ms',
    });
  }

  const mobileLayoutMq = window.matchMedia('(max-width: 760px)');
  let _mobileRadialEl = null;
  let _pinnedSpellDockEl = null;
  let _pinnedSpellDockFanEl = null;
  const setDesktopLabel = (btn, text) => { btn.dataset.desktopLabel = String(text || ''); };
  const setMobileLabel = (btn, text) => { btn.dataset.mobileLabel = String(text || ''); };
  const setDesktopIcon = (btn, text) => { btn.dataset.desktopIcon = String(text || ''); };
  const setMobileIcon = (btn, text) => { btn.dataset.mobileIcon = String(text || ''); };
  const setBarLabel = (btn, text) => { btn.dataset.barLabel = String(text || ''); };
  const refreshCommandLabels = () => {
    const isMobile = mobileLayoutMq.matches;
    for (const btn of commandButtons) {
      const desktopText = String(btn.dataset.desktopLabel || btn.textContent || '');
      const mobileText = String(btn.dataset.mobileLabel || desktopText);
      const desktopIcon = String(btn.dataset.desktopIcon || btn.textContent || '');
      const mobileIcon = String(btn.dataset.mobileIcon || desktopIcon);
      const visibleText = isMobile ? mobileText : desktopText;
      const icon = isMobile ? mobileIcon : desktopIcon;
      const barLabel = btn.dataset.barLabel || '';
      btn.textContent = '';
      const iconSpan = document.createElement('span');
      iconSpan.textContent = icon;
      iconSpan.style.lineHeight = '1';
      btn.appendChild(iconSpan);
      if (barLabel) {
        const labelSpan = document.createElement('span');
        labelSpan.textContent = barLabel;
        Object.assign(labelSpan.style, {
          position: 'absolute',
          bottom: '2px',
          left: '0',
          right: '0',
          textAlign: 'center',
          fontSize: '9px',
          lineHeight: '1',
          opacity: '0.7',
          letterSpacing: '0.3px',
          pointerEvents: 'none',
        });
        btn.appendChild(labelSpan);
      }
      if (!isMobile && btn.dataset.keyHint) {
        const keySpan = document.createElement('span');
        keySpan.textContent = btn.dataset.keyHint;
        Object.assign(keySpan.style, {
          position: 'absolute',
          top: '2px',
          right: '4px',
          fontSize: '9px',
          lineHeight: '1',
          opacity: '0.8',
          pointerEvents: 'none',
          fontFamily: GAME_TEXT_FONT_FAMILY,
        });
        btn.appendChild(keySpan);
      }
      btn.title = desktopText || visibleText || '';
      btn.setAttribute('aria-label', desktopText || visibleText || 'Action');
      const holdRing = btn.__holdRing;
      if (holdRing?.svg) btn.appendChild(holdRing.svg);
    }
  };

  setDesktopLabel(charBtn, 'Character'); setMobileLabel(charBtn, 'Character');
  setDesktopLabel(bagBtn, 'Inventory'); setMobileLabel(bagBtn, 'Bag');
  setDesktopLabel(petBtn, 'Pet: Following'); setMobileLabel(petBtn, 'Pet');
  setDesktopLabel(castBtn, 'Cast'); setMobileLabel(castBtn, 'Cast');
  setDesktopLabel(spellSelectBtn, 'Spells'); setMobileLabel(spellSelectBtn, 'Spells');
  setDesktopLabel(attackBtn, 'Attack'); setMobileLabel(attackBtn, 'Attack');
  setDesktopLabel(shootBtn, 'Shoot'); setMobileLabel(shootBtn, 'Shoot');
  setDesktopLabel(prayBtn, 'Pray'); setMobileLabel(prayBtn, 'Pray');
  setDesktopLabel(quickInteractBtn, 'Door'); setMobileLabel(quickInteractBtn, 'Door');
  setDesktopLabel(postureBtn, 'Posture: Balanced'); setMobileLabel(postureBtn, 'Posture');
  setDesktopLabel(waitBtn, 'Search'); setMobileLabel(waitBtn, 'Search');
  setDesktopIcon(charBtn, ACTION_ICONS.character); setMobileIcon(charBtn, ACTION_ICONS.character);
  setDesktopIcon(bagBtn, ACTION_ICONS.bag); setMobileIcon(bagBtn, ACTION_ICONS.bag);
  setDesktopIcon(petBtn, ACTION_ICONS.petDefault); setMobileIcon(petBtn, ACTION_ICONS.petDefault);
  setDesktopIcon(castBtn, ACTION_ICONS.cast); setMobileIcon(castBtn, ACTION_ICONS.cast);
  setDesktopIcon(spellSelectBtn, ACTION_ICONS.spells); setMobileIcon(spellSelectBtn, ACTION_ICONS.spells);
  setDesktopIcon(attackBtn, ACTION_ICONS.attack); setMobileIcon(attackBtn, ACTION_ICONS.attack);
  setDesktopIcon(shootBtn, ACTION_ICONS.shoot); setMobileIcon(shootBtn, ACTION_ICONS.shoot);
  setDesktopIcon(prayBtn, ACTION_ICONS.pray); setMobileIcon(prayBtn, ACTION_ICONS.pray);
  setDesktopIcon(quickInteractBtn, ACTION_ICONS.door); setMobileIcon(quickInteractBtn, ACTION_ICONS.door);
  setDesktopIcon(postureBtn, ACTION_ICONS.postureBalanced); setMobileIcon(postureBtn, ACTION_ICONS.postureBalanced);
  setDesktopIcon(waitBtn, ACTION_ICONS.search); setMobileIcon(waitBtn, ACTION_ICONS.search);
  setBarLabel(charBtn, 'Char');
  setBarLabel(bagBtn, 'Bag');
  setBarLabel(petBtn, 'Pet');
  setBarLabel(castBtn, 'Cast');
  setBarLabel(spellSelectBtn, 'Spells');
  setBarLabel(attackBtn, 'Attack');
  setBarLabel(shootBtn, 'Shoot');
  setBarLabel(prayBtn, 'Pray');
  setBarLabel(quickInteractBtn, 'Door');
  setBarLabel(postureBtn, 'Posture');
  setBarLabel(waitBtn, 'Search');
  charBtn.dataset.keyHint = 'c';
  bagBtn.dataset.keyHint = 'i';
  petBtn.dataset.keyHint = 'p';
  castBtn.dataset.keyHint = 'f';
  spellSelectBtn.dataset.keyHint = 'S';
  attackBtn.dataset.keyHint = 'A';
  shootBtn.dataset.keyHint = 'r';
  prayBtn.dataset.keyHint = 'P';
  quickInteractBtn.dataset.keyHint = 'o';
  postureBtn.dataset.keyHint = 'v';
  waitBtn.dataset.keyHint = '.';

  let pinSlots = null;
  function setPinSlotsGridPlacement(col = '', row = '') {
    if (!pinSlots?.el) return;
    pinSlots.el.style.gridColumn = col;
    pinSlots.el.style.gridRow = row;
  }

  function applyCommandBarLayout() {
    const isMobile = mobileLayoutMq.matches;
    // Temporarily hidden per UX direction.
    helpBtn.style.display = 'none';
    // Resize vitals gauge for mobile vs desktop
    const gaugeSize = isMobile ? 'min(110px, 26vw)' : 'min(188px, 22vw)';
    vitals.style.width = gaugeSize;
    vitals.style.height = gaugeSize;
    // Desktop and mobile share the same visible action/spell surfaces.
    spellSlotsContainer.style.display = 'none';
    bagBtn.style.display = 'none';
    castBtn.style.display = 'none';
    spellSelectBtn.style.display = 'none';
    quickInteractBtn.style.display = 'none';
    // Hide main radial — pinned spell dock replaces it
    if (_mobileRadialEl) _mobileRadialEl.style.display = 'none';
    if (_pinnedSpellDockEl) _pinnedSpellDockEl.style.display = 'flex';
    if (_pinnedSpellDockFanEl) _pinnedSpellDockFanEl.style.display = '';

    // Pinned quick items live in the same spell dock row on all platforms.
    if (_pinnedSpellDockEl) {
      _pinnedSpellDockEl.appendChild(pinSlots.el);
      Object.assign(pinSlots.el.style, {
        display: 'flex',
        flexDirection: 'row',
        gap: '6px',
        gridTemplateColumns: '',
        gridTemplateRows: '',
        alignItems: 'center',
      });
      for (const btn of pinSlots.el.children) {
        Object.assign(btn.style, {
          width: '40px', height: '40px',
          minWidth: '0', minHeight: '0',
          borderRadius: '50%',
        });
      }
    }

    Object.assign(bar.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
      gridTemplateRows: '44px',
      alignItems: 'stretch',
      justifyContent: 'center',
      gap: '6px',
      left: isMobile ? '8px' : '50%',
      right: isMobile ? '8px' : '',
      width: isMobile ? '' : 'min(490px, calc(100vw - 16px))',
      transform: isMobile ? '' : 'translateX(-50%)',
    });
    for (const btn of commandButtons) {
      btn.style.width = '100%';
      btn.style.minWidth = '0';
      btn.style.padding = '8px 4px';
      btn.style.fontSize = '20px';
      btn.style.overflow = 'hidden';
      btn.style.textOverflow = 'ellipsis';
    }
    const area = MOBILE_ACTION_BAR_GRID_AREAS;
    charBtn.style.gridColumn = area.character.col;
    charBtn.style.gridRow = area.character.row;
    petBtn.style.gridColumn = area.pet.col;
    petBtn.style.gridRow = area.pet.row;
    postureBtn.style.gridColumn = area.posture.col;
    postureBtn.style.gridRow = area.posture.row;
    prayBtn.style.gridColumn = area.pray.col;
    prayBtn.style.gridRow = area.pray.row;
    waitBtn.style.gridColumn = area.wait.col;
    waitBtn.style.gridRow = area.wait.row;
    attackBtn.style.gridColumn = area.attack.col;
    attackBtn.style.gridRow = area.attack.row;
    shootBtn.style.gridColumn = area.shoot.col;
    shootBtn.style.gridRow = area.shoot.row;
    refreshCommandLabels();
  }

  function syncActionBarHeight() {
    const barH = Math.max(44, Math.ceil(bar.getBoundingClientRect().height || 44));
    const tickerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--jshack-ticker-height') || '30', 10);
    document.documentElement.style.setProperty('--jshack-actionbar-height', `${barH + tickerH}px`);
  }

  // Show/hide pet button based on pet existence
  window.addEventListener('ui:petExists', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const exists = Boolean(e?.detail?.exists);
    petBtn.style.visibility = exists ? 'visible' : 'hidden';
    petBtn.style.pointerEvents = exists ? 'auto' : 'none';
    petBtn.setAttribute('aria-hidden', exists ? 'false' : 'true');
  });
  window.addEventListener('ui:attackDirectionMode', (ev) => {
    const e = /** @type {CustomEvent} */ (ev);
    const active = e?.detail?.active === true;
    attackBtn.style.borderColor = active ? '#d8b961' : '#6f7d8d';
    attackBtn.style.background = active ? HUD_BUTTON_ACTIVE_BG : HUD_BUTTON_BG;
  });
  // Update button based on pet state
  window.addEventListener('ui:updatePetButton', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const state = String(e?.detail?.state || 'following');
    const stateLabels = {
      following: 'Following',
      staying: 'Staying',
      fetching: 'Fetching',
      returning: 'Returning',
      guarding: 'Guarding',
      aggressive: 'Aggressive',
      fleeing: 'Fleeing!',
      idle: 'Idle'
    };
    const stateLabel = `Pet: ${stateLabels[state] || state}`;
    setDesktopLabel(petBtn, stateLabel);
    setMobileLabel(petBtn, stateLabel);
    const stateIcon = PET_STATE_ICONS[state] || ACTION_ICONS.petDefault;
    setDesktopIcon(petBtn, stateIcon);
    setMobileIcon(petBtn, stateIcon);
    petBtn.dataset.state = state; // Store for background reset
    refreshCommandLabels();
    // Color code by state
    if (state === 'fleeing') {
      petBtn.style.background = 'linear-gradient(180deg, #4a1f1b 0%, #2a1513 100%)';
    } else if (state === 'guarding') {
      petBtn.style.background = 'linear-gradient(180deg, #2f3b46 0%, #1f252b 100%)';
    } else if (state === 'aggressive') {
      petBtn.style.background = HUD_BUTTON_ACTIVE_BG;
    } else {
      petBtn.style.background = HUD_BUTTON_BG;
    }
  });

  function setPrayButtonHighlight(active) {
    const enabled = !!active;
    prayBtn.dataset.openingHighlight = enabled ? 'true' : 'false';
    prayBtn.style.transform = enabled ? 'translateY(-1px) scale(1.04)' : '';
    prayBtn.style.borderColor = enabled ? '#d8b961' : '#6f7d8d';
    prayBtn.style.background = enabled
      ? 'linear-gradient(180deg, #4b3a12 0%, #2a1f0a 100%)'
      : HUD_BUTTON_BG;
    prayBtn.style.boxShadow = enabled
      ? '0 0 0 2px rgba(243,212,107,0.28), 0 0 18px rgba(243,212,107,0.45)'
      : '0 8px 22px rgba(0,0,0,0.32), inset 0 0 0 1px rgba(188,206,224,0.06)';
    prayBtn.style.color = enabled ? '#fff2b8' : '#dce5ef';
  }

  window.addEventListener('ui:highlightPrayButton', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    setPrayButtonHighlight(Boolean(e?.detail?.active));
  });

  // Update label when app sets active spell
  window.addEventListener('ui:updateActiveSpellLabel', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const name = String(e?.detail?.name || '').trim();
    const symbol = String(e?.detail?.symbol || '').trim();
    const cost = Number(e?.detail?.cost || 0);
    const costKind = String(e?.detail?.costKind || 'mana');
    const canCast = Boolean(e?.detail?.canCast ?? true);
    const costSuffix = costKind === 'stamina' ? ' stam' : costKind === 'life' ? ' hp' : '';
    setDesktopLabel(castBtn, name ? (cost ? `Cast [${name}] (${cost}${costSuffix})` : `Cast [${name}]`) : 'Cast');
    if (symbol) {
      setDesktopIcon(castBtn, symbol);
      setMobileIcon(castBtn, symbol);
    } else {
      setDesktopIcon(castBtn, ACTION_ICONS.cast);
      setMobileIcon(castBtn, ACTION_ICONS.cast);
    }
    setBarLabel(castBtn, name || 'Cast');
    refreshCommandLabels();
    castBtn.disabled = !canCast;
    castBtn.style.opacity = canCast ? '1' : '0.6';
    castBtn.style.cursor = canCast ? 'pointer' : 'not-allowed';
  });

  // Update vitals gauge
  window.addEventListener('ui:updateVitals', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const hpVal = Number(e?.detail?.hp ?? 0), hpMax = Math.max(1, Number(e?.detail?.maxHp ?? 1));
    const mpVal = Number(e?.detail?.mana ?? 0), mpMax = Math.max(1, Number(e?.detail?.maxMana ?? 1));
    const stVal = Number(e?.detail?.stamina ?? 0), stMax = Math.max(1, Number(e?.detail?.maxStamina ?? 1));
    const hpf = Math.max(0, Math.min(1, hpVal / hpMax));
    const mpf = Math.max(0, Math.min(1, mpVal / mpMax));
    const stf = Math.max(0, Math.min(1, stVal / stMax));
    vitalsGauge.set({
      health: hpf,
      mana: mpf,
      stamina: stf,
      hpValue: hpVal,
      hpMax,
      manaValue: mpVal,
      manaMax: mpMax,
      staminaValue: stVal,
      staminaMax: stMax,
    });
  });

  window.addEventListener('ui:updateCalendar', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const nextMoonEmoji = String(e?.detail?.moonEmoji || '').trim();
    const nextMoonLabel = String(e?.detail?.moonLabel || '').trim();
    if (nextMoonEmoji) moonEmoji = nextMoonEmoji;
    if (nextMoonLabel) moonLabel = nextMoonLabel;
    syncSkyChip();
  });

  window.addEventListener('ui:updateTurn', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const nextClockEmoji = String(e?.detail?.clockEmoji || '').trim();
    const nextClockLabel = String(e?.detail?.clockLabel || '').trim();
    if (nextClockEmoji) clockEmoji = nextClockEmoji;
    if (nextClockLabel) clockLabel = nextClockLabel;
    syncSkyChip();
  });

  // Update combat HUD details
  window.addEventListener('ui:updateCombatHUD', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const weapon = e?.detail?.weapon || null;
    const ranged = e?.detail?.ranged || null;
    const statuses = Array.isArray(e?.detail?.statuses) ? e.detail.statuses : [];
    const affixes = Array.isArray(e?.detail?.affixes) ? e.detail.affixes : [];
    const posture = String(e?.detail?.posture || 'balanced').toLowerCase();

    const rangedCount = Math.max(0, Number(ranged?.count || 0) | 0);
    const ammoCount = Math.max(0, Number(e?.detail?.ammo ?? 0) | 0);

    // Shoot button label follows ranged item type
    let rangedLabel = 'Shoot';
    let rangedIcon = ACTION_ICONS.shoot;
    if (ranged?.isWand) {
      rangedLabel = `Zap (${rangedCount})`;
      rangedIcon = ACTION_ICONS.zap;
    }
    else if (ranged) rangedLabel = `Shoot (${ammoCount})`;
    setDesktopLabel(shootBtn, rangedLabel);
    setMobileLabel(shootBtn, rangedLabel);
    setDesktopIcon(shootBtn, rangedIcon);
    setMobileIcon(shootBtn, rangedIcon);

    if (posture === 'aggressive') {
      setDesktopLabel(postureBtn, 'Posture: Aggressive');
      setMobileLabel(postureBtn, 'Aggressive');
      setDesktopIcon(postureBtn, ACTION_ICONS.postureAggressive);
      setMobileIcon(postureBtn, ACTION_ICONS.postureAggressive);
      setBarLabel(postureBtn, 'Aggro');
      postureBtn.style.borderColor = '#69412a';
    } else if (posture === 'guarded') {
      setDesktopLabel(postureBtn, 'Posture: Guarded');
      setMobileLabel(postureBtn, 'Guarded');
      setDesktopIcon(postureBtn, ACTION_ICONS.postureGuarded);
      setMobileIcon(postureBtn, ACTION_ICONS.postureGuarded);
      setBarLabel(postureBtn, 'Guard');
      postureBtn.style.borderColor = '#2a4f69';
    } else {
      setDesktopLabel(postureBtn, 'Posture: Balanced');
      setMobileLabel(postureBtn, 'Balanced');
      setDesktopIcon(postureBtn, ACTION_ICONS.postureBalanced);
      setMobileIcon(postureBtn, ACTION_ICONS.postureBalanced);
      setBarLabel(postureBtn, 'Balance');
      postureBtn.style.borderColor = '#6f7d8d';
    }
    refreshCommandLabels();

    // Effects stack (badges + pie timers)
    ensureEffectsStack(statusRow).update(statuses);

    // Affix chips (equipped gear effects)
    affixRow.innerHTML = '';
    if (affixes.length) {
      for (const name of affixes) {
        const chip = document.createElement('div');
        chip.textContent = String(name);
        Object.assign(chip.style, {
          fontSize: '11px', padding: '2px 6px', borderRadius: '999px',
          background: 'rgba(180,120,255,0.15)', color: '#e6d6ff', border: '1px solid #3b2d52'
        });
        affixRow.appendChild(chip);
      }
    }

    // Weapon coating chip
    const coating = weapon?.coating;
    if (coating && coating.kind) {
      const charges = Number(coating.charges || 0);
      const chip = document.createElement('div');
      const coatColor = coating.color || '#88ee88';
      chip.textContent = `\u2022 ${String(coating.kind)}` + (charges > 0 ? ` (${charges})` : '');
      Object.assign(chip.style, {
        fontSize: '11px', padding: '2px 6px', borderRadius: '999px',
        background: 'rgba(80,200,80,0.18)', color: coatColor, border: '1px solid #2d5234'
      });
      affixRow.appendChild(chip);
    }
  });

  window.addEventListener('ui:updateQuestTracker', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const focused = e?.detail?.focused || null;

    questRow.replaceChildren();
    if (!focused) {
      questRow.style.display = 'none';
      return;
    }

    questRow.style.display = 'flex';

    const card = document.createElement('div');
    Object.assign(card.style, {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      alignItems: 'center',
      gap: '6px',
      minHeight: '28px',
      padding: '5px 7px',
      borderRadius: '7px',
      border: '1px solid #5d5122',
      background: 'linear-gradient(180deg, rgba(44,34,12,0.88) 0%, rgba(22,18,10,0.88) 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      cursor: 'pointer',
      pointerEvents: 'auto',
      touchAction: 'manipulation',
    });
    card.title = 'Open quest journal';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.addEventListener('click', () => {
      try { window.dispatchEvent(new CustomEvent('ui:openQuests')); } catch (err) { console.debug('[hud] dispatch ui:openQuests:', err); }
    });
    card.addEventListener('keydown', (ke) => {
      const key = String(ke?.key || '');
      if (key !== 'Enter' && key !== ' ') return;
      ke.preventDefault();
      try { window.dispatchEvent(new CustomEvent('ui:openQuests')); } catch (err) { console.debug('[hud] dispatch ui:openQuests:', err); }
    });

    const icon = document.createElement('div');
    icon.textContent = String(focused?.icon || '✦');
    Object.assign(icon.style, {
      fontSize: '14px',
      lineHeight: '1',
      filter: 'drop-shadow(0 1px 0 rgba(0,0,0,.6))',
    });

    const textWrap = document.createElement('div');
    Object.assign(textWrap.style, {
      minWidth: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: '1px',
    });

    const title = document.createElement('div');
    title.textContent = String(focused?.title || 'Quest');
    Object.assign(title.style, {
      fontSize: '11px',
      lineHeight: '1.1',
      color: '#fff1ba',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      letterSpacing: '0.02em',
    });

    const summary = document.createElement('div');
    const summaryText = String(focused?.summary || '').trim();
    summary.textContent = summaryText || 'Active objective';
    Object.assign(summary.style, {
      fontSize: '10px',
      lineHeight: '1.1',
      color: 'rgba(255,245,210,0.72)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });

    const reward = document.createElement('div');
    const rewardText = String(focused?.rewardPreview || '').trim();
    reward.textContent = rewardText ? `Reward: ${rewardText}` : '';
    Object.assign(reward.style, {
      display: rewardText ? 'block' : 'none',
      fontSize: '10px',
      lineHeight: '1.1',
      color: 'rgba(255,216,90,0.82)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });

    const progress = document.createElement('div');
    const current = Math.max(0, Number(focused?.progress || 0) | 0);
    const target = Math.max(0, Number(focused?.target || 0) | 0);
    progress.textContent = target > 0 ? `${current}/${target}` : '';
    Object.assign(progress.style, {
      minWidth: '36px',
      textAlign: 'right',
      fontSize: '11px',
      fontWeight: '700',
      color: '#ffd85a',
      textShadow: '0 1px 0 rgba(0,0,0,.8)',
    });

    textWrap.appendChild(title);
    textWrap.appendChild(summary);
    textWrap.appendChild(reward);
    card.appendChild(icon);
    card.appendChild(textWrap);
    card.appendChild(progress);
    questRow.appendChild(card);
  });

  // --- Action bar spell slots (WoW-style, desktop only) ---
  const spellSlotsContainer = document.createElement('div');
  Object.assign(spellSlotsContainer.style, {
    display: 'flex', gap: '4px', alignItems: 'center',
  });
  const SPELL_SLOT_COUNT = 6;
  /** @type {HTMLButtonElement[]} */
  const _slotBtns = [];
  /** @type {any[]} */
  const _slotEntries = new Array(SPELL_SLOT_COUNT).fill(null);
  /** @type {string} */
  let _lastSlotFingerprint = '';

  function buildSlotButton(index) {
    const btn = document.createElement('button');
    btn.dataset.slotIndex = String(index);
    Object.assign(btn.style, {
      position: 'relative',
      minHeight: '44px', minWidth: '44px',
      padding: '8px 10px', borderRadius: '6px',
      border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff',
      cursor: 'pointer', fontSize: '22px', lineHeight: '1',
      display: 'grid', placeItems: 'center', whiteSpace: 'nowrap',
      touchAction: 'manipulation', opacity: '0.4',
    });
    btn.addEventListener('click', () => {
      const entry = _slotEntries[index] || null;
      if (entry?.kind === 'item-use' && Number(entry?.itemId || 0) > 0) {
        window.dispatchEvent(new CustomEvent('ui:requestUse', { detail: { itemId: entry.itemId, abilityId: entry.abilityId } }));
        return;
      }
      window.dispatchEvent(new CustomEvent('ui:castSpellSlot', { detail: { slot: index } }));
    });
    btn.addEventListener('contextmenu', (e) => {
      const entry = _slotEntries[index] || null;
      if (entry?.kind === 'item-use') {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('ui:openSpellPicker', { detail: { bindSlot: index } }));
    });
    btn.addEventListener('mousedown', (e) => {
      const entry = _slotEntries[index] || null;
      if (entry?.kind === 'item-use') return;
      if (e.shiftKey && e.button === 0) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('ui:openSpellPicker', { detail: { bindSlot: index } }));
      }
    });
    return btn;
  }

  for (let i = 0; i < SPELL_SLOT_COUNT; i++) {
    const btn = buildSlotButton(i);
    _slotBtns.push(btn);
    spellSlotsContainer.appendChild(btn);
  }

  function refreshSpellSlots(detail) {
    const slots = Array.isArray(detail?.slots) ? detail.slots : [];
    const activeId = detail?.activeSpellId || null;
    const mana = Number(detail?.mana || 0);
    const stamina = Number(detail?.stamina || 0);

    // Fingerprint includes cooldown state so UI updates each tick while any CD is active
    const fp = JSON.stringify(slots.map(s => {
      if (!s) return '';
      return s.id + ':' + (s.cdRemaining || 0);
    })) + '|' + (activeId || '') + '|' + mana + '|' + stamina;
    if (fp === _lastSlotFingerprint) return;
    _lastSlotFingerprint = fp;

    for (let i = 0; i < SPELL_SLOT_COUNT; i++) {
      const btn = _slotBtns[i];
      const spell = (i < slots.length) ? slots[i] : null;
      _slotEntries[i] = spell || null;
      btn.textContent = '';

      const iconSpan = document.createElement('span');
      iconSpan.style.lineHeight = '1';

      const cdRemaining = Number(spell?.cdRemaining || 0);
      const cdMax = Number(spell?.cdMax || 0);
      const onCooldown = cdRemaining > 0 && cdMax > 0;

      if (spell && spell.id) {
        iconSpan.textContent = spell.symbol || ACTION_ICONS.cast;
        if (spell.kind === 'item-use') {
          btn.style.opacity = onCooldown ? '0.5' : '1';
          btn.style.borderColor = '#6e5f2b';
          btn.style.background = '#16120a';
          const cdTip = onCooldown ? ` [${cdRemaining} turns]` : '';
          btn.title = `${spell.name || spell.id}${cdTip}`;
        } else {
          const resource = String(spell.costKind || 'mana');
          const canAfford = (resource === 'stamina' ? stamina : mana) >= Number(spell.cost || 0);
          btn.style.opacity = (canAfford && !onCooldown) ? '1' : '0.5';
          const isActive = spell.id === activeId;
          btn.style.borderColor = isActive ? '#6b8fbf' : '#2d3b52';
          btn.style.background = isActive ? '#152035' : '#101626';
          const cdTip = onCooldown ? ` [${cdRemaining} turns]` : '';
          const label = resource === 'stamina' ? 'stamina' : resource === 'life' ? 'life' : 'mana';
          btn.title = `${spell.name || spell.id} (${spell.cost || 0} ${label})${cdTip}`;
        }
        btn.setAttribute('aria-label', btn.title);
        btn.disabled = false;
      } else {
        iconSpan.textContent = String(i + 1);
        iconSpan.style.fontSize = '14px';
        iconSpan.style.opacity = '0.4';
        btn.style.opacity = '0.3';
        btn.style.borderColor = '#2d3b52';
        btn.style.background = '#101626';
        btn.title = `Slot ${i + 1} (empty)`;
        btn.setAttribute('aria-label', btn.title);
        btn.disabled = true;
      }

      btn.appendChild(iconSpan);

      // Cooldown clock-sweep overlay
      if (onCooldown) {
        const pct = (1 - cdRemaining / cdMax) * 100;
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
          position: 'absolute', inset: '0', borderRadius: '6px',
          background: `conic-gradient(from 0deg, transparent ${pct}%, rgba(0,0,0,0.65) ${pct}%)`,
          pointerEvents: 'none', zIndex: '1',
        });
        btn.appendChild(overlay);

        // Turns remaining number
        const cdLabel = document.createElement('span');
        cdLabel.textContent = String(cdRemaining);
        Object.assign(cdLabel.style, {
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '15px', fontWeight: 'bold', lineHeight: '1',
          color: '#ff9999', textShadow: '0 0 4px #000, 0 0 2px #000',
          pointerEvents: 'none', zIndex: '2',
        });
        btn.appendChild(cdLabel);
      }

      // Bar label (spell name)
      if (spell && spell.name) {
        const labelSpan = document.createElement('span');
        labelSpan.textContent = spell.name.length > 6 ? spell.name.slice(0, 5) + '\u2026' : spell.name;
        Object.assign(labelSpan.style, {
          position: 'absolute', bottom: '0', left: '0', right: '0',
          textAlign: 'center', fontSize: '11px', lineHeight: '1',
          color: '#cfe8ff', background: spell.kind === 'item-use' ? '#3b2f12' : '#1a2744', borderRadius: '0 0 6px 6px',
          padding: '2px 0', opacity: '0.95', letterSpacing: '0.3px', pointerEvents: 'none',
          zIndex: '3',
        });
        btn.appendChild(labelSpan);
      }

      // Key hint
      const keySpan = document.createElement('span');
      keySpan.textContent = String(i + 1);
      Object.assign(keySpan.style, {
        position: 'absolute', top: '2px', right: '4px',
        fontSize: '9px', lineHeight: '1', opacity: '0.8',
        pointerEvents: 'none', fontFamily: GAME_TEXT_FONT_FAMILY,
        zIndex: '3',
      });
      btn.appendChild(keySpan);
    }
  }

  window.addEventListener('ui:updateSpellBar', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    if (mobileLayoutMq.matches) return;
    refreshSpellSlots(e?.detail);
    syncActionBarHeight();
  });

  // Right-aligned bar: compact core actions only.
  pinSlots = createPinnedItemSlots();
  const quick = createQuickSlot({
    onPinItem: (item) => pinSlots.pinItem(item),
    isPinned: (identity) => pinSlots.hasIdentity(identity),
  });
  pinSlots.setPresenter((item) => quick.presentItem(item));
  bar.appendChild(charBtn);
  bar.appendChild(bagBtn);
  bar.appendChild(petBtn);
  bar.appendChild(castBtn);
  bar.appendChild(spellSelectBtn);
  bar.appendChild(attackBtn);
  bar.appendChild(quickInteractBtn);
  bar.appendChild(postureBtn);
  bar.appendChild(pinSlots.el);
  bar.appendChild(spellSlotsContainer);
  bar.appendChild(prayBtn);
  bar.appendChild(waitBtn);
  bar.appendChild(shootBtn);
  root.appendChild(bar);
  root.appendChild(quick.el);

  // --- Channeling overlay (progress bar + cancel button) ---
  const channelingOverlay = createChannelingOverlay();
  root.appendChild(channelingOverlay.el);

  // --- Mobile radial spell button ---
  const mobileRadial = createMobileSpellRadial(mobileLayoutMq);
  _mobileRadialEl = mobileRadial.el;
  root.appendChild(mobileRadial.el);

  // --- Pinned spell dock (row of mini-radials to the left of main radial) ---
  const pinnedSpellDock = createPinnedSpellDock(mobileLayoutMq);
  _pinnedSpellDockEl = pinnedSpellDock.el;
  _pinnedSpellDockFanEl = pinnedSpellDock.fan;
  root.appendChild(pinnedSpellDock.el);
  root.appendChild(pinnedSpellDock.fan);

  function syncQuickSlotPosition() {
    quick.syncPosition(_pinnedSpellDockEl, mobileLayoutMq);
  }

  applyCommandBarLayout();
  syncActionBarHeight();
  syncQuickSlotPosition();

  window.addEventListener('ui:updatePinnedSpellBar', () => {
    syncQuickSlotPosition();
  });

  if (typeof mobileLayoutMq.addEventListener === 'function') {
    mobileLayoutMq.addEventListener('change', () => {
      applyCommandBarLayout();
      syncActionBarHeight();
      syncQuickSlotPosition();
    });
  } else if (typeof mobileLayoutMq.addListener === 'function') {
    mobileLayoutMq.addListener(() => {
      applyCommandBarLayout();
      syncActionBarHeight();
      syncQuickSlotPosition();
    });
  }
  window.addEventListener('resize', () => {
    syncActionBarHeight();
    syncQuickSlotPosition();
  });
  if (typeof ResizeObserver !== 'undefined') {
    const obs = new ResizeObserver(() => {
      syncActionBarHeight();
      syncQuickSlotPosition();
    });
    obs.observe(bar);
  }

  return { castBtn, charBtn, bagBtn, spellSelectBtn, shootBtn, prayBtn, quickInteractBtn, postureBtn, waitBtn, petBtn };
}

// --- Effects Stack (status badges with pie timers) -------------------------
function ensureEffectsStack(container) {
  if (container.__effectsStack) return container.__effectsStack;

  /** @type {Map<string, { el: HTMLDivElement, total: number, overlay: HTMLDivElement, ticksEl: HTMLDivElement, stacksEl: HTMLDivElement, status: any }>} */
  const byKey = new Map();
  let detailTooltip = null;
  let detailDismiss = null;

  // Keyed by canonical Status.type strings from effectDefs statuses[]
  const VIS = {
    invulnerable: { name: 'Aegis',     glyph: '\u{1F6E1}\uFE0F', hue: 190 },
    invisible:    { name: 'Invisible', glyph: '\u2307',          hue: 265 },
    burning:      { name: 'Burning',   glyph: '\u{1F525}',       hue: 20  },
    poisoned:     { name: 'Poison',    glyph: '\u2620\uFE0F',    hue: 120 },
    regen:        { name: 'Regen',     glyph: '\u{1F49A}',       hue: 140 },
    stunned:      { name: 'Stunned',   glyph: '\u{1F4AB}',       hue: 45  },
    rooted:       { name: 'Rooted',    glyph: '\u{1FAB4}',       hue: 130 },
    thorns:       { name: 'Thorns',    glyph: '\u{1F339}',       hue: 110 },
    disease:      { name: 'Disease',   glyph: '\u{1F9A0}',       hue: 55  },
    bleeding:     { name: 'Bleed',     glyph: '\u{1FA78}',       hue: 350 },
    shocked:      { name: 'Shocked',   glyph: '\u26A1',          hue: 55  },
    blinded:      { name: 'Blinded',   glyph: '\u{1F441}\uFE0F', hue: 260 },
    deafened:     { name: 'Deafened',  glyph: '\u{1F507}',       hue: 230 },
    electrocuted: { name: 'Electrocuted', glyph: '\u26A1',       hue: 45  },
    frozen:       { name: 'Frozen',    glyph: '\u2744\uFE0F',    hue: 200 },
    slowed:       { name: 'Slowed',    glyph: '\u{1F40C}',       hue: 195 },
    confused:     { name: 'Confused',     glyph: '\u{1F635}',       hue: 280 },
    fear:         { name: 'Fear',      glyph: '\u2620\uFE0F',    hue: 285 },
    hallucinating: { name: 'Hallucinating', glyph: '\u{1F300}',      hue: 210 },
    weakened:     { name: 'Weakened',  glyph: '\u{1FAB6}',       hue: 40  },
    cursed:       { name: 'Cursed',    glyph: '\u{1F52E}',       hue: 270 },
    blessed:      { name: 'Blessed',   glyph: '\u{1F31F}',       hue: 50  },
    stoneskin:    { name: 'Stoneskin', glyph: '\u{1FAA8}',       hue: 220 },
    taunted:      { name: 'Taunted',   glyph: '\u{1F624}',       hue: 0   },
    mindwiped:    { name: 'Mindwipe',  glyph: '\u{1F9E0}',       hue: 300 },
    berserk:      { name: 'Berserk',   glyph: '\u2694\uFE0F',    hue: 0   },
    energized:    { name: 'Energized', glyph: '\u{1F4AA}',       hue: 60  },
    mana_surge:   { name: 'Mana Surge', glyph: '\u{1F4A0}',      hue: 250 },
    lucky:        { name: 'Lucky',     glyph: '\u{1F340}',       hue: 100 },
    resist_fire:  { name: 'Fire Res',  glyph: '\u{1F9EF}',       hue: 15  },
    resist_poison: { name: 'Poison Res', glyph: '\u{1F9EA}',     hue: 130 },
    resist_electric: { name: 'Elec Res', glyph: '\u{1F50C}',     hue: 50  },
    resist_acid:  { name: 'Acid Res',  glyph: '\u{1F9F4}',       hue: 80  },
    // Corpse-eat timed buffs
    cunning_reflex:   { name: 'Reflexes',     glyph: '\u{1F4A8}',       hue: 45  },  // 💨 jittery dodge
    keen_eye:         { name: 'Keen Eye',      glyph: '\u{1F441}\uFE0F', hue: 50  },  // 👁️ predator focus
    web_immune:       { name: 'Web Immune',    glyph: '\u{1F578}\uFE0F', hue: 170 },  // 🕸️ dissolves webs
    spider_sense:     { name: 'Spider Sense',  glyph: '\u{1F577}\uFE0F', hue: 290 },  // 🕷️ danger sense
    thermal_sense:    { name: 'Heat Sight',    glyph: '\u{1F321}\uFE0F', hue: 15  },  // 🌡️ thermal vision
    bear_vigor:       { name: 'Bear Vigor',    glyph: '\u{1F43B}',       hue: 30  },  // 🐻 primal regen
    fire_blood:       { name: 'Fire Blood',    glyph: '\u{1F9E8}',       hue: 10  },  // 🧨 fire immunity
    blood_rage:       { name: 'Blood Rage',    glyph: '\u{1FA78}',       hue: 0   },  // 🩸 orcish fury
    frost_blood:      { name: 'Frost Blood',   glyph: '\u2744\uFE0F',    hue: 195 },  // ❄️ frost veins
    war_fed:          { name: 'War Fed',       glyph: '\u{1F5E1}\uFE0F', hue: 35  },  // 🗡️ iron strikes
    phase_shift:      { name: 'Phase Shift',   glyph: '\u{1F300}',       hue: 260 },  // 🌀 phasing
    ravenous:         { name: 'Ravenous',      glyph: '\u{1F924}',       hue: 25  },  // 🤤 insatiable hunger
    spectral_form:    { name: 'Spectral',      glyph: '\u{1F47B}',       hue: 210 },  // 👻 translucent
    ogre_bulk:        { name: 'Ogre Bulk',     glyph: '\u{1F9CC}',       hue: 90  },  // 🧌 brutish mass
    shadow_cloak:     { name: 'Shadow Cloak',  glyph: '\u{1F311}',       hue: 270 },  // 🌑 devastating strike
    dark_sight:       { name: 'Dark Sight',    glyph: '\u{1F440}',       hue: 280 },  // 👀 dark vision
    battle_fury:      { name: 'Battle Fury',   glyph: '\u{1F525}',       hue: 5   },  // 🔥 kill = heal
    lichdom_echo:     { name: 'Lichdom',       glyph: '\u{1F480}',       hue: 310 },  // 💀 death save
    fey_grace:        { name: 'Fey Grace',     glyph: '\u{1FAB6}',       hue: 150 },  // 🪶 wind-weave
    // Proc states (player-side)
    echo_strike_memory: { name: 'Echo',      glyph: '\u{1F47B}',    hue: 200 },  // 👻 spectral echo stored
    soul_mortgage_debt: { name: 'Soul Debt', glyph: '\u2696\uFE0F', hue: 350 },  // ⚖️ debt accruing
    // Hunger levels
    satiated:     { name: 'Satiated',  glyph: '\u{1F60B}',       hue: 130 },
    peckish:      { name: 'Peckish',   glyph: '\u{1F37D}\uFE0F', hue: 55  },
    hungry:       { name: 'Hungry',    glyph: '\u{1F356}',       hue: 35  },
    famished:     { name: 'Famished',  glyph: '\u{1F9B4}',       hue: 20  },
    starving:     { name: 'Starving',  glyph: '\u{1F480}',       hue: 5   },
    wasting:      { name: 'Wasting',   glyph: '\u2620\uFE0F',    hue: 350 },
  };

  const hsla = (h, a = 0.2) => `hsla(${h} 80% 50% / ${a})`;
  const shadowColor = (h) => `hsl(${h} 55% 35%)`;
  const VIS_SCALE = 1.2;
  const scaledPx = (px) => `${Math.max(1, Math.round(px * VIS_SCALE))}px`;

  function consumeBadgeInput(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
  }

  function hideEffectDetails() {
    if (detailTooltip) detailTooltip.style.display = 'none';
    if (detailDismiss) {
      window.removeEventListener('pointerdown', detailDismiss, true);
      window.removeEventListener('keydown', detailDismiss, true);
      detailDismiss = null;
    }
  }

  function showEffectDetails(anchor, status) {
    if (!anchor || !status) return;
    const root = ensureRoot();
    const tip = document.getElementById('item-tooltip') || ensureItemTooltip(root);
    detailTooltip = tip;
    renderItemDetails(tip, {
      type: 'effect',
      name: status.name || status.key || 'Effect',
      glyph: status.glyph || '',
      glyphColor: status.glyphColor || '#cfe8ff',
      rarityName: 'common',
      description: status.description || '',
      detailLines: Array.isArray(status.detailLines) ? status.detailLines : [],
      targetEffects: Array.isArray(status.targetEffects) ? status.targetEffects : [],
    });
    tip.style.display = 'block';
    positionTooltip(tip, anchor);
    if (detailDismiss) {
      window.removeEventListener('pointerdown', detailDismiss, true);
      window.removeEventListener('keydown', detailDismiss, true);
    }
    detailDismiss = (ev) => {
      if (ev?.type === 'keydown' && ev.key !== 'Escape') return;
      hideEffectDetails();
    };
    window.addEventListener('pointerdown', detailDismiss, true);
    window.addEventListener('keydown', detailDismiss, true);
  }

  function installBadgeInputGuards(el, getStatus) {
    if (!el || el.__effectBadgeInputGuards) return;
    el.__effectBadgeInputGuards = true;
    const open = (ev) => {
      consumeBadgeInput(ev);
      showEffectDetails(el, getStatus());
    };
    const consume = (ev) => consumeBadgeInput(ev);
    el.addEventListener('pointerdown', open, { capture: true, passive: false });
    el.addEventListener('touchstart', open, { capture: true, passive: false });
    el.addEventListener('pointerup', consume, { capture: true, passive: false });
    el.addEventListener('click', consume, { capture: true, passive: false });
  }

  function createBadge(spec, total) {
    const hue = Number.isFinite(Number(spec.hue)) ? Number(spec.hue) : 210;
    const glyphColor = spec.glyphColor || shadowColor(hue);
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'relative', width: scaledPx(58), height: scaledPx(58), borderRadius: scaledPx(8),
      display: 'grid', placeItems: 'center',
      boxShadow: '0 1px 0 rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04)',
      outline: `1px solid ${hsla(hue, 0.28)}`,
      background: hsla(hue, 0.2),
      pointerEvents: 'auto',
      touchAction: 'none',
      cursor: 'pointer',
    });
    el.title = `${spec.name} \u2022 ${total} turns`;

    const glyph = document.createElement('div');
    glyph.textContent = spec.glyph;
    Object.assign(glyph.style, { fontSize: scaledPx(28), lineHeight: '1', filter: 'drop-shadow(0 1px 0 rgba(0,0,0,.6))', color: glyphColor });

    const label = document.createElement('div');
    Object.assign(label.style, { position: 'absolute', left: scaledPx(6), bottom: scaledPx(2), fontSize: scaledPx(10), color: 'rgba(255,255,255,.8)' });
    label.textContent = String(spec.name).split(' ')[0];

    const ticks = document.createElement('div');
    Object.assign(ticks.style, { position: 'absolute', right: scaledPx(4), bottom: scaledPx(2), fontSize: scaledPx(12), fontWeight: '700', color: '#fff', textShadow: '0 1px 0 #000, 0 0 4px rgba(0,0,0,.7)' });
    ticks.textContent = String(total);

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'absolute', left: scaledPx(6), top: scaledPx(6), right: scaledPx(6), bottom: scaledPx(6), borderRadius: scaledPx(8), pointerEvents: 'none',
      background: 'conic-gradient(rgba(180,190,200,.2) 0deg, transparent 0)'
    });

    const stacksEl = document.createElement('div');
    Object.assign(stacksEl.style, { position: 'absolute', right: scaledPx(4), top: scaledPx(2), fontSize: scaledPx(11), fontWeight: '700', color: '#ffcc44', textShadow: '0 1px 0 #000, 0 0 4px rgba(0,0,0,.7)', zIndex: '2' });
    stacksEl.textContent = 'x1';

    el.appendChild(glyph);
    el.appendChild(label);
    el.appendChild(ticks);
    el.appendChild(overlay);
    el.appendChild(stacksEl);

    return { el, overlay, ticksEl: ticks, stacksEl };
  }

  function setAngle(rec, remaining) {
    if (remaining === Infinity) {
      rec.overlay.style.background = 'transparent';
      rec.ticksEl.textContent = '\u221E';
      return;
    }
    const total = Math.max(1, Number(rec.total || 1));
    const pct = Math.max(0, Math.min(1, remaining / total));
    const deg = (pct * 360).toFixed(2) + 'deg';
    rec.overlay.style.background = `conic-gradient(rgba(180,190,200,.2) ${deg}, transparent 0)`;
    const r = Math.max(0, remaining | 0);
    rec.ticksEl.textContent = r >= 9999 ? '\u221E' : String(r);
  }

  const MASKED_SPEC = { name: '?', glyph: '\u2753', hue: 200 };

  function update(statuses) {
    const seen = new Set();
    for (const s of (Array.isArray(statuses) ? statuses : [])) {
      const key = String(s.key || '').toLowerCase();
      if (!key) continue;
      const badgeKey = s.instanceId ? `effect:${s.instanceId}` : key;
      const turns = Math.max(0, Number(s.turns || 0));
      const stacks = Math.max(1, Number(s.stacks || 1));
      const masked = !!s.masked;
      const rowSpec = !masked && (s.name || s.glyph || Number.isFinite(Number(s.hue)) || s.glyphColor)
        ? {
          name: String(s.name || key.replace(/^./, c => c.toUpperCase())),
          glyph: String(s.glyph || '\u2728'),
          hue: Number.isFinite(Number(s.hue)) ? Number(s.hue) : 210,
          glyphColor: s.glyphColor,
        }
        : null;
      const spellFallback = !masked && !VIS[key] && s.spellGlyph ? { name: s.spellName || key, glyph: s.spellGlyph, hue: 210 } : null;
      const spec = masked ? MASKED_SPEC : (rowSpec || VIS[key] || spellFallback || { name: key.replace(/^./, c => c.toUpperCase()), glyph: '\u2728', hue: 210 });
      let rec = byKey.get(badgeKey);
      if (!rec) {
        const { el, overlay, ticksEl, stacksEl } = createBadge(spec, turns || 1);
        rec = { el, overlay, ticksEl, stacksEl, total: Math.max(1, turns || 1), status: s };
        installBadgeInputGuards(el, () => rec.status);
        byKey.set(badgeKey, rec);
        container.appendChild(el);
      }
      rec.status = s;
      rec.total = Math.max(1, Math.max(rec.total || 1, turns || 1));
      setAngle(rec, turns);
      rec.stacksEl.textContent = stacks >= 9999 ? '\u221E' : `x${stacks}`;
      seen.add(badgeKey);
    }
    for (const [key, rec] of byKey.entries()) {
      if (!seen.has(key)) {
        if (rec?.el?.parentNode === container) container.removeChild(rec.el);
        byKey.delete(key);
      }
    }
  }

  const api = { update };
  container.__effectsStack = api;
  return api;
}

export function ensureRoot() {
  let root = document.getElementById('ui-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'ui-root';
    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.top = '0';
    root.style.right = '0';
    root.style.bottom = '0';
    root.style.pointerEvents = 'none';
    root.style.zIndex = '1000';
    document.body.appendChild(root);
  }
  return root;
}

// --- Singular Quick Slot (LIFO, most recent pickup first) -----------------
function createQuickSlot(opts = {}) {
  const onPinItem = typeof opts?.onPinItem === 'function' ? opts.onPinItem : null;
  const isPinned = typeof opts?.isPinned === 'function' ? opts.isPinned : null;
  const BASE_BOTTOM = 'calc(var(--jshack-actionbar-height, 48px) + 12px + env(safe-area-inset-bottom, 0px))';
  const MOBILE_DOCK_GAP_PX = 8;
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    right: '8px',
    bottom: BASE_BOTTOM,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '8px',
    pointerEvents: 'auto',
    zIndex: 925,
  });

  /** @type {Array<{id:number, identity?:string, type:string, slot?:string, name:string, count:number, rarityName?:string, glyph?:string, glyphColor?:string, hasScrollOfIdentify?:boolean, details?:any, interacted?:boolean, addedAt:number}>} */
  const stack = [];
  const AUTO_DISMISS_MS = 6000;
  const AUTO_FADE_MS = 800;

  function normalizeQuickItem(item) {
    const id = Number(item?.id || 0) | 0;
    return {
      id,
      identity: String(item?.identity || ''),
      type: String(item?.type || ''),
      slot: String(item?.slot || ''),
      name: String(item?.name || 'item'),
      count: normalizePositiveCount(item?.count),
      rarityName: String(item?.rarityName || 'common'),
      glyph: String(item?.glyph || ''),
      glyphColor: String(item?.glyphColor || ''),
      hasScrollOfIdentify: !!item?.hasScrollOfIdentify,
      canApply: !!item?.canApply,
      applyTargetCount: Math.max(0, Number(item?.applyTargetCount || 0) | 0),
      justPickedUp: !!item?.justPickedUp,
      interacted: false,
      // Preserve full display data for renderItemDetails
      description: item?.description || '',
      weight: item?.weight || 0,
      bonuses: item?.bonuses || null,
      damageDice: item?.damageDice || null,
      damageType: item?.damageType || null,
      staminaCost: item?.staminaCost ?? null,
      twoHanded: item?.twoHanded || false,
      contentStatus: item?.contentStatus || null,
      mechanics: item?.mechanics || null,
      affixes: item?.affixes || null,
      maxSockets: item?.maxSockets || 0,
      sockets: item?.sockets || null,
      coating: item?.coating || null,
      identified: item?.identified ?? item?.details?.identified ?? undefined,
    };
  }

  function actionable(it) {
    return isQuickChipActionable(it);
  }

  let dismissTimer = 0;
  let fadeTimer = 0;
  function stopFadeForTopChip() {
    if (dismissTimer) clearTimeout(dismissTimer);
    if (fadeTimer) clearTimeout(fadeTimer);
    dismissTimer = 0;
    fadeTimer = 0;
    const topChip = el.firstElementChild instanceof HTMLElement ? el.firstElementChild : null;
    if (topChip) {
      topChip.style.transition = '';
      topChip.style.opacity = '1';
    }
  }

  function markTopInteracted() {
    const top = peekStackTop(stack);
    if (!top) return;
    top.interacted = true;
    stopFadeForTopChip();
  }

  function resetDismissTimer() {
    if (dismissTimer) clearTimeout(dismissTimer);
    if (fadeTimer) clearTimeout(fadeTimer);
    if (stack.length === 0) return;
    const top = peekStackTop(stack);
    if (top?.interacted) {
      stopFadeForTopChip();
      return;
    }
    const topChip = el.firstElementChild instanceof HTMLElement ? el.firstElementChild : null;
    if (topChip) {
      topChip.style.opacity = '1';
      topChip.style.transition = '';
      fadeTimer = setTimeout(() => {
        topChip.style.transition = `opacity ${AUTO_FADE_MS}ms ease-in`;
        topChip.style.opacity = '0';
      }, AUTO_DISMISS_MS - AUTO_FADE_MS);
    }
    dismissTimer = setTimeout(() => {
      stack.pop();
      renderStack();
      resetDismissTimer();
    }, AUTO_DISMISS_MS);
  }

  function renderStack(opts) {
    el.innerHTML = '';
    const it = peekStackTop(stack);
    if (!it) return;
    const chip = renderQuickChip(it, {
      startExpanded: !!(opts && opts.startExpanded),
      onUse: () => dispatchAction(it),
      onApply: Number(it?.id || 0) > 0 && it?.canApply && String(it?.type || '') === 'potion' ? () => dispatchApply(it) : null,
      onThrow: Number(it?.id || 0) > 0 ? () => dispatchThrow(it) : null,
      onDrop: Number(it?.id || 0) > 0 ? () => dispatchDrop(it) : null,
      onPin: Number(it?.id || 0) > 0 && onPinItem ? () => dispatchPin(it) : null,
      onInteracted: () => markTopInteracted(),
      onDismiss: () => dismissTop()
    });
    el.appendChild(chip);
  }

  function dispatchAction(it) {
    const action = getQuickChipPrimaryAction(it);
    if (action === 'apply') {
      window.dispatchEvent(new CustomEvent('ui:openApplyForTool', { detail: { toolId: it.id } }));
    } else if (action === 'equip') {
      window.dispatchEvent(new CustomEvent('ui:requestEquip', { detail: { itemId: it.id } }));
    } else if (action === 'drink') {
      window.dispatchEvent(new CustomEvent('ui:requestDrink', { detail: { itemId: it.id } }));
    } else {
      window.dispatchEvent(new CustomEvent('ui:requestUse', { detail: { itemId: it.id } }));
    }
  }

  function dispatchApply(it) {
    window.dispatchEvent(new CustomEvent('ui:openApplyForTool', { detail: { toolId: it.id } }));
  }

  function dispatchThrow(it) {
    if (!(Number(it?.id || 0) > 0)) return;
    window.dispatchEvent(new CustomEvent('ui:requestThrow', { detail: { itemId: it.id } }));
    dismissTop();
  }

  function dispatchDrop(it) {
    if (!(Number(it?.id || 0) > 0)) return;
    window.dispatchEvent(new CustomEvent('ui:requestDrop', { detail: { itemId: it.id } }));
    dismissTop();
  }

  function dispatchPin(it) {
    if (!(Number(it?.id || 0) > 0) || !onPinItem) return;
    onPinItem(it);
    dismissTop();
  }

  function dismissTop() {
    stack.pop();
    renderStack();
    resetDismissTimer();
  }

  function presentItem(item) {
    const normalized = normalizeQuickItem(item);
    if (!(normalized.id > 0)) return;
    const idx = stack.findIndex((x) => x && x.id === normalized.id);
    if (idx >= 0) stack.splice(idx, 1);
    stack.push(normalized);
    renderStack({ startExpanded: true });
    resetDismissTimer();
  }

  window.addEventListener('ui:recentPickup', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const item = e?.detail?.item;
    console.debug('[quickSlot] ui:recentPickup received:', item);
    if (!item) return;
    if (isPinned && isPinned(item.identity)) return;
    const idx = stack.findIndex((x) => x && x.id === item.id);
    if (idx >= 0) stack.splice(idx, 1);
    stack.push(normalizeQuickItem({ ...item, justPickedUp: true }));
    const top = peekStackTop(stack);
    console.debug('[quickSlot] stack after push:', JSON.stringify(stack), 'actionable[top]:', top ? actionable(top) : 'empty');
    renderStack({ startExpanded: true });
    resetDismissTimer();
  });

  window.addEventListener('ui:itemEquipped', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const id = Number(e?.detail?.itemId || 0);
    if (!id) return;
    const idx = stack.findIndex((x) => x && x.id === id);
    if (idx >= 0) { stack.splice(idx, 1); renderStack(); resetDismissTimer(); }
  });

  window.addEventListener('ui:itemUsed', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const id = Number(e?.detail?.itemId || 0);
    if (!id) return;
    const idx = stack.findIndex((x) => x && x.id === id);
    if (idx >= 0) {
      stack.splice(idx, 1);
      renderStack();
      resetDismissTimer();
    }
  });

  window.addEventListener('ui:itemIdentified', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const item = e?.detail?.item;
    if (!item) return;
    const id = Number(item.id || 0);
    if (!id) return;
    const idx = stack.findIndex((x) => x && x.id === id);
    if (idx >= 0) {
      stack.splice(idx, 1);
      stack.push(normalizeQuickItem(item));
      renderStack();
      resetDismissTimer();
    }
  });

  function syncPosition(anchorEl, mobileLayout) {
    if (!(anchorEl instanceof HTMLElement)) {
      el.style.bottom = BASE_BOTTOM;
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) {
      el.style.bottom = BASE_BOTTOM;
      return;
    }
    const bottomPx = Math.max(0, Math.round(window.innerHeight - rect.top + MOBILE_DOCK_GAP_PX));
    el.style.bottom = `${bottomPx}px`;
  }

  return { el, presentItem, syncPosition };
}

// --- Channeling Overlay (progress bar + cancel button) ---------------------
function createChannelingOverlay() {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: 'calc(var(--jshack-actionbar-height, 48px) + 12px + env(safe-area-inset-bottom, 0px))',
    transform: 'translateX(-50%)',
    display: 'none',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 16px',
    borderRadius: '8px',
    background: 'rgba(10,14,22,0.88)',
    border: '1px solid #3b2d52',
    boxShadow: '0 0 16px rgba(120,60,200,0.2)',
    color: '#cfe8ff',
    zIndex: 950,
    pointerEvents: 'auto',
    minWidth: '280px',
    textAlign: 'center',
  });

  const label = document.createElement('div');
  Object.assign(label.style, { fontSize: '13px', fontWeight: '600', letterSpacing: '0.5px', whiteSpace: 'nowrap' });
  label.textContent = 'Channeling...';

  const barOuter = document.createElement('div');
  Object.assign(barOuter.style, {
    flex: '1', minWidth: '80px', height: '8px', borderRadius: '4px',
    background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
  });
  const barInner = document.createElement('div');
  Object.assign(barInner.style, {
    width: '0%', height: '100%', borderRadius: '4px',
    background: 'linear-gradient(90deg, #7b3fbe, #b070ff)',
    transition: 'width 0.35s ease',
  });
  barOuter.appendChild(barInner);

  const progressText = document.createElement('div');
  Object.assign(progressText.style, { fontSize: '11px', opacity: '0.7', whiteSpace: 'nowrap' });
  progressText.textContent = '';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '\u00D7';
  cancelBtn.title = 'Cancel (ESC)';
  Object.assign(cancelBtn.style, {
    padding: '2px 8px',
    minHeight: '28px', minWidth: '28px',
    borderRadius: '4px',
    border: '1px solid #5a3a7a',
    background: '#2a1a3a',
    color: '#e6d6ff',
    fontSize: '14px',
    cursor: 'pointer',
    touchAction: 'manipulation',
    lineHeight: '1',
  });
  cancelBtn.addEventListener('click', () => {
    try { window.dispatchEvent(new CustomEvent('ui:cancelChanneling')); } catch {}
  });

  el.appendChild(label);
  el.appendChild(barOuter);
  el.appendChild(progressText);
  el.appendChild(cancelBtn);

  let castTime = 0;
  let channelMode = 'cast';
  let sustainManaPerTick = 0;

  window.addEventListener('ui:channeling:start', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const name = String(e?.detail?.spellName || 'Spell');
    channelMode = String(e?.detail?.mode || 'cast');
    castTime = Math.max(1, Number(e?.detail?.castTime || 1));
    sustainManaPerTick = Math.max(0, Number(e?.detail?.manaPerTick || 0));
    label.textContent = `Channeling ${name}...`;
    if (channelMode === 'sustain') {
      const manaRemaining = Math.max(0, Number(e?.detail?.manaRemaining || 0));
      const manaMax = Math.max(1, Number(e?.detail?.manaMax || manaRemaining || 1));
      const pct = Math.min(100, Math.max(0, (manaRemaining / manaMax) * 100));
      barInner.style.width = pct + '%';
      progressText.textContent = `${manaRemaining.toFixed(1)} mana, -${sustainManaPerTick}/tick`;
    } else {
      barInner.style.width = '0%';
      progressText.textContent = `0 / ${castTime}`;
    }
    el.style.display = 'flex';
  });

  window.addEventListener('ui:channeling:tick', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const mode = String(e?.detail?.mode || channelMode || 'cast');
    if (mode === 'sustain') {
      const manaRemaining = Math.max(0, Number(e?.detail?.manaRemaining || 0));
      const manaMax = Math.max(1, Number(e?.detail?.manaMax || manaRemaining || 1));
      const manaPerTick = Math.max(0, Number(e?.detail?.manaPerTick || sustainManaPerTick || 0));
      const pct = Math.min(100, Math.max(0, (manaRemaining / manaMax) * 100));
      barInner.style.width = pct + '%';
      progressText.textContent = `${manaRemaining.toFixed(1)} mana, -${manaPerTick}/tick`;
      return;
    }
    const remaining = Number(e?.detail?.turnsRemaining || 0);
    const total = Math.max(1, Number(e?.detail?.turnsTotal || castTime || 1));
    const elapsed = total - remaining;
    const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
    barInner.style.width = pct + '%';
    progressText.textContent = `${elapsed} / ${total}`;
  });

  window.addEventListener('ui:channeling:end', () => {
    el.style.display = 'none';
  });

  return { el };
}



/** @param {{id:number,identity?:string,name:string,type:string,count:number}} it @param {{onUse:Function,onDismiss:Function,onThrow?:Function|null,onDrop?:Function|null,onPin?:Function|null,onInteracted?:Function|null}} h */
function renderQuickChip(it, h) {
  const actionable = isQuickChipActionable(it);
  const markInteracted = () => { if (typeof h.onInteracted === 'function') h.onInteracted(); };
  const chip = document.createElement('div');
  Object.assign(chip.style, {
    display: 'flex',
    flexDirection: 'column',
    position: QUICK_CHIP_DISMISS_LAYOUT.chipPosition,
    alignItems: 'stretch',
    gap: '8px',
    padding: '6px 8px', borderRadius: '6px',
    border: '1px solid #2d3b52', background: '#101626', color: '#cfe8ff'
  });
  const header = document.createElement('button');
  header.type = 'button';
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: '220px',
    maxWidth: '320px',
    padding: '6px 8px',
    border: '1px solid #2d3b52',
    borderRadius: '6px',
    background: '#0a111f',
    color: '#cfe8ff',
    textAlign: 'left',
    cursor: 'pointer',
    paddingRight: QUICK_CHIP_DISMISS_LAYOUT.contentPaddingRight,
  });

  const glyph = document.createElement('span');
  glyph.textContent = String(it.glyph || '⬢');
  Object.assign(glyph.style, {
    fontSize: '18px',
    lineHeight: '1',
    color: String(it.glyphColor || '#cfe8ff'),
    minWidth: '18px',
    textAlign: 'center',
    pointerEvents: 'none',
  });
  header.appendChild(glyph);

  const textWrap = document.createElement('span');
  Object.assign(textWrap.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: '0',
    pointerEvents: 'none',
    flex: '1 1 auto',
  });
  const line1 = document.createElement('span');
  line1.textContent = bracketizeLabel(String(it.name || 'item'));
  Object.assign(line1.style, {
    ...rarityStyle(String(it?.rarityName || it?.details?.rarityName || 'common')),
    fontSize: '12px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });
  const line2 = document.createElement('span');
  // Prefer content status (e.g. "Charges: ◈◈◈◇◇ 3/8") over generic detail
  const statusLines = Array.isArray(it.contentStatus) ? it.contentStatus : [];
  const firstStatus = statusLines[0];
  line2.textContent = firstStatus?.text || getQuickChipDetailLine(it, { expanded: false });
  Object.assign(line2.style, {
    fontSize: '10px',
    opacity: '0.8',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: firstStatus?.color || 'inherit',
  });
  textWrap.appendChild(line1);
  textWrap.appendChild(line2);
  header.appendChild(textWrap);

  const chevron = document.createElement('span');
  chevron.textContent = '▾';
  Object.assign(chevron.style, {
    fontSize: '12px',
    opacity: '0.85',
    pointerEvents: 'none',
  });
  header.appendChild(chevron);

  const expandedWrap = document.createElement('div');
  Object.assign(expandedWrap.style, {
    display: 'none',
    flexDirection: 'column',
    gap: '8px',
  });

  const detailPanel = document.createElement('div');
  Object.assign(detailPanel.style, {
    minWidth: '180px',
    maxWidth: '260px',
    maxHeight: '30vh',
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '6px',
    border: '1px solid #2d3b52',
    borderRadius: '6px',
    background: '#0a111f',
  });
  // Use the item directly — it IS the canonical inventory display data.
  renderItemDetails(detailPanel, it);
  // Quick-chip header already shows item identity; hide duplicated title row in expanded details.
  if (detailPanel.firstElementChild) detailPanel.firstElementChild.remove();
  expandedWrap.appendChild(detailPanel);

  const btn = document.createElement('button');
  Object.assign(btn.style, {
    padding: '6px 10px', background: '#101626', color: '#cfe8ff',
    border: '1px solid #2d3b52', borderRadius: '6px', cursor: 'pointer'
  });
  btn.textContent = getQuickChipPrimaryActionLabel(it);
  btn.addEventListener('click', () => {
    markInteracted();
    h.onUse && h.onUse();
  });

  let identifyBtn = null;
  if (canQuickChipIdentify(it)) {
    const hasScroll = hasScrollForIdentify(it);
    identifyBtn = document.createElement('button');
    Object.assign(identifyBtn.style, {
      padding: '6px 10px', background: '#101626',
      color: hasScroll ? '#cfe8ff' : '#556',
      border: '1px solid #2d3b52', borderRadius: '6px',
      cursor: hasScroll ? 'pointer' : 'default',
      opacity: hasScroll ? '1' : '0.45',
    });
    identifyBtn.textContent = hasScroll ? 'Identify' : 'Identify (no scroll)';
    if (hasScroll) {
      identifyBtn.addEventListener('click', () => {
        markInteracted();
        window.dispatchEvent(new CustomEvent('ui:requestQuickChipIdentify', { detail: { targetItemId: it.id } }));
      });
    }
  }

  let applyBtn = null;
  if (typeof h.onApply === 'function') {
    applyBtn = document.createElement('button');
    Object.assign(applyBtn.style, {
      padding: '6px 10px', background: '#101626', color: '#cfe8ff',
      border: '1px solid #2d3b52', borderRadius: '6px', cursor: 'pointer'
    });
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', () => {
      markInteracted();
      h.onApply && h.onApply();
    });
  }

  let throwBtn = null;
  if (typeof h.onThrow === 'function') {
    throwBtn = document.createElement('button');
    Object.assign(throwBtn.style, {
      padding: '6px 10px', background: '#101626', color: '#cfe8ff',
      border: '1px solid #2d3b52', borderRadius: '6px', cursor: 'pointer'
    });
    throwBtn.textContent = 'Throw';
    throwBtn.addEventListener('click', () => {
      markInteracted();
      h.onThrow && h.onThrow();
    });
  }

  let dropBtn = null;
  if (typeof h.onDrop === 'function') {
    dropBtn = document.createElement('button');
    Object.assign(dropBtn.style, {
      padding: '6px 10px', background: '#101626', color: '#cfe8ff',
      border: '1px solid #2d3b52', borderRadius: '6px', cursor: 'pointer'
    });
    dropBtn.textContent = 'Drop';
    dropBtn.addEventListener('click', () => {
      markInteracted();
      h.onDrop && h.onDrop();
    });
  }

  const x = document.createElement('button');
  Object.assign(x.style, {
    padding: '6px 8px', background: '#101626', color: '#cfe8ff',
    border: '1px solid #2d3b52',
    borderRadius: '6px',
    cursor: 'pointer',
    minWidth: '28px',
    position: 'absolute',
    top: QUICK_CHIP_DISMISS_LAYOUT.top,
    right: QUICK_CHIP_DISMISS_LAYOUT.right,
  });
  x.textContent = '\u00D7';
  x.title = 'Dismiss';
  x.addEventListener('click', () => {
    markInteracted();
    h.onDismiss && h.onDismiss();
  });
  let pinBtn = null;
  if (typeof h.onPin === 'function') {
    pinBtn = document.createElement('button');
    Object.assign(pinBtn.style, {
      padding: '6px 8px', background: '#101626', color: '#cfe8ff',
      border: '1px solid #2d3b52',
      borderRadius: '6px',
      cursor: 'pointer',
      minWidth: '28px',
      position: 'absolute',
      top: QUICK_CHIP_DISMISS_LAYOUT.top,
      right: '38px',
    });
    pinBtn.textContent = '\uD83D\uDCCC';
    pinBtn.title = 'Pin to quick slot';
    pinBtn.addEventListener('click', () => {
      markInteracted();
      h.onPin && h.onPin();
    });
  }

  const actions = document.createElement('div');
  Object.assign(actions.style, {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '6px',
  });
  if (actionable) actions.appendChild(btn);
  if (identifyBtn) actions.appendChild(identifyBtn);
  if (applyBtn) actions.appendChild(applyBtn);
  if (throwBtn) actions.appendChild(throwBtn);
  if (dropBtn) actions.appendChild(dropBtn);
  if (actions.childElementCount > 0) expandedWrap.appendChild(actions);

  let expanded = false;
  const setExpanded = (next) => {
    expanded = !!next;
    expandedWrap.style.display = expanded ? 'flex' : 'none';
    chevron.textContent = expanded ? '▴' : '▾';
    line2.textContent = getQuickChipDetailLine(it, { expanded });
  };
  if (h.startExpanded) setExpanded(true);
  header.addEventListener('click', () => {
    markInteracted();
    setExpanded(!expanded);
  });
  expandedWrap.addEventListener('pointerdown', markInteracted);

  chip.appendChild(x);
  if (pinBtn) chip.appendChild(pinBtn);
  chip.appendChild(header);
  chip.appendChild(expandedWrap);
  return chip;
}
