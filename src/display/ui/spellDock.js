export function createPinnedSpellDock(mobileLayoutMq) {
  const SLOT_COUNT = 4;
  const HOLD_THRESHOLD_MS = 350;
  const MICRO_UX_STYLE_ID = 'jshack-pinned-spell-dock-micro-ux';
  function ensureMicroUxStyles() {
    if (document.getElementById(MICRO_UX_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = MICRO_UX_STYLE_ID;
    style.textContent = `
      @keyframes jshackPinnedSpellBump {
        0% { transform: scale(1.02); }
        45% { transform: scale(1.18); }
        100% { transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
  }
  ensureMicroUxStyles();

  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    left: '8px',
    right: '8px',
    bottom: 'calc(var(--jshack-actionbar-height, 48px) + 10px + env(safe-area-inset-bottom, 0px))',
    display: 'none',
    flexDirection: 'row',
    gap: '6px',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
    zIndex: '919',
  });

  /** @type {{ entry: any, spellId: string|null, btn: HTMLButtonElement, glyphSpan: HTMLSpanElement, manaBadge: HTMLSpanElement, cdOverlay: HTMLDivElement, cdLabel: HTMLSpanElement, holdTimer: number|null, isHold: boolean, isPressing: boolean }[]} */
  const slots = [];

  /** @type {any[]|null} cached spell data from last ui:spellData response */
  let _cachedSpells = null;
  /** @type {string|null} */
  let _cachedActiveId = null;
  /** @type {number} */
  let _cachedMana = 0;

  // --- Fan overlay (shared by all slots, only one open at a time) ---
  let _fanOpenForSlot = -1;
  const fan = document.createElement('div');
  Object.assign(fan.style, {
    position: 'fixed',
    display: 'none',
    pointerEvents: 'none',
    zIndex: '921',
  });
  /** @type {HTMLElement[]} */
  let _fanItems = [];
  let _hoverSpellId = null;

  function closeFan() {
    _fanOpenForSlot = -1;
    _hoverSpellId = null;
    _fanItems = [];
    fan.style.display = 'none';
    fan.innerHTML = '';
    for (const s of slots) {
      s.btn.style.transform = '';
      s.btn.style.borderColor = s.spellId ? '#2d3b52' : '#1a2030';
    }
  }

  function setFanItemVisual(item, selected, bump) {
    if (!item) return;
    if (selected) {
      item.style.transform = 'scale(1.1)';
      item.style.border = '2px solid #8fc2ff';
      item.style.background = '#1b2a44';
      item.style.zIndex = '5';
      item.style.boxShadow = '0 0 0 1px rgba(155,210,255,0.45), 0 4px 12px rgba(0,0,0,0.45)';
      if (bump) {
        item.style.animation = 'none';
        void item.offsetWidth;
        item.style.animation = 'jshackPinnedSpellBump 220ms cubic-bezier(0.2, 0.9, 0.2, 1)';
      }
    } else {
      item.style.animation = 'none';
      item.style.transform = 'scale(0.96)';
      item.style.zIndex = '1';
      item.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
      item.style.border = '1px solid #2d3b52';
      item.style.background = '#101626';
    }
  }

  function pickClosestAtPoint(clientX, clientY) {
    let closest = null;
    let bestDist = Infinity;
    for (const item of _fanItems) {
      const rect = item.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; closest = item; }
    }
    return closest;
  }

  function updateHoverFromPoint(clientX, clientY) {
    if (_fanOpenForSlot < 0) return;
    const item = pickClosestAtPoint(clientX, clientY);
    const nextId = item?.dataset?.spellId || null;
    if (!nextId || nextId === _hoverSpellId) return;
    _hoverSpellId = nextId;
    for (const fi of _fanItems) {
      setFanItemVisual(fi, fi.dataset.spellId === _hoverSpellId, fi.dataset.spellId === _hoverSpellId);
    }
  }

  function openFanForSlot(slotIndex) {
    _fanOpenForSlot = slotIndex;
    const btn = slots[slotIndex].btn;
    btn.style.transform = 'scale(1.1)';
    btn.style.borderColor = '#6b8fbf';
    _hoverSpellId = slots[slotIndex].spellId;

    // Request fresh spell data; render when ui:spellData arrives
    fan.style.display = 'block';
    window.dispatchEvent(new CustomEvent('ui:requestSpellData'));
  }

  function renderFanItems(spells, activeId, slotIndex) {
    fan.innerHTML = '';
    _fanItems = [];
    const count = spells.length;
    if (count === 0) return;

    // Position fan above the slot button
    const btn = slots[slotIndex].btn;
    const rect = btn.getBoundingClientRect();
    const anchorX = rect.left + rect.width / 2;
    const anchorY = rect.top;

    // Vertical list above the button
    const ITEM_SIZE = 42;
    const GAP = 6;
    const totalH = count * ITEM_SIZE + (count - 1) * GAP;

    for (let i = 0; i < count; i++) {
      const spell = spells[i];
      const isSelected = spell.id === (slots[slotIndex].spellId || activeId);
      const item = document.createElement('div');
      item.dataset.spellId = spell.id;
      const yOff = totalH - (i * (ITEM_SIZE + GAP)) - ITEM_SIZE;
      Object.assign(item.style, {
        position: 'absolute',
        width: ITEM_SIZE + 'px', height: ITEM_SIZE + 'px', borderRadius: '50%',
        border: isSelected ? '2px solid #6b8fbf' : '1px solid #2d3b52',
        background: isSelected ? '#152035' : '#101626',
        color: '#cfe8ff', fontSize: '18px',
        display: 'grid', placeItems: 'center',
        left: (anchorX - ITEM_SIZE / 2) + 'px',
        top: (anchorY - yOff - ITEM_SIZE - 10) + 'px',
        cursor: 'pointer',
        pointerEvents: 'auto',
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        transition: 'opacity 0.14s ease, transform 0.18s cubic-bezier(0.2, 0.9, 0.2, 1), border-color 0.16s ease, background-color 0.16s ease',
        opacity: '0',
        transform: 'scale(0.86)',
      });

      const sym = document.createElement('span');
      sym.textContent = spell.symbol || '\u2726';
      sym.style.lineHeight = '1';
      sym.style.pointerEvents = 'none';
      item.appendChild(sym);

      // Spell name label
      const label = document.createElement('span');
      const name = spell.name || spell.id;
      label.textContent = name;
      Object.assign(label.style, {
        position: 'absolute', bottom: '-14px', left: '-10px', right: '-10px',
        textAlign: 'center', fontSize: '10px', lineHeight: '1',
        color: '#cfe8ff', background: '#1a2744', borderRadius: '3px',
        padding: '2px 2px', pointerEvents: 'none', whiteSpace: 'nowrap',
      });
      item.appendChild(label);

      // Cooldown overlay
      const cdRemaining = Number(spell.cdRemaining || 0);
      const cdMax = Number(spell.cdMax || 0);
      if (cdRemaining > 0 && cdMax > 0) {
        const pct = (1 - cdRemaining / cdMax) * 100;
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
          position: 'absolute', inset: '0', borderRadius: '50%',
          background: `conic-gradient(from 0deg, transparent ${pct}%, rgba(0,0,0,0.65) ${pct}%)`,
          pointerEvents: 'none', zIndex: '1',
        });
        item.appendChild(overlay);
        const cdLbl = document.createElement('span');
        cdLbl.textContent = String(cdRemaining);
        Object.assign(cdLbl.style, {
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '12px', fontWeight: 'bold', color: '#ff9999',
          textShadow: '0 0 4px #000', pointerEvents: 'none', zIndex: '2',
        });
        item.appendChild(cdLbl);
        item.style.opacity = '0.5';
      }

      fan.appendChild(item);
      _fanItems.push(item);

      // Stagger fade-in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (fan.contains(item)) {
            const selected = (_hoverSpellId || slots[slotIndex].spellId) === spell.id;
            setFanItemVisual(item, selected, false);
            if (!(cdRemaining > 0 && cdMax > 0)) item.style.opacity = '1';
          }
        });
      });

      // Click to select
      item.addEventListener('click', () => {
        applyLocalSelection(slotIndex, spell);
        window.dispatchEvent(new CustomEvent('ui:setPinnedSpell', {
          detail: { slot: slotIndex, spellId: spell.id }
        }));
        closeFan();
      });
    }
  }

  /** Immediately apply a spell selection to a slot (before the hudFeeds round-trip). */
  function applyLocalSelection(slotIndex, spell) {
    const s = slots[slotIndex];
    if (!spell) return;
    s.spellId = spell.id;
    s.glyphSpan.textContent = spell.symbol || '\u2726';
    s.glyphSpan.style.opacity = '1';
    s.btn.style.opacity = '1';
    s.btn.style.borderColor = '#2d3b52';
    s.btn.title = spell.name || spell.id;
    const cost = Number(spell.cost || spell.manaCost || 0);
    s.manaBadge.textContent = cost > 0 ? String(cost) : '';
    s.manaBadge.style.display = cost > 0 ? 'block' : 'none';
    s.cdOverlay.style.display = 'none';
    s.cdLabel.style.display = 'none';
  }

  /** Find spell data from cached spells by id. */
  function findCachedSpell(spellId) {
    if (!_cachedSpells) return null;
    for (const sp of _cachedSpells) {
      if (sp.id === spellId) return sp;
    }
    return null;
  }

  // Build slot buttons
  for (let i = 0; i < SLOT_COUNT; i++) {
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      width: '40px', height: '40px', borderRadius: '50%',
      border: '1px solid #1a2030', background: 'rgba(16,22,38,0.85)',
      color: '#cfe8ff', fontSize: '18px', lineHeight: '1',
      display: 'grid', placeItems: 'center',
      cursor: 'pointer', touchAction: 'manipulation',
      position: 'relative',
      boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
      transition: 'transform 0.15s ease, border-color 0.15s ease, opacity 0.15s ease',
      opacity: '0.35',
    });

    const glyphSpan = document.createElement('span');
    glyphSpan.textContent = '+';
    glyphSpan.style.lineHeight = '1';
    glyphSpan.style.opacity = '0.4';
    btn.appendChild(glyphSpan);

    const manaBadge = document.createElement('span');
    Object.assign(manaBadge.style, {
      position: 'absolute', top: '-4px', right: '-4px',
      fontSize: '9px', fontWeight: 'bold',
      background: '#1a2a4a', border: '1px solid #2d3b52',
      borderRadius: '7px', padding: '1px 3px',
      color: '#88bbff', pointerEvents: 'none', display: 'none',
    });
    btn.appendChild(manaBadge);

    const cdOverlay = document.createElement('div');
    Object.assign(cdOverlay.style, {
      position: 'absolute', inset: '0', borderRadius: '50%',
      pointerEvents: 'none', zIndex: '1', display: 'none',
    });
    btn.appendChild(cdOverlay);

    const cdLabel = document.createElement('span');
    Object.assign(cdLabel.style, {
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      fontSize: '11px', fontWeight: 'bold', color: '#ff9999',
      textShadow: '0 0 4px #000', pointerEvents: 'none', zIndex: '2',
      display: 'none',
    });
    btn.appendChild(cdLabel);

    const slot = { entry: null, spellId: null, btn, glyphSpan, manaBadge, cdOverlay, cdLabel, holdTimer: null, isHold: false, isPressing: false };
    slots.push(slot);
    el.appendChild(btn);

    // Gesture: tap = cast, hold = open fan picker
    function onPressStart() {
      slot.isPressing = true;
      slot.isHold = false;
      if (slot.entry?.kind === 'item-use') return;
      slot.holdTimer = setTimeout(() => {
        slot.isHold = true;
        openFanForSlot(i);
      }, HOLD_THRESHOLD_MS);
    }

    function onPressEnd(e) {
      if (!slot.isPressing) return;
      slot.isPressing = false;
      if (slot.holdTimer) { clearTimeout(slot.holdTimer); slot.holdTimer = null; }
      if (slot.isHold) {
        // Hold release — pick hovered spell
        let selectedId = _hoverSpellId;
        if (!selectedId && e && e.changedTouches && e.changedTouches.length > 0) {
          const touch = e.changedTouches[0];
          const item = pickClosestAtPoint(touch.clientX, touch.clientY);
          selectedId = item?.dataset?.spellId || null;
        }
        if (selectedId) {
          const sp = findCachedSpell(selectedId);
          if (sp) applyLocalSelection(i, sp);
          window.dispatchEvent(new CustomEvent('ui:setPinnedSpell', {
            detail: { slot: i, spellId: selectedId }
          }));
        }
        closeFan();
      } else if (slot.entry?.kind === 'item-use' && Number(slot.entry?.itemId || 0) > 0) {
        window.dispatchEvent(new CustomEvent('ui:requestUse', { detail: { itemId: slot.entry.itemId, abilityId: slot.entry.abilityId } }));
        btn.style.animation = 'none';
        void btn.offsetWidth;
        btn.style.animation = 'jshackPinnedSpellBump 200ms cubic-bezier(0.2, 0.9, 0.2, 1)';
      } else if (slot.spellId) {
        // Short tap — cast this pinned spell
        window.dispatchEvent(new CustomEvent('ui:castPinnedSpell', { detail: { slot: i } }));
        // Bump animation
        btn.style.animation = 'none';
        void btn.offsetWidth;
        btn.style.animation = 'jshackPinnedSpellBump 200ms cubic-bezier(0.2, 0.9, 0.2, 1)';
      } else {
        // Empty slot tap — open fan to pick
        openFanForSlot(i);
      }
      slot.isHold = false;
    }

    function onPressCancel() {
      if (slot.holdTimer) { clearTimeout(slot.holdTimer); slot.holdTimer = null; }
      slot.isPressing = false;
      slot.isHold = false;
      if (_fanOpenForSlot === i) closeFan();
    }

    btn.addEventListener('touchstart', (e) => { e.preventDefault(); onPressStart(); }, { passive: false });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); onPressEnd(e); }, { passive: false });
    btn.addEventListener('touchcancel', () => onPressCancel(), { passive: true });
    btn.addEventListener('mousedown', (e) => { if (e.button === 0) onPressStart(); });
    btn.addEventListener('mouseup', (e) => { if (e.button === 0) onPressEnd(e); });
    btn.addEventListener('mouseleave', () => { if (!slot.isHold) onPressCancel(); });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) onPressEnd(e); });
  }

  // --- Refresh slot visuals from data ---
  function refreshSlots(detail) {
    const pinnedSlots = Array.isArray(detail?.pinnedSlots) ? detail.pinnedSlots : [];
    const mana = Number(detail?.mana || 0);
    const stamina = Number(detail?.stamina || 0);
    _cachedMana = mana;

    let anyAssigned = false;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const entry = (i < pinnedSlots.length) ? pinnedSlots[i] : null;
      const s = slots[i];
      s.entry = entry || null;
      s.spellId = entry?.kind === 'spell' ? (entry?.id || null) : null;

      if (entry?.kind === 'item-use' && entry?.id) {
        anyAssigned = true;
        s.glyphSpan.textContent = entry.symbol || '!';
        s.glyphSpan.style.opacity = '1';
        const cdRemaining = Number(entry.cdRemaining || 0);
        const cdMax = Number(entry.cdMax || 0);
        const onCooldown = cdRemaining > 0 && cdMax > 0;

        s.btn.style.opacity = onCooldown ? '0.5' : '1';
        s.btn.style.borderColor = '#6e5f2b';
        s.btn.title = `${entry.name || entry.id}${onCooldown ? ` [${cdRemaining}]` : ''}`;
        s.manaBadge.style.display = 'none';

        if (onCooldown) {
          const pct = (1 - cdRemaining / cdMax) * 100;
          s.cdOverlay.style.background = `conic-gradient(from 0deg, transparent ${pct}%, rgba(0,0,0,0.55) ${pct}%)`;
          s.cdOverlay.style.display = 'block';
          s.cdLabel.textContent = String(cdRemaining);
          s.cdLabel.style.display = 'block';
        } else {
          s.cdOverlay.style.display = 'none';
          s.cdLabel.style.display = 'none';
        }
      } else if (entry && entry.id) {
        anyAssigned = true;
        s.glyphSpan.textContent = entry.symbol || '\u2726';
        s.glyphSpan.style.opacity = '1';
        const cost = Number(entry.cost || 0);
        const resource = String(entry.costKind || 'mana');
        const canAfford = (resource === 'stamina' ? stamina : mana) >= cost;
        const cdRemaining = Number(entry.cdRemaining || 0);
        const cdMax = Number(entry.cdMax || 0);
        const onCooldown = cdRemaining > 0 && cdMax > 0;

        s.btn.style.opacity = (canAfford && !onCooldown) ? '1' : '0.5';
        s.btn.style.borderColor = '#2d3b52';
        const label = resource === 'stamina' ? 'stamina' : resource === 'life' ? 'life' : 'mana';
        s.btn.title = `${entry.name || entry.id} (${cost} ${label})${onCooldown ? ` [${cdRemaining}]` : ''}`;

        s.manaBadge.textContent = cost > 0 ? String(cost) : '';
        s.manaBadge.style.display = cost > 0 ? 'block' : 'none';

        if (onCooldown) {
          const pct = (1 - cdRemaining / cdMax) * 100;
          s.cdOverlay.style.background = `conic-gradient(from 0deg, transparent ${pct}%, rgba(0,0,0,0.55) ${pct}%)`;
          s.cdOverlay.style.display = 'block';
          s.cdLabel.textContent = String(cdRemaining);
          s.cdLabel.style.display = 'block';
        } else {
          s.cdOverlay.style.display = 'none';
          s.cdLabel.style.display = 'none';
        }
      } else {
        s.glyphSpan.textContent = '+';
        s.glyphSpan.style.opacity = '0.4';
        s.btn.style.opacity = '0.35';
        s.btn.style.borderColor = '#1a2030';
        s.btn.title = 'Pin a spell (hold to choose)';
        s.entry = null;
        s.manaBadge.style.display = 'none';
        s.cdOverlay.style.display = 'none';
        s.cdLabel.style.display = 'none';
      }
    }
    // Canonical spell dock for touch and desktop. Desktop adds keyboard aliases,
    // but uses this same four-slot surface.
    el.style.display = 'flex';
  }

  // Listen for spell data responses (for fan rendering)
  window.addEventListener('ui:spellData', (ev) => {
    if (_fanOpenForSlot < 0) return;
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    _cachedSpells = e?.detail?.spells || [];
    _cachedActiveId = e?.detail?.activeSpellId || null;
    renderFanItems(_cachedSpells, _cachedActiveId, _fanOpenForSlot);
  });

  // Listen for pinned spell bar updates
  window.addEventListener('ui:updatePinnedSpellBar', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    refreshSlots(e?.detail);
  });

  // Close fan on outside touch
  document.addEventListener('touchstart', (e) => {
    if (_fanOpenForSlot >= 0 && !el.contains(/** @type {Node} */ (e.target)) && !fan.contains(/** @type {Node} */ (e.target))) closeFan();
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (_fanOpenForSlot < 0) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    e.preventDefault();
    updateHoverFromPoint(touch.clientX, touch.clientY);
  }, { passive: false });
  document.addEventListener('mousemove', (e) => {
    if (_fanOpenForSlot < 0) return;
    updateHoverFromPoint(e.clientX, e.clientY);
  }, { passive: true });

  // Close fan when a spell is cast
  window.addEventListener('ui:castActiveSpell', () => { if (_fanOpenForSlot >= 0) closeFan(); });

  // Keep visibility stable on layout changes.
  mobileLayoutMq.addEventListener('change', () => {
    el.style.display = 'flex';
    if (_fanOpenForSlot >= 0) closeFan();
  });

  return { el, fan };
}
