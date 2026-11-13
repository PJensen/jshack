import {
  appendCharacterMenuTabs, markScrollable, quickPinKeyForItem,
  decorateButton, humanize, sanitize, bracketize,
  hide, hideItemTooltip, rarityStyle, renderItemDetails,
  installDetachableKeyHandler, pulseRow, UI, UX_THEME, dispatchCharacterMenuTabCycle,
} from './overlayUtils.js';
import { getInventoryDefaultAction, isInventoryItemEquippable, isInventoryItemUsable } from './inventoryUtils.js';
import { applyAtlasIcon, ITEM_ICON_ATLAS } from './atlasIcons.js';

/** @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel @param {Array<any>} items @param {any} [ground] @param {string} [slotFilter] */
export function renderInventory(panel, items, ground, slotFilter = '', scrollOfIdentifyId = 0, encumbrance = null, pinnedKeys = []) {
  const existingDetach = /** @type {any} */ (panel)._inventoryDetach;
  if (typeof existingDetach === 'function') {
    try { existingDetach(); } catch (e) { console.debug('[overlay] inventory detach failed:', e); }
  }

  const el = /** @type {HTMLDivElement} */ (/** @type {any} */(panel)._inner);
  el.innerHTML = '';
  el.style.overflowX = 'hidden';
  el.style.overflowY = 'auto';
  el.style.width = 'min(920px, 92vw)';
  appendCharacterMenuTabs(el, 'inventory');
  const pinnedSet = new Set((Array.isArray(pinnedKeys) ? pinnedKeys : []).map((key) => String(key || '')));
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    marginBottom: '10px',
    paddingRight: '32px',
  });
  const title = document.createElement('div');
  const filterText = humanize(slotFilter || '');
  title.textContent = filterText ? `Inventory \u00b7 ${filterText}` : 'Inventory';
  title.style.fontWeight = 'bold';
  title.style.fontSize = '15px';
  const countChip = document.createElement('span');
  countChip.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  Object.assign(countChip.style, {
    flexShrink: '0',
    padding: '2px 7px',
    border: UX_THEME.surfaceBorderSoft,
    borderRadius: '999px',
    color: UX_THEME.muted,
    background: 'rgba(23, 20, 17, 0.58)',
    fontSize: '11px',
  });
  header.appendChild(title);
  header.appendChild(countChip);
  el.appendChild(header);

  // Carry weight bar
  if (encumbrance && encumbrance.limit != null && encumbrance.limit > 0) {
    const cur = Number(encumbrance.current || 0);
    const lim = Number(encumbrance.limit);
    const ratio = Math.min(cur / lim, 1.0);
    const barColor = encumbrance.overloaded ? '#e06a6a' : encumbrance.heavilyLoaded ? '#d9963b' : '#4a8a5a';

    const row = document.createElement('div');
    Object.assign(row.style, {
      marginBottom: '8px', fontSize: '12px', color: UI.TEXT,
    });

    const label = document.createElement('span');
    const state = encumbrance.overloaded ? ' · overloaded'
      : encumbrance.heavilyLoaded ? ' · burdened'
      : '';
    label.textContent = `Weight: ${cur.toFixed(1)} / ${lim.toFixed(1)} kg${state}`;
    if (encumbrance.overloaded) label.style.color = '#e06a6a';
    else if (encumbrance.heavilyLoaded) label.style.color = '#d9963b';
    row.appendChild(label);

    const track = document.createElement('div');
    Object.assign(track.style, {
      marginTop: '3px', height: '6px', background: UX_THEME.surfaceBgStrong,
      borderRadius: '3px', overflow: 'hidden', border: UX_THEME.surfaceBorderSoft,
    });

    const fill = document.createElement('div');
    Object.assign(fill.style, {
      height: '100%', width: `${(ratio * 100).toFixed(1)}%`,
      background: barColor, borderRadius: '3px', transition: 'width 0.2s',
    });
    track.appendChild(fill);
    row.appendChild(track);
    el.appendChild(row);
  }

  if (!items.length) {
    (/** @type {any} */ (panel))._inventorySelectionKey = '';
    (/** @type {any} */ (panel))._inventorySelectionIndex = 0;
    (/** @type {any} */ (panel))._inventoryScrollTop = 0;
    const empty = document.createElement('div');
    empty.textContent = filterText ? `No ${filterText} items.` : 'Your pack is empty.';
    Object.assign(empty.style, {
      padding: '18px',
      border: UI.BORDER,
      borderRadius: UI.RADIUS,
      background: UI.DEFAULT_BG,
      color: UX_THEME.muted,
      textAlign: 'center',
    });
    el.appendChild(empty);
    return;
  }

  const compact = window.innerWidth < 760;
  const layout = document.createElement('div');
  Object.assign(layout.style, {
    display: 'grid',
    gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.08fr) minmax(260px, 0.92fr)',
    gap: '10px',
    alignItems: 'start',
  });
  el.appendChild(layout);

  // Keyboard-driven list
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '4px';
  list.style.maxHeight = compact ? '28vh' : '58vh';
  list.style.overflowY = 'auto';
  list.style.overflowX = 'hidden';
  list.style.paddingRight = '2px';
  markScrollable(list);
  if (compact) list.style.overscrollBehavior = 'auto';
  layout.appendChild(list);

  const savedSelectionKey = String((/** @type {any} */ (panel))._inventorySelectionKey || '');
  const savedSelectionIndex = Number((/** @type {any} */ (panel))._inventorySelectionIndex || 0);
  const savedScrollTop = Number((/** @type {any} */ (panel))._inventoryScrollTop || 0);
  if (Number.isFinite(savedScrollTop) && savedScrollTop > 0) {
    list.scrollTop = savedScrollTop;
  }
  list.addEventListener('scroll', () => {
    (/** @type {any} */ (panel))._inventoryScrollTop = list.scrollTop;
  });

  let sel = 0;

  const rows = items.map((it, idx) => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', alignItems: 'center', gap: '8px',
      width: '100%', padding: '6px 8px',
      boxSizing: 'border-box',
      background: UI.DEFAULT_BG, color: UI.TEXT, border: UI.BORDER, borderRadius: UI.RADIUS
    });
    if (it.unpaid) {
      row.style.borderColor = '#d9963b';
      row.style.background = 'rgba(65, 35, 10, 0.75)';
    }
    row.dataset.itemId = String(it.id);
    row.tabIndex = 0;
    const pinKey = quickPinKeyForItem(it);
    const isPinned = pinKey ? pinnedSet.has(pinKey) : false;

    const star = document.createElement('span');
    star.textContent = it.equipped ? '*' : ' ';
    star.style.width = '1ch';
    star.style.color = '#ffd27d';
    star.title = it.equipped ? 'Equipped' : '';

    const pin = document.createElement('span');
    pin.textContent = isPinned ? '\uD83D\uDCCC' : ' ';
    pin.style.width = '1ch';
    pin.style.color = UX_THEME.accent;
    pin.title = isPinned ? 'Pinned to quick slot' : '';

    const name = document.createElement('span');
    const rs = rarityStyle(it.rarityName);
    name.textContent = bracketize(sanitize(it.name || it.description || it.type));
    Object.assign(name.style, rs);
    name.style.flex = '1 1 auto';
    name.style.minWidth = '0';
    name.style.overflow = 'hidden';
    name.style.textOverflow = 'ellipsis';
    name.style.whiteSpace = 'nowrap';

    const modifierIcons = [
      ...(Array.isArray(it.socketedGems) ? it.socketedGems : []).map((gem) => ({
        id: gem?.iconId,
        label: gem?.name || 'Socketed gem',
      })),
      ...(Array.isArray(it.mechanics) ? it.mechanics : [])
        .filter((mechanic) => mechanic?.iconId)
        .map((mechanic) => ({
          id: mechanic.iconId,
          label: `${mechanic.context || 'Enchantment'}: ${mechanic.text || 'Enchantment'}`,
        })),
    ].filter((entry) => String(entry.id || '').trim()).slice(0, 4);
    if (modifierIcons.length) {
      const modifiers = document.createElement('span');
      Object.assign(modifiers.style, { display: 'inline-flex', gap: '2px', flex: '0 0 auto' });
      for (const modifier of modifierIcons) {
        const icon = document.createElement('span');
        const hasIcon = applyAtlasIcon(icon, ITEM_ICON_ATLAS, String(modifier.id), '✧', 16);
        if (!hasIcon) icon.textContent = '✧';
        icon.title = String(modifier.label);
        icon.setAttribute('aria-label', String(modifier.label));
        modifiers.appendChild(icon);
      }
      row.appendChild(modifiers);
    }

    const slot = document.createElement('span');
    slot.style.opacity = '0.7'; slot.textContent = it.slot ? `(${it.slot})` : '';

    const qty = document.createElement('span');
    qty.style.marginLeft = 'auto';
    qty.style.opacity = '0.8';
    const count = Math.max(0, Number(it.count ?? 1) | 0);
    qty.textContent = it.type === 'wand' ? `${count} ch` : `x${count}`;

    const unpaidTag = document.createElement('span');
    if (it.unpaid) {
      const bill = Number(it.unpaidPrice || 0);
      unpaidTag.textContent = bill > 0 ? `UNPAID ${bill}g` : 'UNPAID';
      unpaidTag.style.color = '#ffbf5a';
      unpaidTag.style.fontWeight = 'bold';
      unpaidTag.style.fontSize = '11px';
      unpaidTag.style.marginLeft = '6px';
    }

    row.appendChild(star);
    row.appendChild(pin);
    row.appendChild(name);
    if (it.coating && it.coating.kind) {
      const dot = document.createElement('span');
      dot.textContent = '\u2022';
      dot.style.color = it.coating.color || '#66dd66';
      dot.style.fontSize = '14px';
      row.appendChild(dot);
    }
    row.appendChild(slot);
    if (it.unpaid) row.appendChild(unpaidTag);
    const cdRemaining = Number(it.cooldownTurnsRemaining ?? 0);
    const cdMax = Number(it.cooldownTurnsMax ?? 0);
    if (cdRemaining > 0 && cdMax > 0) {
      const elapsed = 1 - (cdRemaining / cdMax);
      const cdSym = elapsed >= 0.75 ? '\u25d5' : elapsed >= 0.5 ? '\u25d1' : elapsed >= 0.25 ? '\u25d4' : '\u25cb';
      const cdSpan = document.createElement('span');
      cdSpan.textContent = cdSym;
      cdSpan.title = `Cooldown: ${cdRemaining} turns remaining`;
      cdSpan.style.color = '#ff9f3b';
      row.appendChild(cdSpan);
    }
    row.appendChild(qty);

    row.addEventListener('click', () => { setSel(idx, { revealDetail: compact }); });
    row.addEventListener('dblclick', () => {
      setSel(idx);
      defaultAction();
    });
    list.appendChild(row);
    return row;
  });

  const hint = document.createElement('div');
  hint.style.marginTop = '0';
  hint.style.opacity = '0.85';
  hint.style.whiteSpace = 'normal';
  hint.style.overflowWrap = 'anywhere';
  hint.style.wordBreak = 'break-word';
  hint.style.fontSize = '11px';
  hint.style.lineHeight = '1.45';

  const detail = document.createElement('div');
  Object.assign(detail.style, {
    padding: '8px',
    border: UI.BORDER,
    borderRadius: UI.RADIUS,
    background: UI.DEFAULT_BG,
    minHeight: '56px',
    maxHeight: compact ? '30vh' : '34vh',
    overflowY: 'auto',
    overflowX: 'hidden',
  });
  markScrollable(detail);
  if (compact) detail.style.overscrollBehavior = 'auto';

  const actions = document.createElement('div');
  Object.assign(actions.style, {
    padding: '8px',
    border: UI.BORDER,
    borderRadius: UI.RADIUS,
    background: UI.DEFAULT_BG,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    minHeight: '48px',
    alignItems: 'center',
    width: '100%',
    boxSizing: 'border-box',
    overflowX: 'hidden',
  });

  const side = document.createElement('div');
  Object.assign(side.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: '0',
  });
  side.appendChild(detail);
  side.appendChild(actions);
  side.appendChild(hint);
  layout.appendChild(side);

  function triggerApplyForTool(it) {
    const toolId = Number(it?.id || 0);
    if (!Number.isInteger(toolId) || toolId <= 0) return;
    window.dispatchEvent(new CustomEvent('ui:openApplyForTool', { detail: { toolId } }));
  }

  /** @param {any} it */
  function enterActionLabel(it) {
    const action = getInventoryDefaultAction(it);
    if (action === 'apply') {
      const isSocketGem = String(it?.type || '') === 'gem' && !!it?.canApply;
      return isSocketGem ? 'Socket' : 'Apply';
    }
    if (action === 'equip') return it?.equipped ? 'Unequip' : 'Equip';
    if (action === 'use') return 'Use';
    if (action === 'set-spell') return 'Set Spell';
    return 'None';
  }

  function updateHint() {
    const it = items[sel];
    const groundAction = resolveGroundPickupAction();
    const canApplyTool = !!it?.canApply;
    const socketApply = String(it?.type || '') === 'gem' && canApplyTool;
    const applyVerb = socketApply ? 'Socket' : 'Apply';
    const hasApplyTargets = !!(canApplyTool && Number(it?.applyTargetCount || 0) > 0);
    const applyHint = canApplyTool
      ? (hasApplyTargets ? ` \u00b7 A=${applyVerb}` : ` \u00b7 A=${applyVerb} (no targets)`)
      : '';
    hint.textContent = `Tab=Next menu \u00b7 Enter=${enterActionLabel(it)} \u00b7 U=Use \u00b7 E=Equip \u00b7 I=Pin \u00b7 ,=Drop \u00b7 T=Throw${applyHint}${groundAction ? ' \u00b7 P=Pickup' : ''} \u00b7 S=Set Spell \u00b7 Esc=Close`;
    detail.innerHTML = '';
    if (it) {
      renderItemDetails(detail, it);
    }
    // Inventory uses inline detail panel; avoid duplicate floating tooltip.
    hideItemTooltip();
    renderInventoryActions();
  }

  function createActionButton(label, onClick, opts) {
    const btn = document.createElement('button');
    btn.textContent = label;
    decorateButton(btn);
    btn.style.minHeight = '44px';
    btn.style.padding = '8px 12px';
    if (opts?.disabled) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      if (opts?.disabledReason) btn.title = String(opts.disabledReason);
    }
    if (opts?.primary) {
      btn.style.background = UX_THEME.surfaceSelected;
      btn.style.borderColor = UX_THEME.accentBorder;
      btn.style.fontWeight = '700';
      btn.style.color = UX_THEME.textStrong;
      btn.style.boxShadow = UX_THEME.accentGlow;
      btn.title = 'Default action (Enter)';
    }
    btn.addEventListener('click', onClick);
    return btn;
  }

  function renderInventoryActions() {
    const it = items[sel];
    actions.innerHTML = '';
    if (!it) return;

    const hasItemId = Number.isInteger(it.id) && it.id > 0;
    const canApplyTool = !!it?.canApply;
    const socketApply = String(it?.type || '') === 'gem' && canApplyTool;
    const hasApplyTargets = !!(canApplyTool && Number(it.applyTargetCount || 0) > 0);
    const available = [];
    if (isInventoryItemEquippable(it) && hasItemId) {
      available.push({ key: 'equip', label: it.equipped ? 'Unequip' : 'Equip', enabled: true });
    }
    if (isInventoryItemUsable(it) && hasItemId) {
      available.push({ key: 'use', label: 'Use', enabled: true });
    }
    if (canApplyTool && hasItemId) {
      available.push({
        key: 'apply',
        label: socketApply ? 'Socket' : 'Apply',
        enabled: hasApplyTargets,
        disabledReason: hasApplyTargets ? '' : 'No valid targets in inventory',
      });
    }
    if (it.type === 'spell') {
      const spellId = String(it.id || '').replace(/^spell:/, '');
      if (spellId) {
        available.push({ key: 'set-spell', label: it.equipped ? 'Active Spell' : 'Set Spell', enabled: true });
      }
    }
    if (it.identified === false && hasItemId) {
      const hasScroll = scrollOfIdentifyId > 0;
      available.push({
        key: 'identify',
        label: 'Identify',
        enabled: hasScroll,
        disabledReason: hasScroll ? '' : 'No Scroll of Identify',
      });
    }
    if (hasItemId && Number(it.maxSockets || 0) > 0) {
      const filledSockets = Array.isArray(it.sockets) ? it.sockets.length : 0;
      const hasOpenSocket = filledSockets < Number(it.maxSockets || 0);
      available.push({
        key: 'add-gem',
        label: 'Add Gem',
        enabled: hasOpenSocket,
        disabledReason: hasOpenSocket ? '' : 'All sockets filled',
      });
    }
    if (hasItemId) {
      available.push({ key: 'throw', label: 'Throw', enabled: true });
    }
    if (hasItemId) {
      available.push({ key: 'drop', label: 'Drop', enabled: true });
    }
    if (hasItemId) {
      const pinKey = quickPinKeyForItem(it);
      const isPinned = pinKey ? pinnedSet.has(pinKey) : false;
      available.push({
        key: 'pin',
        label: isPinned ? 'Pinned' : 'Pin',
        enabled: !isPinned,
        disabledReason: isPinned ? 'Already pinned' : '',
      });
    }

    const defaultKey = getInventoryDefaultAction(it);
    const order = {
      equip: 1,
      use: 2,
      apply: 3,
      'add-gem': 4,
      identify: 5,
      'set-spell': 6,
      throw: 7,
      drop: 8,
      pin: 9,
    };
    available.sort((a, b) => {
      const ar = a.key === defaultKey ? 0 : (order[a.key] || 90);
      const br = b.key === defaultKey ? 0 : (order[b.key] || 90);
      return ar - br;
    });
    const defaultIndex = available.findIndex((entry) => entry.key === defaultKey && entry.enabled !== false);
    const firstEnabledIndex = available.findIndex((entry) => entry.enabled !== false);
    const primaryIndex = defaultIndex >= 0 ? defaultIndex : firstEnabledIndex;
    available.forEach((entry, i) => {
      actions.appendChild(createActionButton(entry.label, () => {
        dispatchInventoryAction(it, entry.key);
      }, {
        primary: i === primaryIndex,
        disabled: entry.enabled === false,
        disabledReason: entry.disabledReason,
      }));
    });

    const groundAction = resolveGroundPickupAction();
    if (groundAction) {
      actions.appendChild(createActionButton(groundAction.label, groundAction.run));
    }
  }

  /**
   * @param {any} it
   * @param {"apply"|"identify"|"equip"|"use"|"set-spell"|"throw"|"drop"|"pin"} actionKey
   */
  function dispatchInventoryAction(it, actionKey) {
    if (!it) return;
    const row = rows[sel];
    const unpaid = !!it.unpaid;
    const restoreBg = unpaid ? 'rgba(65, 35, 10, 0.75)' : (row === rows[sel] && row?.style.outline !== 'none') ? UI.SEL_BG : UI.DEFAULT_BG;
    const signalPulse = () => window.dispatchEvent(new CustomEvent('ui:inventoryPulse'));

    if (actionKey === 'identify') {
      if (scrollOfIdentifyId > 0 && Number.isInteger(it.id) && it.id > 0) {
        window.dispatchEvent(new CustomEvent('ui:requestApply', {
          detail: { toolId: scrollOfIdentifyId, targetItemId: it.id },
        }));
        signalPulse(); pulseRow(row, 'use', restoreBg);
      }
      return;
    }
    if (actionKey === 'add-gem') {
      const weaponId = Number(it?.id || 0);
      if (weaponId > 0) {
        window.dispatchEvent(new CustomEvent('ui:openGemSelectorForWeapon', { detail: { weaponId } }));
      }
      return;
    }
    if (actionKey === 'apply') {
      if (it?.canApply && Number(it?.applyTargetCount || 0) > 0) {
        triggerApplyForTool(it);
      }
      return;
    }
    if (actionKey === 'equip') {
      if (isInventoryItemEquippable(it) && Number.isInteger(it.id) && it.id > 0) {
        window.dispatchEvent(new CustomEvent('ui:requestEquip', { detail: { itemId: it.id } }));
        signalPulse(); pulseRow(row, it.equipped ? 'unequip' : 'equip', restoreBg);
      }
      return;
    }
    if (actionKey === 'use') {
      if (getInventoryDefaultAction(it) === 'apply') {
        triggerApplyForTool(it);
        return;
      }
      if (!isInventoryItemUsable(it) || !Number.isInteger(it.id) || it.id <= 0) return;
      signalPulse(); pulseRow(row, 'use', restoreBg);
      if (it.type === 'potion') {
        window.dispatchEvent(new CustomEvent('ui:requestDrink', { detail: { itemId: it.id } }));
      } else {
        window.dispatchEvent(new CustomEvent('ui:toggleInventory'));
        window.dispatchEvent(new CustomEvent('ui:requestUse', { detail: { itemId: it.id } }));
      }
      return;
    }
    if (actionKey === 'set-spell') {
      const spellId = String(it.id || '').replace(/^spell:/, '');
      if (spellId) {
        window.dispatchEvent(new CustomEvent('ui:selectActiveSpell', { detail: { spellId } }));
        signalPulse(); pulseRow(row, 'equip', restoreBg);
      }
      return;
    }
    if (actionKey === 'throw') {
      if (Number.isInteger(it.id) && it.id > 0) {
        signalPulse(); pulseRow(row, 'throw', restoreBg);
        window.dispatchEvent(new CustomEvent('ui:requestThrow', { detail: { itemId: it.id } }));
        hide(panel);
      }
      return;
    }
    if (actionKey === 'drop') {
      if (Number.isInteger(it.id) && it.id > 0) {
        signalPulse(); pulseRow(row, 'drop', restoreBg);
        window.dispatchEvent(new CustomEvent('ui:requestDrop', { detail: { itemId: it.id } }));
      }
      return;
    }
    if (actionKey === 'pin') {
      if (Number.isInteger(it.id) && it.id > 0) {
        signalPulse(); pulseRow(row, 'pin', restoreBg);
        window.dispatchEvent(new CustomEvent('ui:requestPinQuickItem', { detail: { item: it } }));
      }
    }
  }

  function resolveGroundPickupAction() {
    if (!ground || typeof ground !== 'object') return null;
    const mode = String(ground.mode || '');
    if (mode === 'single') {
      const itemId = Number(ground?.item?.id || 0);
      if (!Number.isInteger(itemId) || itemId <= 0) return null;
      return {
        label: 'Pickup',
        run: () => {
          window.dispatchEvent(new CustomEvent('ui:requestPickup', { detail: { itemIds: [itemId] } }));
        },
      };
    }
    if (mode === 'stack') {
      const stackItems = Array.isArray(ground.items) ? ground.items : [];
      const stackIndex = Math.max(0, Math.min(stackItems.length - 1, Number(ground.stackIndex || 0) | 0));
      const topItem = stackItems[stackIndex];
      const itemId = Number(topItem?.id || 0) | 0;
      if (!(itemId > 0)) return null;
      return {
        label: 'Pickup',
        run: () => {
          window.dispatchEvent(new CustomEvent('ui:requestPickup', { detail: { itemIds: [itemId] } }));
        },
      };
    }
    const fromChest = ground.fromChest === true;
    const groundChestId = Number(ground.chestId || 0) | 0;
    if (fromChest && groundChestId > 0) {
      const actionLabel = ground.chestName ? `Open ${ground.chestName}` : 'Open Chest';
      return {
        label: actionLabel,
        run: () => {
          window.dispatchEvent(new CustomEvent('ui:tapOpenChest', { detail: { chestId: groundChestId } }));
        },
      };
    }
    const items = Array.isArray(ground.items) ? ground.items.filter((it) => Number.isInteger(it?.id) && it.id > 0) : [];
    if (!items.length) return null;
    return {
      label: `Pickup (${items.length})`,
      run: () => {
        window.dispatchEvent(new CustomEvent('ui:openPickupChooser', { detail: { items } }));
      },
    };
  }

  /** @param {number} i @param {{ensureVisible?:boolean, revealDetail?:boolean}} [opts] */
  function setSel(i, opts) {
    sel = Math.max(0, Math.min(items.length - 1, i|0));
    (/** @type {any} */ (panel))._inventorySelectionKey = String(items[sel]?.id ?? '');
    (/** @type {any} */ (panel))._inventorySelectionIndex = sel;
    rows.forEach((r, j) => {
      const baseBg = items[j]?.unpaid ? 'rgba(65, 35, 10, 0.75)' : UI.DEFAULT_BG;
      const activeBg = items[j]?.unpaid ? 'rgba(85, 45, 14, 0.9)' : UI.SEL_BG;
      r.style.outline = (j === sel) ? UI.SEL_OUTLINE : 'none';
      r.style.background = (j === sel) ? activeBg : baseBg;
    });
    if (opts?.ensureVisible !== false) {
      rows[sel]?.scrollIntoView({ block: 'nearest' });
    }
    updateHint();
    if (opts?.revealDetail) {
      side.scrollIntoView({ block: 'nearest' });
    }
  }

  function defaultAction() {
    const it = items[sel]; if (!it) return;
    const action = getInventoryDefaultAction(it);
    if (action === 'none') return;
    dispatchInventoryAction(it, action);
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (panel.style.display !== 'block') return;
    const k = e.key;
    if (k === 'Tab') { dispatchCharacterMenuTabCycle('inventory', e.shiftKey); e.preventDefault(); }
    else if (k === 'ArrowUp') { setSel(sel - 1); e.preventDefault(); }
    else if (k === 'ArrowDown') { setSel(sel + 1); e.preventDefault(); }
    else if (k === 'Home') { setSel(0); e.preventDefault(); }
    else if (k === 'End') { setSel(items.length - 1); e.preventDefault(); }
    else if (k === 'Enter' || e.code === 'NumpadEnter') { defaultAction(); e.preventDefault(); }
    else if (k === 'a' || k === 'A') { const it = items[sel]; if (it?.canApply && Number(it?.applyTargetCount || 0) > 0) { triggerApplyForTool(it); e.preventDefault(); } }
    else if (k === ',' || e.code === 'Comma') { const it = items[sel]; if (it && Number.isInteger(it.id) && it.id > 0) { pulseRow(rows[sel], 'drop'); window.dispatchEvent(new CustomEvent('ui:requestDrop', { detail: { itemId: it.id } })); e.preventDefault(); } }
    else if (k === 'e' || k === 'E') { const it = items[sel]; if (isInventoryItemEquippable(it)) { pulseRow(rows[sel], it.equipped ? 'unequip' : 'equip'); window.dispatchEvent(new CustomEvent('ui:requestEquip', { detail: { itemId: it.id } })); e.preventDefault(); } }
    else if (k === 'd' || k === 'D') { const it = items[sel]; if (it?.type === 'potion') { pulseRow(rows[sel], 'use'); window.dispatchEvent(new CustomEvent('ui:requestDrink', { detail: { itemId: it.id } })); e.preventDefault(); } }
    else if (k === 'u' || k === 'U') {
      const it = items[sel];
      if (isInventoryItemUsable(it)) {
        pulseRow(rows[sel], 'use');
        if (it.type === 'potion') {
          window.dispatchEvent(new CustomEvent('ui:requestDrink', { detail: { itemId: it.id } }));
        } else {
          window.dispatchEvent(new CustomEvent('ui:toggleInventory'));
          window.dispatchEvent(new CustomEvent('ui:requestUse', { detail: { itemId: it.id } }));
        }
        e.preventDefault();
      }
    }
    else if (k === 'i' || k === 'I') {
      const it = items[sel];
      const pinKey = quickPinKeyForItem(it);
      if (it && pinKey && !pinnedSet.has(pinKey)) {
        pulseRow(rows[sel], 'pin');
        window.dispatchEvent(new CustomEvent('ui:requestPinQuickItem', { detail: { item: it } }));
        e.preventDefault();
      }
    }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
    else if (k === 't' || k === 'T') { const it = items[sel]; if (it && Number.isInteger(it.id) && it.id > 0) { pulseRow(rows[sel], 'throw'); window.dispatchEvent(new CustomEvent('ui:requestThrow', { detail: { itemId: it.id } })); hide(panel); e.preventDefault(); } }
    else if (k === 's' || k === 'S') { const it = items[sel]; if (it?.type === 'spell') { const spellId = String(it.id || '').replace(/^spell:/, ''); if (spellId) { pulseRow(rows[sel], 'equip'); window.dispatchEvent(new CustomEvent('ui:selectActiveSpell', { detail: { spellId } })); e.preventDefault(); } } }
    else if (k === 'p' || k === 'P') {
      const groundAction = resolveGroundPickupAction();
      if (groundAction) {
        groundAction.run();
        e.preventDefault();
      }
    }
  }

  // Activate keyboard navigation while panel is open
  let initialSel = 0;
  if (savedSelectionKey) {
    const found = items.findIndex((it) => String(it?.id ?? '') === savedSelectionKey);
    if (found >= 0) initialSel = found;
    else if (Number.isFinite(savedSelectionIndex)) initialSel = Math.max(0, Math.min(items.length - 1, savedSelectionIndex | 0));
  } else if (Number.isFinite(savedSelectionIndex)) {
    initialSel = Math.max(0, Math.min(items.length - 1, savedSelectionIndex | 0));
  }
  setSel(initialSel, { ensureVisible: false });
  installDetachableKeyHandler(panel, '_inventoryDetach', (e) => onKey(e));
}
