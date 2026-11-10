import { renderItemDetails } from './overlay.js';
import { applyAtlasIcon, ITEM_ICON_ATLAS } from './atlasIcons.js';
import {
  getQuickPinKey, buildStartingPinnedQuickItems, upsertPinnedQuickItemLifo,
  reconcilePinnedQuickItemsWithInventory, applyPinnedQuickItemUse,
  arePinnedArraysEqual, normalizePositiveCount, ensureRoot,
} from './hud.js';

export function createPinnedItemSlots() {
  const SLOT_COUNT = 4;
  const HOLD_TOOLTIP_MS = 450;
  const el = document.createElement('div');
  el.id = 'hud-pinned-items';
  Object.assign(el.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 44px)',
    gridTemplateRows: 'repeat(2, 44px)',
    gap: '4px',
    alignItems: 'center',
  });

  /** @type {Array<{id:number,pinKey?:string,identity?:string,type?:string,slot?:string,name:string,count:number,rarityName?:string,glyph?:string,glyphColor?:string,hasScrollOfIdentify?:boolean,details?:any}>} */
  let pinned = [];
  /** @type {Array<any>} */
  let inventoryItems = [];
  let didSeedStarterPins = false;
  /** @type {((item:any) => void) | null} */
  let presenter = null;
  /** @type {HTMLButtonElement[]} */
  const buttons = [];
  /** @type {Array<{svg: SVGSVGElement, path: SVGPathElement, pathLength: number}>} */
  const holdRings = [];
  /** @type {Array<{timer:number, raf:number, startedAt:number, pointerId:number, lastX:number, longPress:boolean, suppressClickUntil:number}>} */
  const holdStates = [];
  const SLIDE_STEP_PX = 28;
  /** @type {{active:boolean, index:number, anchorSlot:number}} */
  const browseState = { active: false, index: -1, anchorSlot: -1 };

  let tooltipEl = null;
  /** @type {HTMLElement | null} */
  let tooltipAnchor = null;

  function ensurePinnedTooltip() {
    if (tooltipEl) return tooltipEl;
    const root = ensureRoot();
    const tip = document.createElement('div');
    tip.id = 'quick-slot-item-tooltip';
    Object.assign(tip.style, {
      position: 'fixed',
      display: 'none',
      maxWidth: 'min(92vw, 360px)',
      pointerEvents: 'none',
      background: 'rgba(14,18,26,0.96)',
      color: '#dbeaff',
      borderRadius: '10px',
      border: '1px solid #33435f',
      boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
      fontFamily: 'monospace',
      padding: '10px 12px',
      zIndex: '1402',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
      fontSize: '13px',
    });
    root.appendChild(tip);
    tooltipEl = tip;
    return tip;
  }

  function emitPinnedQuickItems() {
    const pinKeys = pinned.map((entry) => getQuickPinKey(entry)).filter(Boolean);
    window.dispatchEvent(new CustomEvent('ui:pinnedQuickItems', {
      detail: {
        pinKeys,
        pinned: pinned.slice(),
      },
    }));
  }

  function hidePinnedTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none';
    tooltipAnchor = null;
  }

  /**
   * @param {HTMLElement} anchor
   */
  function positionPinnedTooltip(anchor) {
    if (!tooltipEl || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const tw = tooltipEl.offsetWidth;
    const th = tooltipEl.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8;
    const GAP = 10;

    let x = rect.left + (rect.width / 2) - (tw / 2);
    let y = rect.top - th - GAP;
    if (y < MARGIN) y = rect.bottom + GAP;
    if (y + th > vh - MARGIN) y = Math.max(MARGIN, vh - th - MARGIN);
    x = Math.max(MARGIN, Math.min(vw - tw - MARGIN, x));

    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
  }

  /**
   * @param {any} item
   * @param {HTMLElement} anchor
   */
  function showPinnedTooltip(item, anchor) {
    if (!item || !anchor) return;
    const tip = ensurePinnedTooltip();
    // The pinned item IS the canonical inventory data after reconciliation.
    // Pass it directly — no cherry-picking, no separate data shape.
    renderItemDetails(tip, item);
    tip.style.display = 'block';
    tooltipAnchor = anchor;
    positionPinnedTooltip(anchor);
  }

  /**
   * @param {any} item
   */
  function normalizeTooltipItem(item) {
    if (!item || typeof item !== 'object') return null;
    const id = Number(item?.id || 0) | 0;
    return {
      ...item,
      id,
      identity: String(item?.identity || item?.details?.identity || ''),
      name: String(item?.name || item?.details?.name || 'item'),
      type: String(item?.type || item?.details?.type || ''),
      slot: String(item?.slot || item?.details?.slot || ''),
      count: normalizePositiveCount(item?.count),
      rarityName: String(item?.rarityName || item?.details?.rarityName || 'common'),
      glyph: String(item?.glyph || item?.details?.glyph || ''),
      glyphColor: String(item?.glyphColor || item?.details?.glyphColor || ''),
      details: item?.details || item,
    };
  }

  function tooltipBrowsePool() {
    const pool = [];
    for (const raw of inventoryItems) {
      const normalized = normalizeTooltipItem(raw);
      if (!normalized) continue;
      if (!(Number(normalized.count || 0) > 0)) continue;
      pool.push(normalized);
    }
    return pool;
  }

  /**
   * @param {Array<any>} pool
   * @param {any} item
   * @returns {number}
   */
  function findTooltipItemIndex(pool, item) {
    if (!Array.isArray(pool) || pool.length <= 0) return -1;
    const id = Number(item?.id || 0) | 0;
    if (id > 0) {
      const byId = pool.findIndex((entry) => Number(entry?.id || 0) === id);
      if (byId >= 0) return byId;
    }
    const identity = String(item?.identity || item?.details?.identity || '');
    if (identity) {
      const byIdentity = pool.findIndex((entry) => String(entry?.identity || '') === identity);
      if (byIdentity >= 0) return byIdentity;
    }
    return 0;
  }

  /**
   * @param {number} dir
   */
  function browseTooltip(dir = 1) {
    if (!browseState.active) return;
    if (!(browseState.anchorSlot >= 0 && browseState.anchorSlot < buttons.length)) return;
    const anchorBtn = buttons[browseState.anchorSlot];
    if (!anchorBtn) return;
    const pool = tooltipBrowsePool();
    if (!pool.length) return;
    if (!(browseState.index >= 0 && browseState.index < pool.length)) {
      browseState.index = 0;
    } else {
      const step = dir >= 0 ? 1 : -1;
      browseState.index = (browseState.index + step + pool.length) % pool.length;
    }
    showPinnedTooltip(pool[browseState.index], anchorBtn);
  }

  /**
   * @param {number} slotIndex
   */
  function commitBrowsedTooltipToSlot(slotIndex) {
    if (!(slotIndex >= 0 && slotIndex < SLOT_COUNT)) return;
    const pool = tooltipBrowsePool();
    if (!pool.length) return;
    const idx = Math.max(0, Math.min(pool.length - 1, Number(browseState.index || 0)));
    const selected = normalizeTooltipItem(pool[idx]);
    if (!selected) return;
    const pinKey = getQuickPinKey(selected);
    if (!pinKey) return;
    pinned[slotIndex] = { ...selected, pinKey };
    render();
    emitPinnedQuickItems();
  }

  function resetHoldRing(index) {
    const ring = holdRings[index];
    if (!ring) return;
    ring.svg.style.opacity = '0';
    ring.path.style.strokeDashoffset = String(ring.pathLength);
  }

  /**
   * @param {number} index
   * @param {number} progress
   */
  function setHoldRingProgress(index, progress) {
    const ring = holdRings[index];
    if (!ring) return;
    const p = Math.max(0, Math.min(1, Number(progress || 0)));
    ring.svg.style.opacity = p > 0 ? '1' : '0';
    ring.path.style.strokeDashoffset = String(ring.pathLength * (1 - p));
  }

  function buildHoldRing() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    Object.assign(svg.style, {
      position: 'absolute',
      left: '-2px',
      top: '-2px',
      width: '48px',
      height: '48px',
      pointerEvents: 'none',
      zIndex: '4',
      opacity: '0',
      transition: 'opacity 120ms ease',
      filter: 'drop-shadow(0 0 2px rgba(95,179,255,0.35))',
    });
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M 9 2 H 39 A 7 7 0 0 1 46 9 V 39 A 7 7 0 0 1 39 46 H 9 A 7 7 0 0 1 2 39 V 9 A 7 7 0 0 1 9 2 Z');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#5fb3ff');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    const pathLength = path.getTotalLength();
    path.style.strokeDasharray = String(pathLength);
    path.style.strokeDashoffset = String(pathLength);
    svg.appendChild(path);
    return { svg, path, pathLength };
  }

  /**
   * @param {number} index
   */
  function cancelHold(index) {
    const state = holdStates[index];
    if (!state) return;
    if (state.timer) { clearTimeout(state.timer); state.timer = 0; }
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
    state.startedAt = 0;
    state.pointerId = -1;
    state.lastX = 0;
    const wasLongPress = state.longPress;
    state.longPress = false;
    resetHoldRing(index);
    if (!wasLongPress) hidePinnedTooltip();
  }

  /**
   * @param {number} index
   */
  function startHold(index) {
    const state = holdStates[index];
    if (!state) return;
    const startAt = state.startedAt;
    const tick = () => {
      const elapsed = Math.max(0, performance.now() - startAt);
      setHoldRingProgress(index, elapsed / HOLD_TOOLTIP_MS);
      if (holdStates[index]?.timer) {
        state.raf = requestAnimationFrame(tick);
      }
    };
    state.raf = requestAnimationFrame(tick);
  }

  function render() {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const btn = buttons[i];
      const ring = holdRings[i];
      const item = pinned[i] || null;
      btn.textContent = '';
      if (!item) {
        cancelHold(i);
        btn.title = `Quick item slot ${i + 1} (empty)`;
        btn.setAttribute('aria-label', btn.title);
        btn.style.opacity = '0.35';
        btn.style.borderColor = '#2d3b52';
        btn.style.background = '#101626';
        btn.disabled = true;
        const key = document.createElement('span');
        key.textContent = String(i + 1);
        Object.assign(key.style, {
          fontSize: '11px',
          opacity: '0.55',
          fontFamily: 'monospace',
          pointerEvents: 'none',
        });
        btn.appendChild(key);
        if (ring) btn.appendChild(ring.svg);
        continue;
      }
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.borderColor = '#4c647f';
      btn.style.background = '#101b2a';
      btn.title = `${item.name || 'Item'} x${normalizePositiveCount(item.count)}`;
      btn.setAttribute('aria-label', btn.title);
      const icon = document.createElement('span');
      const iconId = String(item.iconId || item.identity || item.details?.identity || '');
      applyAtlasIcon(icon, ITEM_ICON_ATLAS, iconId, item.glyph || '⬢', 28);
      Object.assign(icon.style, {
        lineHeight: '1',
        fontSize: '20px',
        color: item.glyphColor || '#cfe8ff',
        pointerEvents: 'none',
      });
      btn.appendChild(icon);
      const countBadge = document.createElement('span');
      countBadge.textContent = String(normalizePositiveCount(item.count));
      Object.assign(countBadge.style, {
        position: 'absolute',
        right: '3px',
        bottom: '2px',
        fontSize: '10px',
        lineHeight: '1',
        minWidth: '10px',
        textAlign: 'right',
        color: '#cfe8ff',
        background: 'rgba(16,22,38,0.8)',
        borderRadius: '3px',
        padding: '1px 2px',
        pointerEvents: 'none',
      });
      btn.appendChild(countBadge);

      // Content-DSL charge badge: show first numeric status line as a
      // compact overlay on the quick slot (e.g. "3/8" for charges)
      const statusLines = Array.isArray(item.contentStatus) ? item.contentStatus : [];
      if (statusLines.length > 0) {
        const first = statusLines[0];
        // Extract "N/M" from status text like "Charges: ◈◈◈◇◇ 3/8"
        const ratioMatch = typeof first?.text === 'string'
          ? first.text.match(/(\d+)\/(\d+)\s*$/)
          : null;
        if (ratioMatch) {
          const chargeBadge = document.createElement('span');
          chargeBadge.textContent = `${ratioMatch[1]}/${ratioMatch[2]}`;
          Object.assign(chargeBadge.style, {
            position: 'absolute',
            left: '2px',
            bottom: '2px',
            fontSize: '9px',
            lineHeight: '1',
            color: String(first.color || '#d4c8a0'),
            background: 'rgba(16,22,38,0.85)',
            borderRadius: '3px',
            padding: '1px 3px',
            pointerEvents: 'none',
            fontWeight: 'bold',
          });
          btn.appendChild(chargeBadge);
        }
      }

      if (ring) btn.appendChild(ring.svg);
    }
    if (tooltipEl && tooltipEl.style.display === 'block' && tooltipAnchor) {
      positionPinnedTooltip(tooltipAnchor);
    }
  }

  /**
   * Add or refresh a pinned quick-use item, evicting the oldest entry when full.
   * @param {{id:number,name?:string,count?:number,glyph?:string,glyphColor?:string}} item
   */
  function pinItem(item) {
    pinned = upsertPinnedQuickItemLifo(pinned, item, SLOT_COUNT);
    render();
    emitPinnedQuickItems();
  }

  function removeByPinKeyOrId(pinKeyOrId) {
    const key = String(pinKeyOrId || '');
    const id = Number(pinKeyOrId || 0) | 0;
    if (!key && !(id > 0)) return;
    const before = pinned.length;
    pinned = pinned.filter((entry) => {
      const entryKey = getQuickPinKey(entry);
      if (entryKey && key && entryKey === key) return false;
      return Number(entry?.id || 0) !== id;
    });
    if (pinned.length !== before) {
      render();
      emitPinnedQuickItems();
    }
  }

  for (let i = 0; i < SLOT_COUNT; i++) {
    const btn = document.createElement('button');
    const ring = buildHoldRing();
    holdRings.push(ring);
    holdStates.push({
      timer: 0,
      raf: 0,
      startedAt: 0,
      pointerId: -1,
      lastX: 0,
      longPress: false,
      suppressClickUntil: 0,
    });
    btn.dataset.quickItemSlot = String(i);
    Object.assign(btn.style, {
      position: 'relative',
      minHeight: '44px',
      minWidth: '44px',
      width: '44px',
      padding: '8px 4px',
      borderRadius: '6px',
      border: '1px solid #2d3b52',
      background: '#101626',
      color: '#cfe8ff',
      cursor: 'pointer',
      fontSize: '22px',
      lineHeight: '1',
      display: 'grid',
      placeItems: 'center',
      touchAction: 'manipulation',
    });
    btn.addEventListener('pointerdown', (e) => {
      if ((e.pointerType === 'mouse' && e.button !== 0) || btn.disabled) return;
      const item = pinned[i];
      if (!item) return;
      const state = holdStates[i];
      cancelHold(i);
      hidePinnedTooltip();
      state.pointerId = Number(e.pointerId);
      state.startedAt = performance.now();
      state.lastX = Number(e.clientX || 0);
      state.longPress = false;
      browseState.active = false;
      browseState.anchorSlot = i;
      browseState.index = -1;
      try { btn.setPointerCapture(e.pointerId); } catch {}
      state.timer = setTimeout(() => {
        state.timer = 0;
        state.longPress = true;
        state.suppressClickUntil = performance.now() + 650;
        btn.style.borderColor = '#5fb3ff';
        btn.style.background = '#122138';
        browseState.active = true;
        browseState.anchorSlot = i;
        const pool = tooltipBrowsePool();
        const idx = findTooltipItemIndex(pool, item);
        browseState.index = idx;
        if (idx >= 0 && pool[idx]) {
          showPinnedTooltip(pool[idx], btn);
        } else {
          showPinnedTooltip(item, btn);
        }
      }, HOLD_TOOLTIP_MS);
      startHold(i);
    });
    btn.addEventListener('pointermove', (e) => {
      const state = holdStates[i];
      if (!state.longPress) return;
      if (state.pointerId !== -1 && Number(e.pointerId) !== state.pointerId) return;
      const x = Number(e.clientX || 0);
      const dx = x - state.lastX;
      if (Math.abs(dx) < SLIDE_STEP_PX) return;
      state.lastX = x;
      browseTooltip(dx > 0 ? 1 : -1);
      e.preventDefault();
    });
    btn.addEventListener('pointerup', (e) => {
      const state = holdStates[i];
      if (state.pointerId !== -1 && Number(e.pointerId) !== state.pointerId) return;
      const wasLongPress = !!state.longPress;
      cancelHold(i);
      try { btn.releasePointerCapture(e.pointerId); } catch {}
      if (wasLongPress) {
        commitBrowsedTooltipToSlot(i);
      }
      browseState.active = false;
      browseState.anchorSlot = -1;
      browseState.index = -1;
      hidePinnedTooltip();
      btn.style.borderColor = '#4c647f';
      btn.style.background = '#101b2a';
      if (wasLongPress) {
        e.preventDefault();
      }
    });
    btn.addEventListener('pointercancel', () => {
      cancelHold(i);
      browseState.active = false;
      browseState.anchorSlot = -1;
      browseState.index = -1;
      btn.style.borderColor = '#4c647f';
      btn.style.background = '#101b2a';
    });
    btn.addEventListener('pointerleave', () => {
      const state = holdStates[i];
      if (state.pointerId === -1) return;
      cancelHold(i);
      browseState.active = false;
      browseState.anchorSlot = -1;
      browseState.index = -1;
      btn.style.borderColor = '#4c647f';
      btn.style.background = '#101b2a';
    });
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
    btn.addEventListener('click', (e) => {
      const state = holdStates[i];
      if (performance.now() < state.suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const item = pinned[i];
      if (!item || !presenter) return;
      hidePinnedTooltip();
      presenter({ ...item });
    });
    buttons.push(btn);
    el.appendChild(btn);
  }

  window.addEventListener('resize', () => {
    if (tooltipEl && tooltipEl.style.display === 'block' && tooltipAnchor) {
      positionPinnedTooltip(tooltipAnchor);
    }
  });
  document.addEventListener('pointerdown', (ev) => {
    if (!tooltipEl || tooltipEl.style.display !== 'block') return;
    const target = /** @type {Node|null} */ (ev.target);
    const insideSlot = buttons.some((btn) => btn.contains(target));
    if (!insideSlot) {
      browseState.active = false;
      browseState.anchorSlot = -1;
      browseState.index = -1;
      hidePinnedTooltip();
    }
  }, { passive: true });

  window.addEventListener('ui:itemUsed', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    hidePinnedTooltip();
    const next = applyPinnedQuickItemUse(pinned, e?.detail);
    if (arePinnedArraysEqual(next, pinned)) return;
    pinned = next;
    render();
    emitPinnedQuickItems();
  });
  window.addEventListener('ui:itemThrown', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    hidePinnedTooltip();
    const next = applyPinnedQuickItemUse(pinned, e?.detail);
    if (arePinnedArraysEqual(next, pinned)) return;
    pinned = next;
    render();
    emitPinnedQuickItems();
  });
  window.addEventListener('ui:itemEquipped', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    hidePinnedTooltip();
    removeByPinKeyOrId(e?.detail?.pinKey || e?.detail?.identity || e?.detail?.itemId);
  });
  window.addEventListener('ui:itemIdentified', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const item = e?.detail?.item;
    const id = Number(item?.id || 0) | 0;
    if (!(id > 0)) return;
    const idx = pinned.findIndex((entry) => Number(entry?.id || 0) === id);
    if (idx < 0) return;
    pinned[idx] = {
      ...pinned[idx],
      ...item,
      id,
      count: normalizePositiveCount(item?.count || pinned[idx]?.count),
      details: item,
    };
    render();
    emitPinnedQuickItems();
  });
  window.addEventListener('ui:requestPinQuickItem', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const item = e?.detail?.item;
    if (!item || !getQuickPinKey(item)) return;
    pinItem(item);
  });
  window.addEventListener('ui:inventoryData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    inventoryItems = Array.isArray(e?.detail?.bagItems) ? e.detail.bagItems : [];
    const bagItems = Array.isArray(e?.detail?.bagItems) ? e.detail.bagItems : [];
    if (!didSeedStarterPins && pinned.length === 0 && bagItems.length > 0) {
      didSeedStarterPins = true;
      const seeds = buildStartingPinnedQuickItems(bagItems, SLOT_COUNT);
      for (const item of seeds) {
        pinned = upsertPinnedQuickItemLifo(pinned, item, SLOT_COUNT);
      }
      if (seeds.length > 0) {
        render();
        emitPinnedQuickItems();
      }
    }
    const next = reconcilePinnedQuickItemsWithInventory(pinned, bagItems);
    if (arePinnedArraysEqual(next, pinned)) return;
    pinned = next;
    render();
    emitPinnedQuickItems();
  });

  render();
  emitPinnedQuickItems();
  // Seed starter pins as soon as the game is running (player exists, inventory available).
  // ui:updateVitals fires on the first HUD feed tick after player creation.
  function _onFirstVitals() {
    window.removeEventListener('ui:updateVitals', _onFirstVitals);
    if (!didSeedStarterPins) {
      window.dispatchEvent(new CustomEvent('ui:requestInventoryData', { detail: {} }));
    }
  }
  window.addEventListener('ui:updateVitals', _onFirstVitals);
  return {
    el,
    pinItem,
    hasIdentity(identity) {
      const key = String(identity || '').trim().toLowerCase();
      if (!key) return false;
      return pinned.some((entry) => {
        const eid = String(entry?.identity || '').trim().toLowerCase();
        return eid && eid === key;
      });
    },
    setPresenter(fn) {
      presenter = typeof fn === 'function' ? fn : null;
    },
  };
}
