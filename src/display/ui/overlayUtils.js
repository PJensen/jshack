// display/ui/overlayUtils.js
// Shared utilities, panel management, tooltips, and standalone UI widgets.

import { getHighscoreVersionLabel, getHighscores } from '../../cloud/tombstones/client.js';
import { GAME_ICON_FONT_FAMILY, GAME_LOG_FONT_FAMILY, GAME_TEXT_FONT_FAMILY } from '../fonts.js';
import { CHARACTER_MENU_TAB_GLYPHS } from './iconGlyphs.js';

export const PANEL_Z_BASE = 1200;
export let _panelZCounter = PANEL_Z_BASE;
export const UI_ROOT_Z_INDEX = 1000;
export const SPEECH_BUBBLE_LAYER_Z_INDEX = 2147483000;
export const DIALOG_LAYER_Z_INDEX = 2147483100;

/** Increment and return the panel z-index counter. */
export function bumpPanelZ() {
  _panelZCounter += 1;
  return _panelZCounter;
}

export const CHARACTER_SLOT_ORDER = Object.freeze([
  'brain',
  'weapon',
  'armor',
  'head',
  'neck',
  'belt',
  'gloves',
  'offhand',
  'ring1',
  'ring2',
  'legs',
  'feet',
  'ammo',
  'ranged',
]);
export const CHARACTER_MENU_TABS = Object.freeze([
  { key: 'character', icon: CHARACTER_MENU_TAB_GLYPHS.character, label: 'Character', eventName: 'ui:openCharacter' },
  { key: 'inventory', icon: CHARACTER_MENU_TAB_GLYPHS.inventory, label: 'Inventory', eventName: 'ui:openInventory' },
  { key: 'equipment', icon: CHARACTER_MENU_TAB_GLYPHS.equipment, label: 'Equipment', eventName: 'ui:openEquipment' },
  { key: 'quests', icon: CHARACTER_MENU_TAB_GLYPHS.quests, label: 'Quests', eventName: 'ui:openQuests' },
  { key: 'settings', icon: CHARACTER_MENU_TAB_GLYPHS.settings, label: 'Settings', eventName: 'ui:openSettings' },
]);
export const INTERACTION_POPUP_ARM_DELAY_MS = 250;

// --- _itemTooltip module state (mutable let) ---
let _itemTooltip = null;

export function getItemTooltip() {
  return _itemTooltip;
}

export function setItemTooltip(el) {
  _itemTooltip = el;
}

/**
 * @param {HTMLDivElement} host
 * @param {'character'|'inventory'|'equipment'|'settings'} activeKey
 */
export function appendCharacterMenuTabs(host, activeKey) {
  const tabs = document.createElement('div');
  Object.assign(tabs.style, {
    position: 'sticky',
    top: '0',
    zIndex: '3',
    display: 'grid',
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    gap: '6px',
    marginBottom: '10px',
    paddingBottom: '8px',
    background: UX_THEME.panelBg,
    backdropFilter: 'blur(6px)',
  });

  for (const tab of CHARACTER_MENU_TABS) {
    const btn = document.createElement('button');
    decorateButton(btn);
    Object.assign(btn.style, {
      minHeight: '46px',
      padding: '6px 4px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '3px',
      borderRadius: '8px',
    });
    const isActive = tab.key === activeKey;
    if (isActive) {
      btn.style.background = UX_THEME.surfaceSelected;
      btn.style.borderColor = UX_THEME.accentBorder;
      btn.style.color = UX_THEME.textStrong;
      btn.style.boxShadow = UX_THEME.accentGlow;
    }

    const icon = document.createElement('span');
    icon.textContent = tab.icon;
    icon.style.lineHeight = '1';
    icon.style.fontSize = '16px';
    icon.style.fontFamily = GAME_ICON_FONT_FAMILY;
    const label = document.createElement('span');
    label.textContent = tab.label;
    label.style.fontSize = '11px';
    label.style.lineHeight = '1';
    btn.title = tab.label;
    btn.setAttribute('aria-label', tab.label);
    if (isActive) btn.setAttribute('aria-current', 'page');
    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent(tab.eventName));
    });
    tabs.appendChild(btn);
  }

  host.appendChild(tabs);
}

/**
 * Cycle the shared character-menu tabs from keyboard handlers.
 * @param {string} activeKey
 * @param {boolean} reverse
 */
export function dispatchCharacterMenuTabCycle(activeKey, reverse = false) {
  const current = CHARACTER_MENU_TABS.findIndex((tab) => tab.key === activeKey);
  const start = current >= 0 ? current : 0;
  const dir = reverse ? -1 : 1;
  const next = (start + dir + CHARACTER_MENU_TABS.length) % CHARACTER_MENU_TABS.length;
  const tab = CHARACTER_MENU_TABS[next];
  if (tab?.eventName) window.dispatchEvent(new CustomEvent(tab.eventName));
}

/**
 * Mark an element as intentionally scrollable under global input lockdown.
 * @param {HTMLElement} el
 */
export function markScrollable(el) {
  if (!(el instanceof HTMLElement)) return;
  el.dataset.allowScroll = 'true';
  el.style.touchAction = 'pan-y';
  el.style.overscrollBehavior = 'contain';
}

/**
 * @param {any} item
 * @returns {string}
 */
export function quickPinKeyForItem(item) {
  const identity = String(item?.identity || item?.details?.identity || '');
  if (identity) return identity;
  const id = Number(item?.id || 0) | 0;
  return id > 0 ? `id:${id}` : '';
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
    root.style.zIndex = String(UI_ROOT_Z_INDEX);
    document.body.appendChild(root);
  }
  return root;
}

// --- Gesture debug overlay -------------------------------------------------
export function ensureGestureDebugLayer(root) {
  const canvas = document.createElement('canvas');
  canvas.id = 'gesture-debug-layer';
  Object.assign(canvas.style, {
    position: 'fixed',
    left: '0', top: '0', right: '0', bottom: '0',
    width: '100vw', height: '100vh',
    pointerEvents: 'none',
    zIndex: 910,
    display: 'none',
  });
  root.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const resize = () => {
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const w = Math.max(1, window.innerWidth | 0);
    const h = Math.max(1, window.innerHeight | 0);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
  return { canvas, ctx, resize };
}

export function drawGestureDebug(layer, points, active, recognized) {
  if (!layer || !layer.ctx) return;
  const ctx = layer.ctx;
  const canvas = layer.canvas;
  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const hasPoints = Array.isArray(points) && points.length > 0;
  const show = !!(active || recognized || hasPoints);
  canvas.style.display = show ? 'block' : 'none';
  if (!show || !hasPoints) return;

  // Draw path
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = recognized ? '#5ff' : (active ? '#8cf' : '#bbb');
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  // Endpoints
  const first = points[0];
  const last = points[points.length - 1];
  if (first) { ctx.beginPath(); ctx.arc(first.x, first.y, 4, 0, Math.PI * 2); ctx.fill(); }
  if (last) { ctx.beginPath(); ctx.arc(last.x, last.y, 4, 0, Math.PI * 2); ctx.fill(); }

  // Recognition bounds
  if (recognized && recognized.bounds) {
    const b = recognized.bounds;
    const bx = Number.isFinite(Number(b.x)) ? Number(b.x) : Number(b.minX || 0);
    const by = Number.isFinite(Number(b.y)) ? Number(b.y) : Number(b.minY || 0);
    const bw = Number.isFinite(Number(b.w)) ? Number(b.w) : Number(b.width || 0);
    const bh = Number.isFinite(Number(b.h)) ? Number(b.h) : Number(b.height || 0);
    ctx.strokeStyle = 'rgba(120,200,255,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
  }
  ctx.restore();
}

// --- Ground item tooltip (click to pick up) -------------------------------
/** @param {HTMLElement} root */
export function ensureGroundTooltip(root) {
  const tip = document.createElement('div');
  tip.id = 'ground-item-tooltip';
  Object.assign(tip.style, {
    position: 'fixed',
    left: '50%',
    bottom: 'calc(var(--jshack-actionbar-height, 48px) + 46px + env(safe-area-inset-bottom, 0px))',
    transform: 'translateX(-50%)',
    minWidth: '132px', maxWidth: '54vw', pointerEvents: 'auto', display: 'none',
    background: UX_THEME.panelBg, color: UX_THEME.text, borderRadius: UX_THEME.radius,
    border: UX_THEME.panelBorder, boxShadow: '0 16px 42px rgba(0,0,0,0.58), inset 0 0 0 1px rgba(188,206,224,0.05)',
    fontFamily: GAME_TEXT_FONT_FAMILY, padding: '7px 8px', zIndex: 850
  });
  root.appendChild(tip);
  return tip;
}

// --- Floating item tooltip (WoW/Diablo style, shared across all panels) -----

/** @param {HTMLElement} root */
export function ensureItemTooltip(root) {
  const tip = document.createElement('div');
  tip.id = 'item-tooltip';
  Object.assign(tip.style, {
    position: 'fixed',
    display: 'none',
    maxWidth: '280px',
    pointerEvents: 'none',
    background: UX_THEME.panelBg,
    color: UX_THEME.text,
    borderRadius: UX_THEME.radius,
    border: UX_THEME.panelBorder,
    boxShadow: '0 16px 42px rgba(0,0,0,0.58), inset 0 0 0 1px rgba(188,206,224,0.05)',
    fontFamily: GAME_TEXT_FONT_FAMILY,
    padding: '10px 12px',
    zIndex: '1400',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    fontSize: '13px',
  });
  root.appendChild(tip);
  return tip;
}

/**
 * Mobile-first tooltip pinning target.
 * Coarse pointer + smaller viewport keeps desktop behavior unchanged.
 */
export function isMobileTooltipViewport() {
  const coarse = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  return coarse && window.innerWidth <= 900;
}

/** @param {HTMLElement} tip */
export function resetTooltipPlacement(tip) {
  tip.style.left = '';
  tip.style.right = '';
  tip.style.top = '';
  tip.style.bottom = '';
  tip.style.transform = '';
}

/**
 * Position the tooltip near the anchor element.
 * @param {HTMLElement} tip
 * @param {HTMLElement} anchorEl
 */
export function positionTooltip(tip, anchorEl) {
  if (!anchorEl) return;
  resetTooltipPlacement(tip);
  const GAP = 8;
  const MARGIN = 8;
  const ar = anchorEl.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const narrow = vw < 500 || ar.width > vw * 0.6;

  let x, y;
  let placed = false;

  if (!narrow) {
    // Try right of anchor
    x = ar.right + GAP;
    y = ar.top + (ar.height / 2) - (th / 2);
    if (x + tw + MARGIN <= vw && y >= MARGIN && y + th + MARGIN <= vh) {
      placed = true;
    }
    // Try left of anchor
    if (!placed) {
      x = ar.left - GAP - tw;
      y = ar.top + (ar.height / 2) - (th / 2);
      if (x >= MARGIN && y >= MARGIN && y + th + MARGIN <= vh) {
        placed = true;
      }
    }
  }

  // Try above anchor
  if (!placed) {
    x = ar.left + (ar.width / 2) - (tw / 2);
    y = ar.top - GAP - th;
    if (y >= MARGIN) {
      placed = true;
    }
  }

  // Fallback: below anchor
  if (!placed) {
    x = ar.left + (ar.width / 2) - (tw / 2);
    y = ar.bottom + GAP;
  }

  // Clamp to viewport
  x = Math.max(MARGIN, Math.min(vw - tw - MARGIN, x));
  y = Math.max(MARGIN, Math.min(vh - th - MARGIN, y));

  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}

/**
 * @param {HTMLElement | null | undefined} anchorEl
 * @returns {HTMLElement | null}
 */
export function resolveTooltipPanelInner(anchorEl) {
  if (!anchorEl || typeof anchorEl.closest !== 'function') return null;
  const panel = anchorEl.closest('.ui-panel');
  if (!(panel instanceof HTMLElement)) return null;
  if (panel.style.display === 'none') return null;

  const inner = /** @type {any} */ (panel)._inner;
  if (inner instanceof HTMLElement) return inner;

  const first = panel.firstElementChild;
  return first instanceof HTMLElement ? first : null;
}

/**
 * Position a pinned mobile tooltip under the open panel window.
 * @param {HTMLElement} tip
 * @param {HTMLElement} anchorEl
 * @returns {boolean}
 */
export function positionTooltipBelowPanel(tip, anchorEl) {
  const inner = resolveTooltipPanelInner(anchorEl);
  if (!inner) return false;

  resetTooltipPlacement(tip);
  const MARGIN = 8;
  const GAP = 8;
  const rect = inner.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const vw = window.innerWidth;
  let x = rect.left + (rect.width * 0.5) - (tw * 0.5);
  x = Math.max(MARGIN, Math.min(vw - tw - MARGIN, x));

  tip.style.left = `${x}px`;
  tip.style.top = `${Math.max(MARGIN, rect.bottom + GAP)}px`;
  return true;
}

/**
 * @param {HTMLElement} tip
 * @param {HTMLElement} anchorEl
 */
export function positionTooltipBottomCenter(tip, anchorEl) {
  if (positionTooltipBelowPanel(tip, anchorEl)) return;
  resetTooltipPlacement(tip);
  tip.style.left = '50%';
  tip.style.bottom = 'max(12px, env(safe-area-inset-bottom, 0px))';
  tip.style.transform = 'translateX(-50%)';
}

/**
 * Show the floating item tooltip near the given anchor element.
 * @param {any} item
 * @param {HTMLElement} anchorEl
 * @param {{ pinBottomOnMobile?: boolean }} [opts]
 */
export function showItemTooltip(item, anchorEl, opts) {
  const tip = _itemTooltip;
  if (!tip) return;
  if (!item) { hideItemTooltip(); return; }
  // Anchor inside a hidden panel has no offsetParent — skip showing the
  // tooltip so it doesn't end up at 0,0 (top-left corner).
  if (anchorEl && !anchorEl.offsetParent) { hideItemTooltip(); return; }
  renderItemDetails(tip, item);
  tip.style.display = 'block';
  const pinBottom = !!opts?.pinBottomOnMobile && isMobileTooltipViewport();
  tip.style.maxWidth = pinBottom ? 'min(92vw, 460px)' : '280px';
  tip.style.maxHeight = '';
  if (pinBottom) {
    positionTooltipBottomCenter(tip, anchorEl);
  } else {
    positionTooltip(tip, anchorEl);
  }
}

export function hideItemTooltip() {
  if (_itemTooltip) _itemTooltip.style.display = 'none';
}

// --- Stair tooltip (tap to descend/ascend) ---------------------------------
/** @param {HTMLElement} root */
export function ensureStairTooltip(root) {
  const tip = document.createElement('div');
  tip.id = 'stair-tooltip';
  Object.assign(tip.style, {
    position: 'fixed',
    left: '50%',
    top: '25%',
    transform: 'translate(-50%, -50%)',
    minWidth: '112px', maxWidth: '50vw', pointerEvents: 'none', display: 'none',
    background: UX_THEME.panelBg, color: UX_THEME.text, borderRadius: UX_THEME.radius,
    border: UX_THEME.panelBorder, boxShadow: '0 16px 42px rgba(0,0,0,0.58), inset 0 0 0 1px rgba(188,206,224,0.05)',
    fontFamily: GAME_TEXT_FONT_FAMILY, padding: '6px 8px', zIndex: 850,
    textAlign: 'center', cursor: 'pointer'
  });
  root.appendChild(tip);
  return tip;
}

/** @param {HTMLDivElement} tip @param {{stairId?:number, direction?:string}} detail */
export function renderStairTooltip(tip, detail) {
  tip.innerHTML = '';
  const dir = detail?.direction || 'down';
  const isReturn = dir === 'return';
  const label = isReturn
    ? 'Return Portal'
    : (dir === 'down' ? 'Descend Stairs' : 'Ascend Stairs');

  const title = document.createElement('div');
  title.textContent = label;
  Object.assign(title.style, { fontWeight: 'bold', fontSize: '12px', marginBottom: '2px' });
  tip.appendChild(title);

  const hint = document.createElement('div');
  hint.style.opacity = '0.8';
  hint.style.fontSize = '10px';
  hint.textContent = isReturn
    ? 'Tap to return'
    : `Tap to ${dir === 'down' ? 'descend' : 'ascend'}`;
  tip.appendChild(hint);

  const action = document.createElement('button');
  action.type = 'button';
  action.textContent = isReturn
    ? 'Return'
    : (dir === 'down' ? 'Descend' : 'Ascend');
  Object.assign(action.style, {
    marginTop: '5px',
    minHeight: '34px',
    minWidth: '80px',
    fontFamily: GAME_TEXT_FONT_FAMILY,
    fontSize: '11px',
    fontWeight: 'bold',
    padding: '0 10px',
    pointerEvents: 'auto',
  });
  decorateButton(action);
  action.onclick = () => {
    window.dispatchEvent(new CustomEvent('ui:requestStairTraverse', {
      detail: { stairId: detail?.stairId, direction: dir }
    }));
    tip.style.display = 'none';
  };
  tip.appendChild(action);
}

// --- Authored interactable tooltip -----------------------------------------
/** @param {HTMLElement} root */
export function ensureInteractableTooltip(root) {
  const tip = document.createElement('div');
  tip.id = 'interactable-tooltip';
  Object.assign(tip.style, {
    position: 'fixed',
    left: '50%',
    top: '25%',
    transform: 'translate(-50%, -50%)',
    minWidth: '112px', maxWidth: '50vw', pointerEvents: 'none', display: 'none',
    background: UX_THEME.panelBg, color: UX_THEME.text, borderRadius: UX_THEME.radius,
    border: UX_THEME.panelBorder, boxShadow: '0 16px 42px rgba(0,0,0,0.58), inset 0 0 0 1px rgba(188,206,224,0.05)',
    fontFamily: GAME_TEXT_FONT_FAMILY, padding: '6px 8px', zIndex: 850,
    textAlign: 'center', cursor: 'pointer'
  });
  root.appendChild(tip);
  return tip;
}

/** @param {HTMLDivElement} tip @param {{targetId?:number, action?:string, mode?:string, title?:string, hint?:string, label?:string}} detail */
export function renderInteractableTooltip(tip, detail) {
  tip.innerHTML = '';
  const titleText = String(detail?.title || detail?.label || 'Interact');
  const hintText = String(detail?.hint || '');
  const labelText = String(detail?.label || titleText);

  const title = document.createElement('div');
  title.textContent = titleText;
  Object.assign(title.style, { fontWeight: 'bold', fontSize: '12px', marginBottom: '2px' });
  tip.appendChild(title);

  if (hintText) {
    const hint = document.createElement('div');
    hint.style.opacity = '0.8';
    hint.style.fontSize = '10px';
    hint.textContent = hintText;
    tip.appendChild(hint);
  }

  const action = document.createElement('button');
  action.type = 'button';
  action.textContent = labelText;
  Object.assign(action.style, {
    marginTop: '5px',
    minHeight: '34px',
    minWidth: '80px',
    borderRadius: '7px',
    border: '1px solid #6aa7da',
    background: '#234463',
    color: '#e9f7ff',
    fontFamily: GAME_TEXT_FONT_FAMILY,
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
    padding: '0 10px',
    pointerEvents: 'auto',
  });
  const armAt = performance.now() + INTERACTION_POPUP_ARM_DELAY_MS;
  action.disabled = true;
  action.style.opacity = '0.62';
  action.style.cursor = 'default';
  setTimeout(() => {
    action.disabled = false;
    action.style.opacity = '1';
    action.style.cursor = 'pointer';
  }, INTERACTION_POPUP_ARM_DELAY_MS);
  action.onclick = () => {
    if (performance.now() < armAt) return;
    window.dispatchEvent(new CustomEvent('ui:requestInteractableAction', {
      detail: {
        targetId: detail?.targetId,
        action: detail?.action,
        mode: detail?.mode || '',
      }
    }));
    tip.style.display = 'none';
  };
  tip.appendChild(action);
}

// --- Trap tooltip (tap to disarm) ------------------------------------------
/** @param {HTMLElement} root */
export function ensureTrapTooltip(root) {
  const tip = document.createElement('div');
  tip.id = 'trap-tooltip';
  Object.assign(tip.style, {
    position: 'fixed',
    left: '50%',
    top: '25%',
    transform: 'translate(-50%, -50%)',
    minWidth: '112px', maxWidth: '50vw', pointerEvents: 'none', display: 'none',
    background: UX_THEME.dangerBg, color: UX_THEME.dangerText, borderRadius: UX_THEME.radius,
    border: UX_THEME.dangerBorder, boxShadow: '0 16px 42px rgba(0,0,0,0.58), inset 0 0 0 1px rgba(255,210,190,0.05)',
    fontFamily: GAME_TEXT_FONT_FAMILY, padding: '6px 8px', zIndex: 850,
    textAlign: 'center', cursor: 'pointer'
  });
  root.appendChild(tip);
  return tip;
}

/** @param {HTMLDivElement} tip @param {{trapId?:number, trapType?:string, difficulty?:number}} detail */
export function renderTrapTooltip(tip, detail) {
  tip.innerHTML = '';
  const trapType = detail?.trapType || 'Trap';

  const title = document.createElement('div');
  title.textContent = `${trapType} 🎲`;
  Object.assign(title.style, { fontWeight: 'bold', fontSize: '12px', marginBottom: '2px' });
  tip.appendChild(title);

  const hint = document.createElement('div');
  hint.style.opacity = '0.8';
  hint.style.fontSize = '10px';
  hint.textContent = 'Tap to disarm';
  tip.appendChild(hint);

  const action = document.createElement('button');
  action.type = 'button';
  action.textContent = 'Disarm';
  Object.assign(action.style, {
    marginTop: '5px',
    minHeight: '34px',
    minWidth: '80px',
    borderRadius: '7px',
    border: '1px solid #c78c8c',
    background: '#4b2323',
    color: '#ffe4df',
    fontFamily: GAME_TEXT_FONT_FAMILY,
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
    padding: '0 10px',
    pointerEvents: 'auto',
  });
  action.onclick = () => {
    window.dispatchEvent(new CustomEvent('ui:requestDisarmTrap', {
      detail: { trapId: detail?.trapId }
    }));
    tip.style.display = 'none';
  };
  tip.appendChild(action);
}

// --- Tombstone tooltip (epitaph sign at top of screen) ---------------------
/** @param {HTMLElement} root */
export function ensureTombstoneTooltip(root) {
  const tip = document.createElement('div');
  tip.id = 'tombstone-tooltip';
  Object.assign(tip.style, {
    position: 'fixed',
    left: '50%',
    top: '24px',
    transform: 'translateX(-50%)',
    minWidth: '200px', maxWidth: '320px', pointerEvents: 'none', display: 'none',
    background: 'rgba(30,28,24,0.95)', color: '#b0a890',
    borderRadius: '4px',
    border: '2px solid #6b6252',
    boxShadow: '0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
    fontFamily: GAME_TEXT_FONT_FAMILY, padding: '14px 20px', zIndex: 900,
    textAlign: 'center', whiteSpace: 'pre-line'
  });
  root.appendChild(tip);
  return tip;
}

/** @param {HTMLDivElement} tip @param {{epitaph?:string}} detail */
export function renderTombstoneTooltip(tip, detail) {
  tip.innerHTML = '';

  const header = document.createElement('div');
  header.textContent = '\u2020 TOMBSTONE \u2020';
  Object.assign(header.style, {
    fontSize: '11px', letterSpacing: '3px', color: '#887860',
    marginBottom: '8px', textTransform: 'uppercase'
  });
  tip.appendChild(header);

  const rule = document.createElement('hr');
  Object.assign(rule.style, {
    border: 'none', borderTop: '1px solid #5a5040',
    margin: '0 0 8px 0'
  });
  tip.appendChild(rule);

  const text = document.createElement('div');
  text.textContent = detail?.epitaph || 'The inscription has faded\u2026';
  Object.assign(text.style, {
    fontSize: '13px', lineHeight: '1.5', color: '#c8b898'
  });
  tip.appendChild(text);
}

// --- Dev notice tooltip (first-run project notice) -------------------------
/** @param {HTMLElement} root */
export function ensureDevNoticeTooltip(root) {
  const tip = document.createElement('div');
  tip.id = 'dev-notice-tooltip';
  Object.assign(tip.style, {
    position: 'fixed',
    left: '50%',
    top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
    transform: 'translateX(-50%)',
    width: 'min(92vw, 420px)',
    pointerEvents: 'auto',
    display: 'none',
    background: 'rgba(12,18,28,0.97)',
    color: '#dbeaff',
    borderRadius: '12px',
    border: '1px solid #426084',
    boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
    fontFamily: GAME_TEXT_FONT_FAMILY,
    padding: '12px 14px',
    zIndex: 920,
  });
  root.appendChild(tip);
  return tip;
}

/** @param {HTMLDivElement} tip @param {{title?:string, body?:string, closeText?:string}} detail */
export function renderDevNoticeTooltip(tip, detail) {
  tip.innerHTML = '';

  const title = document.createElement('div');
  title.textContent = detail?.title || 'Active Development Notice';
  Object.assign(title.style, {
    fontWeight: 'bold',
    fontSize: '13px',
    color: '#9ed2ff',
    marginBottom: '8px',
    letterSpacing: '0.03em',
  });
  tip.appendChild(title);

  const body = document.createElement('div');
  body.textContent = detail?.body
    || 'JSHack is under very active development. Use the Bug Report button in Settings to request features or report bugs!';
  Object.assign(body.style, {
    fontSize: '12px',
    lineHeight: '1.45',
    color: '#dbeaff',
    marginBottom: '10px',
  });
  tip.appendChild(body);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = detail?.closeText || 'Got it';
  Object.assign(closeBtn.style, {
    minHeight: '44px',
    minWidth: '88px',
    borderRadius: '10px',
    border: '1px solid #6aa7da',
    background: '#234463',
    color: '#e9f7ff',
    fontFamily: GAME_TEXT_FONT_FAMILY,
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    padding: '0 14px',
  });
  closeBtn.onclick = () => { tip.style.display = 'none'; };
  tip.appendChild(closeBtn);
}

// ---- First-run tile key overlay ----

const TILE_KEY_ENTRIES = [
  // Terrain
  { glyph: '@', color: '#e8f7ff', label: 'You' },
  { glyph: '#', color: '#99a', label: 'Wall' },
  { glyph: '.', color: '#7788aa', label: 'Floor' },
  { glyph: '+', color: '#cc9', label: 'Door (closed)' },
  { glyph: '/', color: '#cc9', label: 'Door (open)' },
  { glyph: '>', color: '#ccc', label: 'Stairs down' },
  { glyph: '<', color: '#ccc', label: 'Stairs up' },
  { glyph: '~', color: '#5ea8d4', label: 'Water' },
  // Items
  { glyph: '!', color: '#66ff99', label: 'Potion' },
  { glyph: '?', color: '#eeddaa', label: 'Scroll' },
  { glyph: ')', color: '#e8e2b0', label: 'Weapon' },
  { glyph: '[', color: '#c49c66', label: 'Armor' },
  { glyph: ']', color: '#c8a050', label: 'Chest' },
  { glyph: '$', color: '#ffde5a', label: 'Gold' },
  { glyph: '%', color: '#b89070', label: 'Corpse / Food' },
  { glyph: '*', color: '#ffffff', label: 'Gem' },
  { glyph: '^', color: '#a84000', label: 'Trap' },
  // Monsters (colored letters)
  { glyph: 'g', color: '#7ecc5a', label: 'Goblin' },
  { glyph: 'r', color: '#b89070', label: 'Rat' },
  { glyph: 'b', color: '#9080b0', label: 'Bat' },
];

export function ensureTileKeyTooltip(root) {
  const tip = document.createElement('div');
  tip.id = 'tile-key-tooltip';
  Object.assign(tip.style, {
    position: 'fixed',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 'min(94vw, 480px)',
    pointerEvents: 'auto',
    display: 'none',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'rgba(8,12,22,0.96)',
    color: '#dbeaff',
    borderRadius: '14px',
    border: '1px solid #3a5a80',
    boxShadow: '0 0 60px rgba(30,90,160,0.25), 0 12px 40px rgba(0,0,0,0.6)',
    fontFamily: GAME_TEXT_FONT_FAMILY,
    padding: '18px 20px 14px',
    zIndex: 930,
  });
  root.appendChild(tip);
  return tip;
}

export function renderTileKeyTooltip(tip) {
  tip.innerHTML = '';

  // Title
  const title = document.createElement('div');
  title.textContent = 'Map Key';
  Object.assign(title.style, {
    fontWeight: 'bold',
    fontSize: '15px',
    color: '#9ed2ff',
    marginBottom: '12px',
    letterSpacing: '0.06em',
    textAlign: 'center',
  });
  tip.appendChild(title);

  // Grid of glyph entries
  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: '6px 12px',
    width: '100%',
    marginBottom: '14px',
  });

  for (const entry of TILE_KEY_ENTRIES) {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    });

    const glyphEl = document.createElement('span');
    glyphEl.textContent = entry.glyph;
    Object.assign(glyphEl.style, {
      fontSize: '18px',
      fontWeight: 'bold',
      color: entry.color,
      textShadow: `0 0 6px ${entry.color}66`,
      width: '22px',
      textAlign: 'center',
      flexShrink: '0',
    });

    const labelEl = document.createElement('span');
    labelEl.textContent = entry.label;
    Object.assign(labelEl.style, {
      fontSize: '12px',
      color: '#bcd2e8',
    });

    row.appendChild(glyphEl);
    row.appendChild(labelEl);
    grid.appendChild(row);
  }
  tip.appendChild(grid);

  // Hint line
  const hint = document.createElement('div');
  hint.textContent = 'Bump doors to open \u00b7 Step on stairs to traverse';
  Object.assign(hint.style, {
    fontSize: '11px',
    color: '#7a9ab8',
    textAlign: 'center',
    marginBottom: '12px',
  });
  tip.appendChild(hint);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Got it';
  Object.assign(closeBtn.style, {
    minHeight: '44px',
    minWidth: '100px',
    borderRadius: '10px',
    border: '1px solid #6aa7da',
    background: '#234463',
    color: '#e9f7ff',
    fontFamily: GAME_TEXT_FONT_FAMILY,
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
    padding: '0 18px',
  });
  closeBtn.onclick = () => { tip.style.display = 'none'; };
  tip.appendChild(closeBtn);
}

export function ensureSpellGestureHint(root) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'fixed',
    left: '50%',
    top: '38%',
    transform: 'translate(-50%, -50%)',
    display: 'none',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    gap: '12px',
    zIndex: 920,
  });

  const glyph = document.createElement('div');
  glyph.textContent = 'Z';
  Object.assign(glyph.style, {
    fontFamily: GAME_TEXT_FONT_FAMILY,
    fontWeight: '700',
    fontSize: 'min(160px, 28vw)',
    color: '#d6f3ff',
    letterSpacing: '-0.04em',
    textShadow: buildLightningShadow(1),
    transition: 'opacity 120ms ease-out',
  });

  const caption = document.createElement('div');
  caption.textContent = 'Draw a Z to cast Lightning';
  Object.assign(caption.style, {
    fontFamily: GAME_TEXT_FONT_FAMILY,
    fontSize: 'min(24px, 5vw)',
    color: '#d6f3ff',
    textShadow: '0 0 6px rgba(80,160,255,0.55)',
    background: 'rgba(8,12,18,0.55)',
    padding: '6px 12px',
    borderRadius: '999px',
    border: '1px solid rgba(80,140,200,0.45)',
  });

  wrap.appendChild(glyph);
  wrap.appendChild(caption);
  root.appendChild(wrap);

  return { wrap, glyph, caption };
}

export function ensureVirtualJoystick(root) {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'fixed',
    inset: '0',
    display: 'none',
    pointerEvents: 'none',
    zIndex: 915,
  });

  const outer = document.createElement('div');
  Object.assign(outer.style, {
    position: 'fixed',
    width: '92px',
    height: '92px',
    borderRadius: '999px',
    border: '2px solid rgba(170,220,255,0.62)',
    background: 'rgba(46,88,132,0.46)',
    boxShadow: '0 0 18px rgba(80,150,220,0.32), inset 0 0 12px rgba(150,220,255,0.2)',
    backdropFilter: 'blur(1px)',
  });

  const inner = document.createElement('div');
  Object.assign(inner.style, {
    position: 'fixed',
    width: '40px',
    height: '40px',
    borderRadius: '999px',
    border: '1px solid rgba(195,235,255,0.76)',
    background: 'rgba(120,190,245,0.74)',
    boxShadow: '0 0 10px rgba(140,210,255,0.4), inset 0 0 6px rgba(255,255,255,0.3)',
  });

  wrap.appendChild(outer);
  wrap.appendChild(inner);
  root.appendChild(wrap);

  return { wrap, outer, inner };
}

export function buildLightningShadow(intensity) {
  const base = Math.max(0.2, Math.min(1, intensity));
  const outer = (12 + base * 32).toFixed(1);
  const inner = (6 + base * 18).toFixed(1);
  const core = (3 + base * 10).toFixed(1);
  return `0 0 ${outer}px rgba(120,200,255,0.55), 0 0 ${inner}px rgba(180,240,255,0.7), 0 0 ${core}px rgba(255,255,255,0.9)`;
}

export function buildFlameShadow(intensity) {
  const base = Math.max(0.2, Math.min(1, intensity));
  const outer = (12 + base * 32).toFixed(1);
  const inner = (6 + base * 18).toFixed(1);
  const core = (3 + base * 10).toFixed(1);
  return `0 0 ${outer}px rgba(255,160,80,0.55), 0 0 ${inner}px rgba(255,200,120,0.7), 0 0 ${core}px rgba(255,255,200,0.9)`;
}

/** @param {HTMLDivElement} tip @param {{mode?:'single'|'stack'|'multi', item?:any, items?:any[], count?:number, pickupRange?:number, stackIndex?:number}} detail */
export function renderGroundTooltip(tip, detail) {
  tip.innerHTML = '';
  const mode = detail?.mode || 'single';
  const renderCompactPickup = (it, subtext, onDismiss) => {
    tip.innerHTML = '';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '8px';

    const title = document.createElement('div');
    const rarity = String(it?.rarityName || 'common').toLowerCase();
    const nameSpan = document.createElement('span');
    nameSpan.textContent = bracketize(sanitize(it?.name || it?.type || 'item'));
    Object.assign(nameSpan.style, rarityStyle(rarity));
    title.appendChild(nameSpan);

    const raritySpan = document.createElement('span');
    raritySpan.textContent = ` ${rarity}`;
    raritySpan.style.opacity = '0.75';
    raritySpan.style.fontSize = '11px';
    title.appendChild(raritySpan);

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = '\u00d7';
    decorateButton(dismissBtn);
    dismissBtn.title = 'Dismiss';
    dismissBtn.style.marginLeft = 'auto';
    dismissBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof onDismiss === 'function') onDismiss();
    });

    header.appendChild(title);
    header.appendChild(dismissBtn);
    tip.appendChild(header);

    if (subtext) {
      const hint = document.createElement('div');
      hint.textContent = String(subtext);
      hint.style.marginTop = '4px';
      hint.style.opacity = '0.75';
      hint.style.fontSize = '11px';
      tip.appendChild(hint);
    }
  };

  if (mode === 'stack') {
    const stackItems = Array.isArray(detail?.items) ? detail.items.slice() : [];
    if (!stackItems.length) {
      tip.style.display = 'none';
      return;
    }

    let stackIndex = Math.max(0, Math.min(stackItems.length - 1, Number(detail?.stackIndex || 0) | 0));

    const renderStackAt = () => {
      const it = stackItems[stackIndex];
      renderCompactPickup(it, `${stackIndex + 1}/${stackItems.length} • Tap to pick up`, () => {
        stackItems.splice(stackIndex, 1);
        if (!stackItems.length) {
          tip.style.display = 'none';
          return;
        }
        if (stackIndex >= stackItems.length) stackIndex = stackItems.length - 1;
        renderStackAt();
      });
    };

    renderStackAt();

    tip.onclick = () => {
      const ids = getUiItemEntityIds(stackItems[stackIndex]);
      const firstId = Number(ids[0] || 0) | 0;
      if (firstId > 0) {
        window.dispatchEvent(new CustomEvent('ui:requestPickup', { detail: { itemIds: [firstId] } }));
      }
    };
    return;
  }
  if (mode === 'multi') {
    const fromChest = !!detail?.fromChest;
    tip.innerHTML = '';
    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px';
    const lbl = document.createElement('div');
    const chestLabel = (fromChest && detail?.chestName) ? `Open ${detail.chestName}` : 'Open Chest';
    lbl.textContent = fromChest ? chestLabel : `${detail?.count || (detail?.items?.length || 0)} items nearby`;
    lbl.style.fontWeight = 'bold';
    const hint = document.createElement('div');
    hint.textContent = fromChest ? 'Tap to open' : 'Tap to choose'; hint.style.marginLeft = 'auto'; hint.style.opacity = '0.8';
    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = '\u00d7';
    decorateButton(dismissBtn);
    dismissBtn.title = 'Dismiss';
    dismissBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      tip.style.display = 'none';
    });
    row.appendChild(lbl); row.appendChild(hint);
    row.appendChild(dismissBtn);
    tip.appendChild(row);

    const items = Array.isArray(detail?.items) ? detail.items : [];

    tip.onclick = () => {
      if (fromChest) {
        const chestId = Number(detail?.chestId || 0) | 0;
        if (chestId > 0) {
          window.dispatchEvent(new CustomEvent('ui:tapOpenChest', { detail: { chestId } }));
        }
      } else {
        window.dispatchEvent(new CustomEvent('ui:openPickupChooser', { detail: { items } }));
      }
      tip.style.display = 'none';
    };
    return;
  }

  const it = detail?.item || {};
  const openChestIfPresent = () => {
    const chestId = Number(detail?.chestId || 0) | 0;
    if (chestId > 0) {
      // Keep chest interaction in the same tap flow after top floor-item action.
      window.dispatchEvent(new CustomEvent('ui:tapOpenChest', { detail: { chestId } }));
    }
  };
  renderCompactPickup(it, 'Tap to pick up', () => {
    openChestIfPresent();
    tip.style.display = 'none';
  });

  // Click behavior: attempt pickup via shared flow
  tip.onclick = () => {
    const ids = getUiItemEntityIds(it);
    if (ids.length > 0) {
      window.dispatchEvent(new CustomEvent('ui:requestPickup', { detail: { itemIds: ids } }));
    }
    openChestIfPresent();
    tip.style.display = 'none';
  };
}

/** @param {string} k */
export function humanize(k) {
  const s = String(k || '').replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase().trim();
  return s;
}

/** @param {any} it */
export function getUiItemEntityIds(it) {
  const raw = Array.isArray(it?.entityIds) ? it.entityIds : [it?.id];
  const ids = [];
  for (const id of raw) {
    const n = Number(id || 0) | 0;
    if (n > 0 && !ids.includes(n)) ids.push(n);
  }
  return ids;
}

export const UX_THEME = Object.freeze({
  panelBackdrop: 'rgba(7, 8, 10, 0.62)',
  panelBg: 'rgba(10, 9, 8, 0.86)',
  panelBorder: '1px solid rgba(80, 70, 60, 0.48)',
  panelShadow: '0 28px 80px rgba(0,0,0,0.62), inset 0 0 0 1px rgba(188,206,224,0.06)',
  surfaceBg: 'rgba(17, 15, 13, 0.72)',
  surfaceBgStrong: 'rgba(23, 20, 17, 0.88)',
  surfaceSelected: 'rgba(43, 48, 54, 0.94)',
  surfaceBorder: '1px solid rgba(92, 82, 72, 0.58)',
  surfaceBorderSoft: '1px solid rgba(80, 70, 60, 0.34)',
  text: '#dde2e8',
  textStrong: '#eef3f8',
  muted: '#ad9f8d',
  low: '#918678',
  accent: '#c5d4e3',
  accentBorder: '#8ca2ba',
  accentGlow: '0 0 18px rgba(140,164,188,0.24)',
  dangerBg: 'rgba(45, 18, 16, 0.92)',
  dangerBorder: '1px solid rgba(140, 68, 54, 0.72)',
  dangerText: '#ffd6cf',
  radius: '8px',
  radiusPanel: '12px',
});

/** @param {HTMLElement} el @param {Record<string,string>} [extra] */
export function applyPanelChrome(el, extra) {
  Object.assign(el.style, {
    background: UX_THEME.panelBg,
    color: UX_THEME.text,
    border: UX_THEME.panelBorder,
    borderRadius: UX_THEME.radiusPanel,
    boxShadow: UX_THEME.panelShadow,
    backdropFilter: 'blur(6px)',
  });
  if (extra) Object.assign(el.style, extra);
}

/** @param {string} kind */
export function ensurePanel(kind) {
  const root = ensureRoot();
  const panel = document.createElement('div');
  panel.className = `ui-panel ui-panel-${kind}`;
  Object.assign(panel.style, {
    position: 'absolute', left: '0', top: '0', right: '0', bottom: '0',
    display: 'none', pointerEvents: 'auto',
    background: UX_THEME.panelBackdrop, color: UX_THEME.text,
    backdropFilter: 'blur(3px)',
    fontFamily: GAME_TEXT_FONT_FAMILY,
    zIndex: String(PANEL_Z_BASE),
  });

  // Tapping/clicking outside the inner content should close the overlay.
  panel.addEventListener('pointerdown', (ev) => {
    if (ev.target === panel) {
      hide(panel);
    }
  });

  const inner = document.createElement('div');
  Object.assign(inner.style, {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
    width: 'min(600px, 90vw)', maxHeight: '80vh', overflow: 'auto',
    boxSizing: 'border-box',
    padding: '14px',
  });
  applyPanelChrome(inner);
  markScrollable(inner);
  // Close button
  const close = document.createElement('button');
  close.textContent = '\u00d7';
  Object.assign(close.style, {
    position: 'absolute', right: '6px', top: '6px', width: '28px', height: '28px',
    border: UX_THEME.surfaceBorderSoft, borderRadius: '6px', background: 'transparent', color: UX_THEME.low,
    cursor: 'pointer',
    zIndex: '5',
  });
  close.addEventListener('click', () => hide(panel));
  inner.appendChild(close);
  panel.appendChild(inner);
  root.appendChild(panel);
  /** @type {any} */ (panel)._inner = inner;
  return panel;
}

/** @param {HTMLDivElement} panel */
export function show(panel) {
  const z = bumpPanelZ();
  panel.style.zIndex = String(z);
  panel.style.display = 'block';
}
/** @param {HTMLDivElement} panel */
export function hide(panel) { panel.style.display = 'none'; hideItemTooltip(); }

/** @param {string} s */
export function sanitize(s) {
  return (s ?? '').toString().replace(/[<>]/g, '');
}

/** @param {string} s */
export function bracketize(s) {
  const str = String(s ?? '');
  if (!str.length) return str;
  // Avoid double-bracketing if already bracketed
  if (str.startsWith('[') && str.endsWith(']')) return str;
  return `[${str}]`;
}

/** @param {HTMLButtonElement} btn */
export function decorateButton(btn) {
  Object.assign(btn.style, {
    padding: '6px 10px',
    background: 'linear-gradient(180deg, #2a2f35 0%, #1f2329 100%)',
    color: '#dce5ef',
    border: '1px solid #6f7d8d',
    borderRadius: UX_THEME.radius,
    cursor: 'pointer',
    boxShadow: 'inset 0 0 0 1px rgba(188,206,224,0.05)',
    transition: 'transform 120ms, border-color 120ms, box-shadow 120ms, background 120ms',
  });
}

// --- Row pulse micro-UX ----------------------------------------------------

/** Color presets for action feedback pulses. */
const PULSE_COLORS = Object.freeze({
  equip:   '#1e4f7a',
  unequip: '#3a3545',
  use:     '#1e5535',
  drop:    '#6a4a18',
  throw:   '#6a4a18',
  pin:     '#1a3a5c',
  cursed:  '#5a1860',
  default: '#1a3a5c',
});

/**
 * Flash a row element to confirm an action was taken.
 * Pure CSS transition — no timers needed.
 * @param {HTMLElement} row
 * @param {string} [actionKey] — maps to a color preset
 * @param {string} [restoreBg] — background to return to after pulse
 */
export function pulseRow(row, actionKey, restoreBg) {
  if (!row || !row.style) return;
  const color = PULSE_COLORS[actionKey] || PULSE_COLORS.default;
  const bg = restoreBg || row.style.background || '#0f1421';
  // Remove any existing transition so we start clean
  row.style.transition = 'none';
  row.style.background = color;
  // Force reflow so the "snap to color" takes before the fade
  void row.offsetWidth;
  row.style.transition = 'background 0.45s ease-out';
  row.style.background = bg;
}

// --- Shared chooser helpers ------------------------------------------------

/** Standard colors used across chooser/overlay panels. */
export const UI = Object.freeze({
  SEL_OUTLINE: `2px solid ${UX_THEME.accentBorder}`,
  SEL_BG:      UX_THEME.surfaceSelected,
  DEFAULT_BG:  UX_THEME.surfaceBg,
  BORDER:      UX_THEME.surfaceBorder,
  TEXT:        UX_THEME.text,
  RADIUS:      UX_THEME.radius,
});

/**
 * Create a standard chooser-list row element.
 * @param {Record<string,string>} [extraStyle] — overrides merged on top of defaults
 * @returns {HTMLDivElement}
 */
export function createChooserRow(extraStyle) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'flex', alignItems: 'center', gap: '8px',
    width: '100%', padding: '6px 8px',
    background: UI.DEFAULT_BG, color: UI.TEXT, border: UI.BORDER, borderRadius: UI.RADIUS,
    cursor: 'pointer',
  });
  if (extraStyle) Object.assign(row.style, extraStyle);
  return row;
}

/**
 * Build a setSel() + getter for a simple row-highlight chooser.
 * @param {HTMLDivElement[]} rows
 * @param {number} count — total item count (used for clamping)
 * @param {(index:number)=>void} [onSelect] — optional callback after highlight changes (e.g. show tooltip)
 * @returns {{ getSel:()=>number, setSel:(i:number)=>void }}
 */
export function createSimpleSel(rows, count, onSelect) {
  let sel = 0;
  function setSel(i) {
    sel = Math.max(0, Math.min(count - 1, i | 0));
    for (let j = 0; j < rows.length; j++) {
      rows[j].style.outline = (j === sel) ? UI.SEL_OUTLINE : 'none';
      rows[j].style.background = (j === sel) ? UI.SEL_BG : UI.DEFAULT_BG;
    }
    rows[sel]?.scrollIntoView?.({ block: 'nearest' });
    if (onSelect) onSelect(sel);
  }
  return { getSel() { return sel; }, setSel };
}

/**
 * Attach a keydown listener that auto-cleans up when `panel` is hidden.
 * @param {HTMLDivElement} panel
 * @param {(e:KeyboardEvent)=>void} onKey
 */
export function installKeyHandler(panel, onKey) {
  const handler = (/** @type {KeyboardEvent} */ e) => onKey(e);
  window.addEventListener('keydown', handler);
  const obs = new MutationObserver(() => {
    if (panel.style.display === 'none') {
      window.removeEventListener('keydown', handler);
      obs.disconnect();
    }
  });
  obs.observe(panel, { attributes: true, attributeFilter: ['style'] });
}

/**
 * Like installKeyHandler but returns a detach function and stores it on `panel[propName]`.
 * Used by inventory / equipment / shop which call detach on re-render.
 * @param {HTMLDivElement} panel
 * @param {string} propName — e.g. '_inventoryDetach'
 * @param {(e:KeyboardEvent)=>void} onKey
 * @returns {()=>void} detach
 */
export function installDetachableKeyHandler(panel, propName, onKey) {
  const handler = (/** @type {KeyboardEvent} */ e) => onKey(e);
  const obs = new MutationObserver(() => {
    if (panel.style.display === 'none') detach();
  });
  function detach() {
    window.removeEventListener('keydown', handler);
    obs.disconnect();
    if (/** @type {any} */ (panel)[propName] === detach) {
      /** @type {any} */ (panel)[propName] = null;
    }
  }
  window.addEventListener('keydown', handler);
  obs.observe(panel, { attributes: true, attributeFilter: ['style'] });
  /** @type {any} */ (panel)[propName] = detach;
  return detach;
}

// --- Always-on message ticker ---------------------------------------------
/** @param {HTMLElement} root */
export function ensureMessageTicker(root) {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed',
    left: '0',
    bottom: '0',
    width: '100%',
    display: 'block',
    pointerEvents: 'auto',
    zIndex: 850,
    color: UX_THEME.text,
    fontFamily: GAME_LOG_FONT_FAMILY,
    fontSize: 'min(15px, 3.4vw)',
    lineHeight: '1.35',
    background: 'rgba(10, 9, 8, 0.92)',
    borderRadius: '0',
    padding: '5px 12px',
    borderTop: UX_THEME.surfaceBorderSoft,
    boxShadow: '0 -8px 24px rgba(0,0,0,0.36), inset 0 1px 0 rgba(188,206,224,0.05)',
    overflow: 'hidden',
    cursor: 'pointer',
    userSelect: 'none',
    webkitTextSizeAdjust: 'none',
    textSizeAdjust: 'none',
    boxSizing: 'border-box',
    transition: 'max-height 180ms ease-out, background 140ms ease-out',
  });
  (/** @type {any} */ (box))._entries = [];
  (/** @type {any} */ (box))._expanded = false;
  box.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const next = !(/** @type {any} */ (box))._expanded;
    (/** @type {any} */ (box))._expanded = next;
    renderMessageTicker(box, (/** @type {any} */ (box))._entries || []);
  });
  root.appendChild(box);
  // Publish ticker height so action bar + other bottom HUD can stack above it.
  document.documentElement.style.setProperty('--jshack-ticker-height', '30px');
  return box;
}

/** @param {HTMLElement} container @param {Array<any>} entries */
export function renderMessageTicker(container, entries) {
  if (!container) return;
  const store = /** @type {any} */ (container);
  const allEntries = Array.isArray(entries) ? entries.slice() : [];
  store._entries = allEntries;
  const expanded = !!store._expanded;
  if (expanded) {
    Object.assign(container.style, {
      maxHeight: 'min(50vh, 430px)',
      gap: '5px',
      fontSize: 'min(13px, 3.1vw)',
      lineHeight: '1.45',
      padding: '8px 12px',
      background: UX_THEME.panelBg,
      borderBottom: UX_THEME.surfaceBorderSoft,
      boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(188,206,224,0.05)',
      cursor: 'pointer',
    });
  } else {
    Object.assign(container.style, {
      maxHeight: '',
      gap: '2px',
      fontSize: 'min(15px, 3.4vw)',
      lineHeight: '1.35',
      padding: '5px 12px',
      background: 'rgba(10, 9, 8, 0.92)',
      borderBottom: UX_THEME.surfaceBorderSoft,
      boxShadow: '0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(188,206,224,0.05)',
      cursor: 'pointer',
    });
  }

  container.innerHTML = '';
  if (!allEntries.length) return;

  if (expanded) {
    const list = document.createElement('div');
    Object.assign(list.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      overflowY: 'auto',
      maxHeight: 'min(42vh, 360px)',
      paddingRight: '2px',
    });

    const reversed = allEntries.slice().reverse();
    if (!reversed.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No messages yet.';
      Object.assign(empty.style, { opacity: '0.78', fontStyle: 'italic' });
      list.appendChild(empty);
    } else {
      for (let i = 0; i < reversed.length; i++) {
        const m = reversed[i];
        const row = document.createElement('div');
        applyMessageContent(row, m);
        row.style.opacity = i < 3 ? '1' : i < 8 ? '0.72' : '0.5';
        row.style.textShadow = '0 1px 0 rgba(0,0,0,0.42)';
        row.style.whiteSpace = 'normal';
        row.style.overflowWrap = 'anywhere';
        row.style.wordBreak = 'break-word';
        row.style.lineHeight = '1.45';
        list.appendChild(row);
      }
    }
    container.appendChild(list);
    list.scrollTop = 0;
    requestAnimationFrame(() => {
      const h = Math.max(0, Math.ceil(container.getBoundingClientRect().height || 0));
      document.documentElement.style.setProperty('--jshack-ticker-height', `${h}px`);
    });
    return;
  }

  // Collapsed mode: newest message on top (prominent), older messages fade below.
  const recent = allEntries.slice(-3).reverse();
  if (!recent.length) return;

  const tierStyles = [
    { opacity: 1.0, textShadow: '0 1px 0 rgba(0,0,0,0.45), 0 0 6px rgba(0,0,0,0.25)' },
    { opacity: 0.50, textShadow: '0 1px 0 rgba(0,0,0,0.38)' },
    { opacity: 0.30, textShadow: '0 1px 0 rgba(0,0,0,0.32)' },
  ];

  for (let i = 0; i < recent.length; i++) {
    const m = recent[i];
    const row = document.createElement('div');
    const tier = tierStyles[Math.min(i, tierStyles.length - 1)];
    applyMessageContent(row, m);
    row.style.textShadow = tier.textShadow;
    row.style.opacity = String(tier.opacity);
    row.style.whiteSpace = 'nowrap';
    row.style.overflow = 'hidden';
    row.style.textOverflow = 'ellipsis';
    container.appendChild(row);
  }

  // Publish ticker height so other HUD elements can offset below it.
  requestAnimationFrame(() => {
    const h = Math.max(0, Math.ceil(container.getBoundingClientRect().height || 0));
    document.documentElement.style.setProperty('--jshack-ticker-height', `${h}px`);
  });
}

/**
 * Render a single message with optional "--More--" prompt (NetHack style).
 * Called by the messageMore queue instead of renderMessageTicker when gating.
 * Caches DOM elements to avoid thrashing during rapid-fire combat messages.
 * @param {HTMLElement} container  — the ticker element
 * @param {any}         message    — current message entry
 * @param {boolean}     hasMore    — whether the queue has more messages
 */
export function renderMessageMore(container, message, hasMore) {
  if (!container) return;
  const store = /** @type {any} */ (container);
  store._expanded = false;

  // Lazily build the cached single-line DOM structure once.
  if (!store._moreRow) {
    // Inject blink keyframes once.
    if (!document.getElementById('jshack-more-blink-style')) {
      const style = document.createElement('style');
      style.id = 'jshack-more-blink-style';
      style.textContent = '@keyframes jshack-more-blink{0%,80%{opacity:1}50%,70%{opacity:0}}';
      document.head.appendChild(style);
    }

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'baseline',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      textShadow: '0 1px 0 rgba(0,0,0,0.45), 0 0 6px rgba(0,0,0,0.25)',
    });
    const msgSpan = document.createElement('span');
    Object.assign(msgSpan.style, { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis' });
    const moreSpan = document.createElement('span');
    moreSpan.textContent = '';
    Object.assign(moreSpan.style, {
      display: 'none',
    });
    row.appendChild(msgSpan);
    row.appendChild(moreSpan);
    store._moreRow = row;
    store._moreMsgSpan = msgSpan;
    store._moreMoreSpan = moreSpan;
  }

  const row = store._moreRow;
  const msgSpan = store._moreMsgSpan;
  const moreSpan = store._moreMoreSpan;

  // Swap container content to the cached row (only if not already showing it).
  if (row.parentNode !== container) {
    container.innerHTML = '';
    Object.assign(container.style, {
      maxHeight: '', gap: '2px',
      fontSize: 'min(15px, 3.4vw)', lineHeight: '1.35',
      padding: '5px 12px',
      background: 'rgba(10, 9, 8, 0.92)',
      borderTop: UX_THEME.surfaceBorderSoft,
      boxShadow: '0 -8px 24px rgba(0,0,0,0.36), inset 0 1px 0 rgba(188,206,224,0.05)',
    });
    container.appendChild(row);
  }

  // Update content — no DOM creation, just text swap.
  if (!message) {
    msgSpan.textContent = '';
    msgSpan.style.color = '';
  } else {
    applyMessageContent(msgSpan, message);
  }
  moreSpan.style.display = hasMore ? '' : 'none';
  container.style.cursor = hasMore ? 'pointer' : 'default';
}

/**
 * @param {any} message
 * @returns {string}
 */
export function formatMessageLine(message) {
  const text = String(message?.text || '');
  const repeat = Math.max(1, Number(message?.repeat || 1));
  if (repeat <= 1) return text;
  return `${text} \u00d7${repeat}`;
}

/** Apply formatted text to a row element. Supports `html` field for rich messages. */
function applyMessageContent(row, message) {
  if (typeof message === 'string') {
    row.textContent = message;
    return;
  }
  if (message && typeof message === 'object') {
    if (message.html) {
      const repeat = Math.max(1, Number(message.repeat || 1));
      row.innerHTML = repeat > 1 ? `${message.html} \u00d7${repeat}` : message.html;
    } else {
      row.textContent = formatMessageLine(message);
    }
    row.style.color = getMessageColor(String(message.type || 'default'));
    return;
  }
  row.textContent = String(message ?? '');
}

/**
 * Get color for message type
 * @param {string} type - Message type
 * @returns {string} Hex color code
 */
export function getMessageColor(type) {
  switch (type) {
    case 'combat': return '#ff6b6b';    // Red - attacks, damage, death
    case 'deity': return '#c47bff';     // Purple - deity events, prayers, miracles
    case 'ambient': return '#77dd77';   // Soft green - environmental sounds, atmosphere
    case 'system': return '#ffd966';    // Yellow - items, doors, level ups
    case 'default':
    default: return '#cfe8ff';          // Default blue-white
  }
}

// Shared style helper for rarity
/** @param {string} rarityName */
export function rarityStyle(rarityName) {
  const rn = String(rarityName || 'common').toLowerCase();
  if (rn === 'rare' || rn === 'magic') return { color: '#55aaff', fontWeight: 'bold' };
  if (rn === 'epic') return { color: '#c47bff', fontWeight: 'bold' };
  if (rn === 'legendary') return { color: '#ff9f3b', fontWeight: 'bold' };
  return { color: '#ffffff', fontWeight: 'bold' };
}

// --- Death screen with social share ----------------------------------------
/** @param {HTMLElement} root */
export function ensureDeathScreen(root) {
  const panel = document.createElement('div');
  panel.id = 'death-screen';
  Object.assign(panel.style, {
    position: 'fixed', left: '0', top: '0', right: '0', bottom: '0',
    display: 'none', pointerEvents: 'auto',
    background: 'rgba(0,0,0,0.88)',
    fontFamily: GAME_TEXT_FONT_FAMILY, zIndex: '1300',
  });
  root.appendChild(panel);
  return panel;
}

/** Helper: create a styled stat line for the death screen. */
function _deathStatLine(label, value, color) {
  const el = document.createElement('div');
  el.textContent = `${label}: ${value}`;
  if (color) el.style.color = color;
  return el;
}

/** @param {HTMLDivElement} panel @param {object} detail */
export function renderDeathScreen(panel, detail) {
  panel.innerHTML = '';

  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
    width: 'min(460px, 90vw)', textAlign: 'center',
    background: '#0b0e16', border: '1px solid #3a1c1c', borderRadius: '10px',
    padding: '28px 24px', boxShadow: '0 0 60px rgba(180,40,40,0.35)',
    color: '#cfe8ff', maxHeight: '90vh', overflowY: 'auto',
  });

  // Skull
  const skull = document.createElement('div');
  skull.textContent = '\u2620\uFE0F';
  skull.style.fontSize = '64px';
  skull.style.marginBottom = '8px';
  box.appendChild(skull);

  // Title — include player name if available
  const pName = detail?.playerName && detail.playerName !== 'Unnamed' ? detail.playerName : null;
  const title = document.createElement('div');
  title.textContent = pName ? `${pName} Has Perished` : 'You Have Perished';
  Object.assign(title.style, {
    fontSize: '22px', fontWeight: 'bold', color: '#ff6b6b',
    textShadow: '0 0 12px rgba(255,60,60,0.4)', marginBottom: '16px',
  });
  box.appendChild(title);

  // --- Primary stats ---
  const depth = detail?.depth ?? 1;
  const score = detail?.score ?? 0;
  const seed = detail?.seed ?? 0;
  const seedHex = seed ? '0x' + seed.toString(16).toUpperCase() : '???';
  const killerName = detail?.killerName;
  const cause = detail?.cause;

  const stats = document.createElement('div');
  Object.assign(stats.style, { marginBottom: '14px', lineHeight: '1.8', fontSize: '14px' });

  if (detail?.className) {
    stats.appendChild(_deathStatLine('Class', detail.className, '#90caf9'));
  }

  if (killerName) {
    stats.appendChild(_deathStatLine('Slain by', killerName, '#ff9999'));
  } else if (cause && cause !== 'unknown') {
    stats.appendChild(_deathStatLine('Cause', cause, '#ff9999'));
  }

  stats.appendChild(_deathStatLine('Depth reached', depth));
  stats.appendChild(_deathStatLine('Score', score));

  // Gold
  const gold = detail?.gold ?? 0;
  if (gold > 0) stats.appendChild(_deathStatLine('Gold', `${gold}g`, '#ffd700'));

  // Turns / days survived
  const turns = detail?.turns ?? 0;
  const days = detail?.days ?? 0;
  if (turns > 0) {
    const timeStr = days > 0 ? `${turns} (${days} day${days === 1 ? '' : 's'})` : String(turns);
    stats.appendChild(_deathStatLine('Turns survived', timeStr));
  }

  // Spells learned
  const spellCount = detail?.spellCount ?? 0;
  if (spellCount > 0) stats.appendChild(_deathStatLine('Spells learned', spellCount, '#b388ff'));

  // Equipped weapon
  if (detail?.weaponName) {
    stats.appendChild(_deathStatLine('Weapon', detail.weaponName, '#4fc3f7'));
  }

  // Deity
  if (detail?.deityName) {
    stats.appendChild(_deathStatLine('Devoted to', detail.deityName, '#ce93d8'));
  }

  // Status effects at death
  const statusList = detail?.statusList;
  if (statusList && statusList.length > 0) {
    stats.appendChild(_deathStatLine('Status', statusList.join(', '), '#ff8a65'));
  }

  box.appendChild(stats);

  // --- Traits ---
  const traitList = detail?.traitList;
  if (traitList && traitList.length > 0) {
    const traitBox = document.createElement('div');
    Object.assign(traitBox.style, {
      marginBottom: '14px', fontSize: '12px', color: '#a0c4ff',
      fontStyle: 'italic', lineHeight: '1.6',
    });
    traitBox.textContent = traitList.join(' \u00B7 ');
    box.appendChild(traitBox);
  }

  // Seed + Version
  const version = String((/** @type {any} */ (globalThis)).VERSION || '').trim();
  const metaText = version ? `Seed: ${seedHex}  |  v${version}` : `Seed: ${seedHex}`;
  const seedLine = document.createElement('div');
  seedLine.textContent = metaText;
  Object.assign(seedLine.style, { opacity: '0.5', fontSize: '12px', marginBottom: '14px' });
  box.appendChild(seedLine);

  // --- Global Highscores ---
  {
    const hsSection = document.createElement('div');
    Object.assign(hsSection.style, {
      marginBottom: '16px', borderTop: '1px solid #1e2a3e', paddingTop: '14px',
    });
    const hsHeading = document.createElement('div');
    hsHeading.textContent = 'Global Highscores';
    Object.assign(hsHeading.style, {
      fontSize: '11px', color: '#3a5070', textTransform: 'uppercase',
      letterSpacing: '0.1em', marginBottom: '8px',
    });
    hsSection.appendChild(hsHeading);
    const hsList = document.createElement('div');
    hsList.textContent = 'Loading\u2026';
    Object.assign(hsList.style, { fontSize: '12px', color: '#3a5070' });
    hsSection.appendChild(hsList);
    box.appendChild(hsSection);
    getHighscores().then(scores => {
      hsList.textContent = '';
      if (!scores || scores.length === 0) return;
      const top = scores.slice(0, 10);
      for (let i = 0; i < top.length; i++) {
        const entry = top[i];
        const isPlayer = detail?.playerName && entry.playerName === detail.playerName;
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', gap: '8px', lineHeight: '1.7',
          fontSize: '12px', fontFamily: GAME_TEXT_FONT_FAMILY,
          color: isPlayer ? '#ffd700' : '#7a9ab0',
          fontWeight: isPlayer ? 'bold' : 'normal',
        });
        const rankEl = document.createElement('span');
        rankEl.textContent = `#${i + 1}`;
        rankEl.style.cssText = 'width:2.2em;text-align:right;flex-shrink:0;color:#3a5878';
        if (isPlayer) rankEl.style.color = '#ffd700';
        const versionEl = document.createElement('span');
        versionEl.textContent = getHighscoreVersionLabel(entry);
        versionEl.style.cssText = 'width:5.4em;text-align:left;flex-shrink:0;color:#6a84a2;opacity:0.9';
        if (isPlayer) { versionEl.style.color = '#ffd700'; versionEl.style.opacity = '1'; }
        const nameEl = document.createElement('span');
        nameEl.textContent = entry.playerName || '???';
        nameEl.style.cssText = 'flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        const scoreEl = document.createElement('span');
        scoreEl.textContent = String(entry.score ?? 0);
        scoreEl.style.cssText = 'text-align:right;flex-shrink:0;color:#90c89a';
        if (isPlayer) scoreEl.style.color = '#ffd700';
        const clsEl = document.createElement('span');
        clsEl.textContent = entry.className || '';
        clsEl.style.cssText = 'width:5.5em;text-align:left;flex-shrink:0;color:#7090b0;opacity:0.8';
        if (isPlayer) { clsEl.style.color = '#ffd700'; clsEl.style.opacity = '1'; }
        row.appendChild(rankEl);
        row.appendChild(versionEl);
        row.appendChild(nameEl);
        row.appendChild(scoreEl);
        row.appendChild(clsEl);
        hsList.appendChild(row);
      }
    }).catch(() => { hsList.textContent = ''; });
  }

  // Share button
  if (detail?.shareUrl) {
    const shareBtn = document.createElement('a');
    shareBtn.href = detail.shareUrl;
    shareBtn.target = '_blank';
    shareBtn.rel = 'noopener';
    shareBtn.textContent = '\u2620\uFE0F Share Your Death';
    Object.assign(shareBtn.style, {
      display: 'inline-block', padding: '10px 22px',
      background: '#1a1a2e', color: '#cfe8ff', fontFamily: GAME_TEXT_FONT_FAMILY,
      border: '1px solid #2d3b52', borderRadius: '6px',
      cursor: 'pointer', textDecoration: 'none', fontSize: '14px',
      marginBottom: '12px',
      transition: 'background 120ms',
    });
    shareBtn.addEventListener('mouseenter', () => { shareBtn.style.background = '#242448'; });
    shareBtn.addEventListener('mouseleave', () => { shareBtn.style.background = '#1a1a2e'; });
    box.appendChild(shareBtn);
    box.appendChild(document.createElement('br'));
  }

  // Copy Score Proof button
  if (detail?.proofBundle) {
    const proofBtn = document.createElement('button');
    proofBtn.textContent = '\uD83D\uDD12 Copy Score Proof';
    Object.assign(proofBtn.style, {
      display: 'inline-block', padding: '10px 22px',
      background: '#1a1a2e', color: '#cfe8ff', fontFamily: GAME_TEXT_FONT_FAMILY,
      border: '1px solid #2d3b52', borderRadius: '6px',
      cursor: 'pointer', fontSize: '14px',
      marginBottom: '12px',
      transition: 'background 120ms',
    });
    proofBtn.addEventListener('mouseenter', () => { proofBtn.style.background = '#242448'; });
    proofBtn.addEventListener('mouseleave', () => { proofBtn.style.background = '#1a1a2e'; });
    proofBtn.addEventListener('click', () => {
      const json = JSON.stringify(detail.proofBundle, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json)
          .then(() => { proofBtn.textContent = '\u2705 Copied!'; })
          .catch(() => { proofBtn.textContent = '\u274C Copy failed'; });
      } else {
        proofBtn.textContent = '\u274C Clipboard unavailable';
      }
    });
    box.appendChild(proofBtn);
    box.appendChild(document.createElement('br'));
  }

  // New Game button
  {
    const newGameBtn = document.createElement('a');
    newGameBtn.href = location.origin + location.pathname;
    newGameBtn.textContent = '\u2694 New Game';
    Object.assign(newGameBtn.style, {
      display: 'inline-block', padding: '10px 22px',
      background: '#1a2e1a', color: '#b4ffb4', fontFamily: GAME_TEXT_FONT_FAMILY,
      border: '1px solid #2d523b', borderRadius: '6px',
      cursor: 'pointer', textDecoration: 'none', fontSize: '14px',
      marginBottom: '12px',
      transition: 'background 120ms',
    });
    newGameBtn.addEventListener('mouseenter', () => { newGameBtn.style.background = '#244824'; });
    newGameBtn.addEventListener('mouseleave', () => { newGameBtn.style.background = '#1a2e1a'; });
    box.appendChild(newGameBtn);
    box.appendChild(document.createElement('br'));
  }

  // JS-Hack link
  const jshackLink = document.createElement('a');
  jshackLink.href = 'https://pjensen.github.io/JSHack/';
  jshackLink.target = '_blank';
  jshackLink.rel = 'noopener';
  jshackLink.textContent = 'Play JS-Hack';
  Object.assign(jshackLink.style, {
    display: 'inline-block', fontSize: '12px', color: '#7aacdf',
    textDecoration: 'none', marginBottom: '10px', opacity: '0.8',
  });
  jshackLink.addEventListener('mouseenter', () => { jshackLink.style.opacity = '1'; });
  jshackLink.addEventListener('mouseleave', () => { jshackLink.style.opacity = '0.8'; });
  box.appendChild(jshackLink);
  box.appendChild(document.createElement('br'));

  // Dismiss hint
  const hint = document.createElement('div');
  hint.textContent = 'Press any key to continue';
  Object.assign(hint.style, { opacity: '0.5', fontSize: '12px', marginTop: '10px' });
  box.appendChild(hint);

  panel.appendChild(box);

  // Dismiss on key or tap (after a short delay to avoid accidental dismiss)
  const dismiss = () => {
    panel.style.display = 'none';
    window.removeEventListener('keydown', onKey);
    panel.removeEventListener('pointerdown', onTap);
  };
  const onKey = () => dismiss();
  const onTap = (/** @type {PointerEvent} */ ev) => {
    if (ev.target === panel) dismiss();
  };
  setTimeout(() => {
    window.addEventListener('keydown', onKey, { once: true });
    panel.addEventListener('pointerdown', onTap);
  }, 600);
}

/**
 * Render a structured WoW-style item detail panel into the given container.
 * NOTE: This is also exported from overlay.js as the public API.
 * @param {HTMLElement} container
 * @param {any} it  item data from inventoryDataProvider
 */
export function renderItemDetails(container, it) {
  container.innerHTML = '';
  if (!it) {
    container.textContent = '(no description)';
    return;
  }

  // --- Item name + slot on one line: [Oak Staff] weapon ---
  const title = document.createElement('div');
  Object.assign(title.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '4px',
  });
  const glyphText = String(it.glyph || '').trim();
  if (glyphText) {
    const glyphSpan = document.createElement('span');
    glyphSpan.textContent = glyphText;
    Object.assign(glyphSpan.style, {
      color: String(it.glyphColor || '#cfe8ff'),
      fontSize: '14px',
      lineHeight: '1',
    });
    title.appendChild(glyphSpan);
  }
  const nameSpan = document.createElement('span');
  nameSpan.textContent = bracketize(sanitize(it.name || 'item'));
  Object.assign(nameSpan.style, rarityStyle(it.rarityName));
  title.appendChild(nameSpan);
  const rn = String(it?.rarityName || 'common').toLowerCase();
  if (rn !== 'common') {
    const raritySpan = document.createElement('span');
    raritySpan.textContent = ` ${rn}`;
    Object.assign(raritySpan.style, { opacity: '0.75', fontSize: '11px' });
    title.appendChild(raritySpan);
  }
  if (it.slot) {
    const slotSpan = document.createElement('span');
    const slotLabel = humanize(it.slot);
    slotSpan.textContent = ' ' + slotLabel.charAt(0).toUpperCase() + slotLabel.slice(1);
    slotSpan.style.opacity = '0.6';
    slotSpan.style.fontSize = '12px';
    title.appendChild(slotSpan);
  }
  container.appendChild(title);

  // --- Item weight ---
  const itemWeight = Number(it.weight || 0);
  if (itemWeight > 0) {
    const wLine = document.createElement('div');
    const count = Math.max(1, Number(it.count ?? 1) | 0);
    wLine.textContent = count > 1
      ? `Weight: ${itemWeight} kg \u00d7${count} = ${(itemWeight * count).toFixed(1)} kg`
      : `Weight: ${itemWeight} kg`;
    Object.assign(wLine.style, { color: '#8899aa', fontSize: '12px', marginBottom: '2px' });
    container.appendChild(wLine);
  }

  // --- Item description (consumables, tools, and any content-DSL item) ---
  const isConsumable = it.type === 'potion' || it.type === 'scroll' || it.type === 'food' || it.type === 'wand' || it.type === 'learn' || it.type === 'book' || it.type === 'effect';
  const hasContentStatus = Array.isArray(it.contentStatus) && it.contentStatus.length > 0;
  const consumableDesc = (isConsumable || it.type === 'tool' || hasContentStatus) ? String(it.description || '').trim() : '';
  if (consumableDesc) {
    const effectLine = document.createElement('div');
    effectLine.textContent = consumableDesc;
    effectLine.style.color = '#c8e0ff';
    effectLine.style.fontSize = '13px';
    effectLine.style.marginBottom = '2px';
    container.appendChild(effectLine);
  }

  // --- Spell details (cost/range/requirements + target effects) ---
  const detailLines = Array.isArray(it.detailLines)
    ? it.detailLines.map((line) => String(line || '').trim()).filter(Boolean)
    : [];
  const targetEffects = Array.isArray(it.targetEffects)
    ? it.targetEffects.map((line) => String(line || '').trim()).filter(Boolean)
    : [];
  const hasSpellDetails = it.type === 'spell' || detailLines.length > 0 || targetEffects.length > 0 || !!it.spellId;
  if (hasSpellDetails) {
    if (detailLines.length) {
      const detailRow = document.createElement('div');
      detailRow.textContent = detailLines.join(' \u00b7 ');
      detailRow.style.color = '#c8e0ff';
      detailRow.style.fontSize = '13px';
      detailRow.style.marginBottom = '2px';
      container.appendChild(detailRow);
    }

    if (targetEffects.length) {
      const effectsTitle = document.createElement('div');
      effectsTitle.textContent = 'Target Effects';
      effectsTitle.style.color = '#9fd6ff';
      effectsTitle.style.fontSize = '11px';
      effectsTitle.style.textTransform = 'uppercase';
      effectsTitle.style.letterSpacing = '0.06em';
      effectsTitle.style.opacity = '0.85';
      effectsTitle.style.marginTop = '2px';
      container.appendChild(effectsTitle);
    }
    for (const effect of targetEffects) {
      const line = document.createElement('div');
      line.textContent = `\u2022 ${effect}`;
      line.style.color = '#9fd6ff';
      line.style.fontSize = '12px';
      container.appendChild(line);
    }
  }

  // --- Content-DSL status lines (authored dynamic state) ---
  if (Array.isArray(it.contentStatus) && it.contentStatus.length > 0) {
    for (const line of it.contentStatus) {
      if (!line) continue;
      const el = document.createElement('div');
      if (typeof line === 'string') {
        el.textContent = line;
        el.style.color = '#d4c8a0';
      } else if (typeof line === 'object') {
        el.textContent = String(line.text || line.label || '');
        el.style.color = String(line.color || '#d4c8a0');
      }
      el.style.fontSize = '12px';
      el.style.marginBottom = '1px';
      container.appendChild(el);
    }
  }

  // --- Weapon stats (damage dice, stamina cost, two-handed) ---
  const isWeapon = it.slot === 'weapon' || it.slot === 'ranged';
  if (isWeapon && (it.damageDice || it.staminaCost != null)) {
    if (it.damageDice) {
      const line = document.createElement('div');
      line.textContent = `Damage: ${String(it.damageDice)}`;
      line.style.color = '#ffd7a0';
      container.appendChild(line);
    }
    if (it.staminaCost != null) {
      const line = document.createElement('div');
      line.textContent = `Stamina: ${it.staminaCost}`;
      line.style.color = '#ffd7a0';
      container.appendChild(line);
    }
    if (it.twoHanded) {
      const line = document.createElement('div');
      line.textContent = 'Two-Handed';
      line.style.color = '#ffd7a0';
      line.style.fontStyle = 'italic';
      container.appendChild(line);
    }
  }

  // --- Coating (poison, etc.) ---
  const coat = it.coating;
  if (coat && coat.kind) {
    const line = document.createElement('div');
    line.style.display = 'flex'; line.style.alignItems = 'center'; line.style.gap = '6px';
    line.style.marginTop = '2px';
    const dot = document.createElement('span');
    const coatColor = coat.color || '#66dd66';
    dot.textContent = '\u2022';
    dot.style.color = coatColor;
    line.appendChild(dot);
    const label = document.createElement('span');
    const charges = Number(coat.charges || 0);
    label.textContent = `${humanize(coat.kind)} coated` + (charges > 0 ? ` (${charges} charges)` : '');
    label.style.color = coatColor;
    label.style.fontWeight = 'bold';
    line.appendChild(label);
    container.appendChild(line);
  }

  // --- Bonuses ---
  const bonuses = it.bonuses && typeof it.bonuses === 'object' ? it.bonuses : {};
  const bonusKeys = Object.keys(bonuses).filter(k => {
    const v = Number(bonuses[k]);
    return Number.isFinite(v) && v !== 0;
  });

  if (bonusKeys.length) {
    for (const k of bonusKeys) {
      const v = Number(bonuses[k]);
      const sign = v > 0 ? '+' : '';
      const line = document.createElement('div');
      line.textContent = `${sign}${v} ${humanize(k)}`;
      line.style.color = '#aaffaa';
      container.appendChild(line);
    }
  }

  // --- Item mechanics (triggered/conditional behavior) ---
  const mechanics = Array.isArray(it.mechanics) ? it.mechanics : [];
  if (mechanics.length) {
    const mechanicBlock = document.createElement('div');
    mechanicBlock.style.marginTop = '4px';
    for (const mechanic of mechanics) {
      const context = String(mechanic?.context || '').trim();
      const text = String(mechanic?.text || '').trim();
      if (!context || !text) continue;

      const line = document.createElement('div');
      line.style.color = '#b8e6b8';
      line.style.fontSize = '12px';
      line.style.marginBottom = '2px';

      const contextSpan = document.createElement('span');
      contextSpan.textContent = `${context}: `;
      contextSpan.style.fontWeight = 'bold';
      contextSpan.style.color = '#d9ffd9';
      line.appendChild(contextSpan);

      const textSpan = document.createElement('span');
      textSpan.textContent = text;
      line.appendChild(textSpan);
      mechanicBlock.appendChild(line);
    }
    if (mechanicBlock.childNodes.length) container.appendChild(mechanicBlock);
  }

  // --- Affixes (name + description) ---
  const affixes = Array.isArray(it.affixes) ? it.affixes : [];
  if (affixes.length) {
    for (const a of affixes) {
      const affixName = typeof a === 'object' ? a.name : humanize(String(a));
      const affixDesc = typeof a === 'object' ? a.description : '';

      const line = document.createElement('div');
      const affixNameSpan = document.createElement('span');
      affixNameSpan.textContent = affixName;
      affixNameSpan.style.color = '#a8d8ff';
      affixNameSpan.style.fontWeight = 'bold';
      line.appendChild(affixNameSpan);

      if (affixDesc) {
        const descSpan = document.createElement('span');
        descSpan.textContent = ` \u2014 ${affixDesc}`;
        descSpan.style.color = '#8ab8d8';
        descSpan.style.fontStyle = 'italic';
        line.appendChild(descSpan);
      }
      container.appendChild(line);
    }
  }

  // --- Proc nodes (trigger/effect summaries from item topology) ---
  const procNodes = Array.isArray(it.procNodes) ? it.procNodes : [];
  if (procNodes.length) {
    const title = document.createElement('div');
    title.textContent = 'Proc Nodes';
    title.style.color = '#9fd6ff';
    title.style.fontSize = '11px';
    title.style.textTransform = 'uppercase';
    title.style.letterSpacing = '0.06em';
    title.style.opacity = '0.9';
    title.style.marginTop = '6px';
    container.appendChild(title);

    for (const node of procNodes) {
      const src = document.createElement('div');
      src.textContent = String(node?.source || 'Item');
      src.style.color = '#7fb3df';
      src.style.fontSize = '12px';
      src.style.marginTop = '2px';
      container.appendChild(src);

      const trigger = document.createElement('div');
      const qualifiers = Array.isArray(node?.qualifiers)
        ? node.qualifiers.map((q) => String(q || '').trim()).filter(Boolean)
        : [];
      trigger.textContent = qualifiers.length
        ? `${String(node?.trigger || 'On Trigger')} \u00b7 ${qualifiers.join(' \u00b7 ')}`
        : String(node?.trigger || 'On Trigger');
      trigger.style.color = '#d7e9ff';
      trigger.style.fontSize = '12px';
      container.appendChild(trigger);

      const effects = Array.isArray(node?.effects) ? node.effects : [];
      for (const effect of effects) {
        const line = document.createElement('div');
        line.textContent = `\u2022 ${String(effect || '').trim()}`;
        line.style.color = '#b6d6f2';
        line.style.fontSize = '12px';
        container.appendChild(line);
      }
    }
  }

  // --- Socket circles ---
  const maxSockets = Number(it.maxSockets || 0) | 0;
  if (maxSockets > 0) {
    const sockets = Array.isArray(it.sockets) ? it.sockets : [];
    const sockRow = document.createElement('div');
    sockRow.style.marginTop = '4px';
    sockRow.style.letterSpacing = '2px';
    sockRow.style.fontSize = '14px';
    let circles = '';
    for (let s = 0; s < maxSockets; s++) {
      circles += s < sockets.length ? '\u25C8' : '\u25CB'; // filled, empty
    }
    sockRow.textContent = `Sockets: ${circles}`;
    sockRow.style.color = '#c8a860';
    container.appendChild(sockRow);
  }

  // --- Comparison deltas vs equipped item ---
  const cmp = it.equippedComparison;
  if (cmp) {
    const sep = document.createElement('div');
    sep.textContent = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'; sep.style.opacity = '0.4'; sep.style.margin = '4px 0';
    container.appendChild(sep);

    const cmpTitle = document.createElement('div');
    cmpTitle.textContent = `vs ${sanitize(cmp.name || 'equipped')}`;
    cmpTitle.style.opacity = '0.7';
    cmpTitle.style.fontSize = '11px';
    cmpTitle.style.marginBottom = '2px';
    container.appendChild(cmpTitle);

    const cmpBonuses = cmp.bonuses && typeof cmp.bonuses === 'object' ? cmp.bonuses : {};
    const allKeys = new Set([...Object.keys(bonuses), ...Object.keys(cmpBonuses)]);

    for (const k of allKeys) {
      const mine = Number(bonuses[k]) || 0;
      const theirs = Number(cmpBonuses[k]) || 0;
      const delta = mine - theirs;
      if (delta === 0) continue;

      const line = document.createElement('div');
      const sign = delta > 0 ? '+' : '';
      line.textContent = `${sign}${delta} ${humanize(k)}`;
      line.style.color = delta > 0 ? '#55ff55' : '#ff5555';
      line.style.fontWeight = 'bold';
      container.appendChild(line);
    }

    if ((it.damageDice || cmp.damageDice) && it.damageDice !== cmp.damageDice) {
      const line = document.createElement('div');
      line.textContent = `Damage: ${it.damageDice || 'none'} vs ${cmp.damageDice || 'none'}`;
      line.style.color = '#cccccc';
      line.style.fontSize = '11px';
      container.appendChild(line);
    }

    if (it.staminaCost != null && cmp.staminaCost != null && it.staminaCost !== cmp.staminaCost) {
      const delta = it.staminaCost - cmp.staminaCost;
      const line = document.createElement('div');
      const sign = delta > 0 ? '+' : '';
      line.textContent = `${sign}${delta} stamina cost`;
      line.style.color = delta < 0 ? '#55ff55' : '#ff5555';
      line.style.fontWeight = 'bold';
      container.appendChild(line);
    }
  }

  // --- Flavor text at bottom (skip for consumables already shown above) ---
  const desc = String(it.description || '').trim();
  if (desc && !consumableDesc) {
    const flavor = document.createElement('div');
    flavor.textContent = desc;
    flavor.style.fontStyle = 'italic';
    flavor.style.opacity = '0.7';
    flavor.style.fontSize = '12px';
    flavor.style.marginTop = '3px';
    container.appendChild(flavor);
  }
}
