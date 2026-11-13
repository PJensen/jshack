import {
  appendCharacterMenuTabs, markScrollable,
  decorateButton, humanize, sanitize, bracketize,
  show, hide, hideItemTooltip, rarityStyle, renderItemDetails,
  CHARACTER_SLOT_ORDER, installDetachableKeyHandler, pulseRow,
  UI, dispatchCharacterMenuTabCycle,
} from './overlayUtils.js';
import { applyAtlasIcon, ITEM_ICON_ATLAS } from './atlasIcons.js';

/**
 * @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel
 * @param {{ playerName?: string, stats?: Record<string, any>, activeEffects?: Array<any>, equippedBySlot?: Record<string, any> }} data
 */
export function renderCharacterSheet(panel, data) {
  const SEASON_COLORS = {
    spring: '#7ec87a',
    summer: '#f0c95a',
    autumn: '#d4834a',
    winter: '#8ab4d6',
  };
  const existingDetach = /** @type {any} */ (panel)._characterSheetDetach;
  if (typeof existingDetach === 'function') {
    try { existingDetach(); } catch (e) { console.debug('[overlay] character sheet detach failed:', e); }
  }

  const el = /** @type {HTMLDivElement} */ (/** @type {any} */ (panel)._inner);
  el.innerHTML = '';
  el.style.overflowX = 'hidden';
  el.style.width = 'min(760px, 92vw)';
  appendCharacterMenuTabs(el, 'character');

  const playerName = String(data?.playerName || 'Hero').trim() || 'Hero';
  const stats = data?.stats && typeof data.stats === 'object' ? data.stats : {};
  const equippedBySlot = data?.equippedBySlot && typeof data.equippedBySlot === 'object'
    ? data.equippedBySlot
    : {};
  const gearMechanics = [];
  const seenGearMechanics = new Set();
  for (const slot of CHARACTER_SLOT_ORDER) {
    const item = equippedBySlot?.[slot]?.item;
    const mechanics = Array.isArray(item?.mechanics) ? item.mechanics : [];
    for (const mechanic of mechanics) {
      const context = String(mechanic?.context || '').trim();
      const text = String(mechanic?.text || '').trim();
      if (!text || (context !== 'Equip' && context !== 'Enchant')) continue;
      const label = `${context} ${text}`;
      if (seenGearMechanics.has(label)) continue;
      seenGearMechanics.add(label);
      gearMechanics.push(label);
    }
  }
  const traits = Array.isArray(data?.traits) ? data.traits : [];
  const calendar = data?.calendar && typeof data.calendar === 'object' ? data.calendar : null;

  const title = document.createElement('div');
  title.textContent = `${playerName} \u00b7 Character Sheet`;
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  el.appendChild(title);

  if (calendar?.formatted) {
    const calendarCard = document.createElement('div');
    Object.assign(calendarCard.style, {
      marginBottom: '10px',
      padding: '8px 10px',
      border: UI.BORDER,
      borderRadius: UI.RADIUS,
      background: UI.DEFAULT_BG,
      fontSize: '13px',
      lineHeight: '1.4',
      color: SEASON_COLORS[String(calendar?.season || '')] || UI.TEXT,
      wordBreak: 'break-word',
    });
    const moonEmoji = String(calendar?.moonEmoji || '');
    const moonLabel = String(calendar?.moonLabel || '');
    calendarCard.textContent = `${moonEmoji ? `${moonEmoji} ` : ''}${String(calendar.formatted)}${moonLabel ? ` \u00b7 ${moonLabel}` : ''}`;
    el.appendChild(calendarCard);
  }

  const statCard = document.createElement('div');
  Object.assign(statCard.style, {
    padding: '8px',
    border: UI.BORDER,
    borderRadius: UI.RADIUS,
    background: UI.DEFAULT_BG,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '6px 12px',
    fontSize: '13px',
  });
  el.appendChild(statCard);

  function deltaColor(value, baseline = 0) {
    const n = Number(value || 0);
    if (n > baseline) return '#64c87a';
    if (n < baseline) return '#e06a6a';
    return null;
  }

  // [label, value, color|null]  — null = default text color
  const statRows = [
    ['Strength', `${Number(stats.strength || 0)}`, deltaColor(stats.strength)],
    ['Dexterity', `${Number(stats.dexterity || 0)}`, deltaColor(stats.dexterity)],
    ['Intelligence', `${Number(stats.intelligence || 0)}`, deltaColor(stats.intelligence)],
    ['Vitality', `${Number(stats.vitalityStat || 0)}`, deltaColor(stats.vitalityStat)],
    ['HP', `${Number(stats.hp || 0)}/${Number(stats.maxHp || 0)}`],
    ['Mana', `${Number(stats.mana || 0)}/${Number(stats.maxMana || 0)}`],
    ['Stamina', `${Number(stats.stamina || 0)}/${Number(stats.maxStamina || 0)}`],
    ['Attack', `${Number(stats.attack || 0)}`, deltaColor(stats.attack)],
    ['Defense', `${Number(stats.defense || 0)}`, deltaColor(stats.defense)],
    ['Accuracy', `${Number(stats.accuracy || 0)}`, deltaColor(stats.accuracy)],
    ['Damage Power', `${Number(stats.damagePower || 0)}`, deltaColor(stats.damagePower)],
    ['Evade', `${Number(stats.evade || 0)}`, deltaColor(stats.evade)],
    ['Mitigation', `${Number(stats.mitigation || 0)}`, deltaColor(stats.mitigation)],
    ['Spell Power', `${Number(stats.spellPower || 0)}`, deltaColor(stats.spellPower)],
    ['Armor Class', `${Number(stats.armorClass || 0)}`, deltaColor(stats.armorClass, 10)],
    ['Luck', `${Number(stats.luck || 0)}`, deltaColor(stats.luck)],
    ['Crit %', `${Number(stats.critChancePercent || 0).toFixed(1)}`, deltaColor(stats.critChancePercent)],
    ['Crit Mult', `\u00d7${(2 + Number(stats.critMult || 0)).toFixed(1)}`, deltaColor(stats.critMult)],
    ['Dmg Bonus', `${Number(stats.damageFlatBonus || 0)}`, deltaColor(stats.damageFlatBonus)],
    ['Mana Regen', `${Number(stats.manaRegen || 0).toFixed(2)}/t`, deltaColor(stats.manaRegenDerived)],
    ['Stam Regen', `${Number(stats.staminaRegen || 0).toFixed(1)}/t`, deltaColor(stats.staminaRegenDerived)],
    ['Carry', `${Number(stats.carryWeight || 0).toFixed(1)}/${Number(stats.carryLimit || 0).toFixed(1)} kg · ${humanize(String(stats.carryState || 'unburdened'))}`],
    ['Max HP Bonus', `${Number(stats.maxHpDerived || 0)}`, deltaColor(stats.maxHpDerived)],
    ['Speed', `${Number(stats.speed || 1)}`, deltaColor(stats.speed, 1) === '#64c87a' ? '#e06a6a' : deltaColor(stats.speed, 1) === '#e06a6a' ? '#64c87a' : null],
    ['Gold', `${Number(stats.gold || 0)}`],
    ['Hunger', `${humanize(String(stats.hungerLevel || 'normal'))} (${Number(stats.hunger || 0)})`],
    ['Depth', `${Number(stats.depth || 0)}`],
    ['Turn', `${Number(stats.turn || 0)}`],
  ];
  for (const [label, value, color] of statRows) {
    const row = document.createElement('div');
    const lbl = document.createElement('span');
    lbl.textContent = `${label}: `;
    const val = document.createElement('span');
    val.textContent = value;
    if (color) val.style.color = color;
    row.appendChild(lbl);
    row.appendChild(val);
    statCard.appendChild(row);
  }

  // Resistances — only show non-zero entries
  const resistRows = [
    ['Kinetic DR', Number(stats.kineticDR || 0)],
    ['Fire Resist', Number(stats.fireResist || 0)],
    ['Cold Resist', Number(stats.coldResist || 0)],
    ['Poison Resist', Number(stats.poisonResist || 0)],
    ['Acid Resist', Number(stats.acidResist || 0)],
    ['Rad Resist', Number(stats.radiationResist || 0)],
    ['Elec Resist', Number(stats.electricResist || 0)],
    ['Blunt Resist', Number(stats.bluntResist || 0)],
    ['Slash Resist', Number(stats.slashResist || 0)],
    ['Pierce Resist', Number(stats.pierceResist || 0)],
  ].filter(([, v]) => v !== 0);

  if (resistRows.length) {
    const resistHeader = document.createElement('div');
    resistHeader.textContent = 'Resistances';
    resistHeader.style.marginTop = '10px';
    resistHeader.style.fontWeight = 'bold';
    el.appendChild(resistHeader);

    const resistCard = document.createElement('div');
    Object.assign(resistCard.style, {
      marginTop: '6px',
      padding: '8px',
      border: UI.BORDER,
      borderRadius: UI.RADIUS,
      background: UI.DEFAULT_BG,
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '6px 12px',
      fontSize: '13px',
    });
    for (const [label, v] of resistRows) {
      const row = document.createElement('div');
      const lbl = document.createElement('span');
      lbl.textContent = `${label}: `;
      const val = document.createElement('span');
      val.textContent = `${v}`;
      val.style.color = deltaColor(v) || UI.TEXT;
      row.appendChild(lbl);
      row.appendChild(val);
      resistCard.appendChild(row);
    }
    el.appendChild(resistCard);
  }

  if (traits.length > 0) {
    const traitsTitle = document.createElement('div');
    traitsTitle.textContent = 'Traits';
    traitsTitle.style.marginTop = '10px';
    traitsTitle.style.fontWeight = 'bold';
    el.appendChild(traitsTitle);

    const traitsCard = document.createElement('div');
    Object.assign(traitsCard.style, {
      marginTop: '6px',
      padding: '8px',
      border: UI.BORDER,
      borderRadius: UI.RADIUS,
      background: UI.DEFAULT_BG,
      fontSize: '13px',
    });
    for (const t of traits) {
      const row = document.createElement('div');
      row.style.marginBottom = '4px';
      const lbl = document.createElement('span');
      lbl.textContent = String(t.label || t.key || '');
      lbl.style.color = '#ffd966';
      lbl.style.fontWeight = 'bold';
      const desc = document.createElement('span');
      desc.textContent = ` \u2014 ${String(t.description || '')}`;
      desc.style.opacity = '0.85';
      row.appendChild(lbl);
      row.appendChild(desc);
      traitsCard.appendChild(row);
    }
    el.appendChild(traitsCard);
  }

  const effectsTitle = document.createElement('div');
  effectsTitle.textContent = 'Gear Effects';
  effectsTitle.style.marginTop = '10px';
  effectsTitle.style.fontWeight = 'bold';
  el.appendChild(effectsTitle);

  const effects = document.createElement('div');
  Object.assign(effects.style, {
    marginTop: '6px',
    padding: '8px',
    border: UI.BORDER,
    borderRadius: UI.RADIUS,
    background: UI.DEFAULT_BG,
    maxHeight: '24vh',
    overflowY: 'auto',
    fontSize: '13px',
  });
  if (!gearMechanics.length) {
    const empty = document.createElement('div');
    empty.textContent = '(none)';
    empty.style.opacity = '0.75';
    effects.appendChild(empty);
  } else {
    for (const label of gearMechanics) {
      const row = document.createElement('div');
      row.textContent = label;
      row.style.marginBottom = '4px';
      effects.appendChild(row);
    }
  }
  el.appendChild(effects);

  const actions = document.createElement('div');
  Object.assign(actions.style, {
    marginTop: '10px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  });
  const engraveBtn = document.createElement('button');
  engraveBtn.textContent = '\u270E Engrave';
  decorateButton(engraveBtn);
  engraveBtn.style.minHeight = '44px';
  engraveBtn.style.padding = '8px 12px';
  engraveBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('ui:engrave'));
  });
  actions.appendChild(engraveBtn);

  const spellBtn = document.createElement('button');
  spellBtn.textContent = '\u{1F9E0} Select Spell';
  decorateButton(spellBtn);
  spellBtn.style.minHeight = '44px';
  spellBtn.style.padding = '8px 12px';
  spellBtn.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('ui:openSpellPicker'));
  });
  actions.appendChild(spellBtn);

  const bugBtn = document.createElement('button');
  bugBtn.textContent = '\u{1F47E} Bug Report';
  decorateButton(bugBtn);
  bugBtn.style.minHeight = '44px';
  bugBtn.style.padding = '8px 12px';
  bugBtn.addEventListener('click', () => {
    const version = /** @type {any} */ (window).VERSION || 'unknown';
    const ua = navigator.userAgent;
    function openWithData(d) {
      const gearLines = (d?.gear || []).map(g => `  - ${g.slot}: ${g.name}`).join('\n') || '  (none)';
      const invLines = (d?.inv || []).map(i => `  - ${i}`).join('\n') || '  (none)';
      const effectsLine = (d?.effects || []).join(', ') || 'none';
      const s = d?.stats || {};
      const snapshot = d
        ? [
          `**Character:** ${d.playerName} (${d.playerClass})`,
          `**Seed:** ${d.seed ? (d.seed >>> 0).toString(16).toUpperCase() : '???'}`,
          `**Depth:** ${s.depth ?? '?'}  |  **Turn:** ${s.turn ?? '?'}`,
          `**HP:** ${s.hp}  |  **Mana:** ${s.mana}  |  **Stamina:** ${s.stamina}`,
          `**Attack:** ${s.attack}  |  **Defense:** ${s.defense}  |  **AC:** ${s.armorClass}  |  **Luck:** ${s.luck}`,
          `**Gold:** ${s.gold}  |  **Hunger:** ${s.hungerLevel}`,
          `**Active effects:** ${effectsLine}`,
          `**Gear:**\n${gearLines}`,
          `**Inventory:**\n${invLines}`,
        ].join('\n')
        : '(no game state available)';
      const body = encodeURIComponent(
        `**Steps to reproduce:**\n\n**Expected:**\n\n**Actual:**\n\n---\n\n<details>\n<summary>Game state snapshot</summary>\n\n**Version:** ${version}\n**Browser:** ${ua}\n\n${snapshot}\n</details>`
      );
      const title = encodeURIComponent('[Bug] ');
      window.open(
        `https://github.com/pjensen/JSHack/issues/new?title=${title}&body=${body}&labels=bug`,
        '_blank', 'noopener'
      );
    }
    const onData = (ev) => {
      window.removeEventListener('ui:bugReportData', onData);
      openWithData(ev?.detail);
    };
    window.addEventListener('ui:bugReportData', onData);
    try { window.dispatchEvent(new CustomEvent('ui:requestBugReportData')); } catch (e) {
      window.removeEventListener('ui:bugReportData', onData);
      openWithData(null);
    }
  });
  actions.appendChild(bugBtn);

  el.appendChild(actions);

  const hint = document.createElement('div');
  hint.style.marginTop = '8px';
  hint.style.opacity = '0.85';
  hint.textContent = 'Tab=Next tab \u00b7 I=Inventory \u00b7 E=Equipment \u00b7 Esc=Close';
  el.appendChild(hint);

  function onKey(e) {
    if (panel.style.display !== 'block') return;
    const k = e.key;
    if (k === 'Tab') {
      dispatchCharacterMenuTabCycle('character', e.shiftKey);
      e.preventDefault();
    }
    else if (k === 'i' || k === 'I') {
      window.dispatchEvent(new CustomEvent('ui:openInventory'));
      e.preventDefault();
    }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
    else if (k === 'e' || k === 'E') {
      window.dispatchEvent(new CustomEvent('ui:openEquipment'));
      e.preventDefault();
    }
  }

  installDetachableKeyHandler(panel, '_characterSheetDetach', (e) => onKey(e));
}

/** @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel @param {Record<string, any>|null} equippedBySlot @param {string|null} playerName @param {number} [scrollOfIdentifyId] @param {any} [encumbrance] */
export function renderEquipment(panel, equippedBySlot, playerName, scrollOfIdentifyId = 0, encumbrance = null) {
  const existingDetach = /** @type {any} */ (panel)._equipmentDetach;
  if (typeof existingDetach === 'function') {
    try { existingDetach(); } catch (e) { console.debug('[overlay] equipment detach failed:', e); }
  }

  const el = /** @type {HTMLDivElement} */ (/** @type {any} */ (panel)._inner);
  el.innerHTML = '';
  el.style.overflowX = 'hidden';
  el.style.overflowY = 'auto';
  el.style.width = 'min(880px, 92vw)';
  appendCharacterMenuTabs(el, 'equipment');

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
  const pn = String(playerName || 'Hero').trim() || 'Hero';
  title.textContent = `${pn} \u00b7 Equipment`;
  title.style.fontWeight = 'bold';
  title.style.fontSize = '15px';
  const equippedCount = CHARACTER_SLOT_ORDER.reduce((count, slot) => {
    const state = (equippedBySlot && typeof equippedBySlot === 'object') ? (equippedBySlot[slot] || {}) : {};
    return count + (state?.item ? 1 : 0);
  }, 0);
  const countChip = document.createElement('span');
  countChip.textContent = `${equippedCount}/${CHARACTER_SLOT_ORDER.length} equipped`;
  Object.assign(countChip.style, {
    flexShrink: '0',
    padding: '2px 7px',
    border: UI.BORDER,
    borderRadius: '999px',
    color: '#ad9f8d',
    background: 'rgba(23, 20, 17, 0.58)',
    fontSize: '11px',
  });
  header.appendChild(title);
  header.appendChild(countChip);
  el.appendChild(header);

  if (encumbrance?.limit > 0) {
    const carry = document.createElement('div');
    const state = encumbrance.overloaded ? 'overloaded'
      : encumbrance.heavilyLoaded ? 'burdened'
      : 'unburdened';
    carry.textContent = `Carry weight: ${Number(encumbrance.current || 0).toFixed(1)} / ${Number(encumbrance.limit).toFixed(1)} kg · ${state}`;
    carry.style.marginBottom = '8px';
    carry.style.fontSize = '12px';
    carry.style.color = encumbrance.overloaded ? '#e06a6a'
      : encumbrance.heavilyLoaded ? '#d9963b'
      : '#79c98a';
    el.appendChild(carry);
  }

  const _hideVal = (/** @type {any} */ (panel))._hideEmptySlots;
  let hideEmpty = _hideVal !== undefined ? _hideVal : true;
  const cbWrap = document.createElement('label');
  Object.assign(cbWrap.style, {
    display: 'flex', alignItems: 'center', gap: '6px',
    marginBottom: '8px', cursor: 'pointer', opacity: '0.85',
  });
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = hideEmpty;
  cb.style.cursor = 'pointer';
  cbWrap.appendChild(cb);
  cbWrap.appendChild(document.createTextNode('Hide Empty Slots'));
  el.appendChild(cbWrap);

  const rowsData = CHARACTER_SLOT_ORDER.map((slot) => {
    const state = (equippedBySlot && typeof equippedBySlot === 'object') ? (equippedBySlot[slot] || {}) : {};
    const item = state?.item && typeof state.item === 'object' ? state.item : null;
    return {
      slot,
      item,
      blocked: !!state?.blocked,
      reason: String(state?.reason || ''),
    };
  });

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '4px';
  const compact = window.innerWidth < 760;
  list.style.maxHeight = compact ? '28vh' : '56vh';
  list.style.overflowY = 'auto';
  list.style.overflowX = 'hidden';
  list.style.paddingRight = '2px';
  markScrollable(list);
  if (compact) list.style.overscrollBehavior = 'auto';

  const detail = document.createElement('div');
  Object.assign(detail.style, {
    padding: '8px',
    border: UI.BORDER,
    borderRadius: UI.RADIUS,
    background: UI.DEFAULT_BG,
    minHeight: '52px',
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
    minHeight: '44px',
    alignItems: 'center',
  });

  const hint = document.createElement('div');
  hint.style.opacity = '0.85';
  hint.style.fontSize = '11px';
  hint.style.lineHeight = '1.45';
  hint.textContent = 'Tab=Next menu \u00b7 Enter=Equip/Unequip \u00b7 I=Inventory \u00b7 C=Character \u00b7 Esc=Close';

  const layout = document.createElement('div');
  Object.assign(layout.style, {
    display: 'grid',
    gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.05fr) minmax(260px, 0.95fr)',
    gap: '10px',
    alignItems: 'start',
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
  layout.appendChild(list);
  layout.appendChild(side);
  el.appendChild(layout);

  function openInventoryForSlot(slotName) {
    const slotFilter = String(slotName || '').trim().toLowerCase();
    window.dispatchEvent(new CustomEvent('ui:openInventory', { detail: { slotFilter } }));
  }

  function openSpellPicker() {
    window.dispatchEvent(new CustomEvent('ui:openSpellPicker'));
  }


  const rows = rowsData.map((rowData, idx) => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '100%',
      padding: '6px 8px',
      boxSizing: 'border-box',
      background: UI.DEFAULT_BG,
      color: UI.TEXT,
      border: UI.BORDER,
      borderRadius: UI.RADIUS,
      cursor: 'pointer',
    });

    const slot = document.createElement('span');
    slot.style.opacity = '0.75';
    slot.style.minWidth = '84px';
    const slotText = humanize(rowData.slot);
    slot.textContent = slotText ? `${slotText.charAt(0).toUpperCase()}${slotText.slice(1)}:` : `${rowData.slot}:`;

    const name = document.createElement('span');
    name.style.flex = '1 1 auto';
    name.style.minWidth = '0';
    name.style.overflow = 'hidden';
    name.style.textOverflow = 'ellipsis';
    name.style.whiteSpace = 'nowrap';
    if (rowData.item) {
      const rs = rarityStyle(rowData.item.rarityName);
      name.textContent = bracketize(sanitize(rowData.item.name || rowData.item.description || rowData.item.type || 'item'));
      Object.assign(name.style, rs);
    } else {
      name.textContent = '(empty)';
      name.style.opacity = '0.65';
    }

    row.appendChild(slot);
    row.appendChild(name);
    const modifierIcons = [
      ...(Array.isArray(rowData.item?.socketedGems) ? rowData.item.socketedGems : []).map((gem) => ({
        id: gem?.iconId,
        label: gem?.name || 'Socketed gem',
      })),
      ...(Array.isArray(rowData.item?.mechanics) ? rowData.item.mechanics : [])
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
    if (rowData.item?.coating?.kind) {
      const dot = document.createElement('span');
      dot.textContent = '\u2022';
      dot.style.color = rowData.item.coating.color || '#66dd66';
      dot.style.fontSize = '14px';
      dot.title = `${humanize(rowData.item.coating.kind)} coated`;
      row.appendChild(dot);
    }
    if (rowData.blocked) {
      const blocked = document.createElement('span');
      blocked.textContent = rowData.reason ? `Blocked: ${rowData.reason}` : 'Blocked';
      blocked.style.fontSize = '11px';
      blocked.style.color = '#ffbf5a';
      row.appendChild(blocked);
    }

    row.addEventListener('click', () => setSel(idx, { revealDetail: compact }));
    list.appendChild(row);
    return row;
  });

  function applyFilter() {
    rowsData.forEach((rd, i) => {
      const empty = !rd.item && !rd.blocked;
      rows[i].style.display = (hideEmpty && empty) ? 'none' : 'flex';
    });
  }

  function findNextVisible(from, dir) {
    let i = from + dir;
    while (i >= 0 && i < rows.length) {
      if (rows[i].style.display !== 'none') return i;
      i += dir;
    }
    return null;
  }

  applyFilter();

  cb.addEventListener('change', () => {
    hideEmpty = cb.checked;
    (/** @type {any} */ (panel))._hideEmptySlots = hideEmpty;
    applyFilter();
    if (rows[sel]?.style.display === 'none') {
      const next = findNextVisible(sel, 1) ?? findNextVisible(sel, -1);
      if (next !== null) setSel(next);
    }
  });

  let sel = 0;
  const savedSlot = String((/** @type {any} */ (panel))._equipmentSelectionSlot || '');
  const savedIdx = rowsData.findIndex((row) => row.slot === savedSlot);
  if (savedIdx >= 0) sel = savedIdx;
  if (rows[sel]?.style.display === 'none') {
    const vis = findNextVisible(sel, 1) ?? findNextVisible(sel, -1);
    if (vis !== null) sel = vis;
  }

  function createActionButton(label, onClick, disabled = false) {
    const btn = document.createElement('button');
    btn.textContent = label;
    decorateButton(btn);
    btn.style.minHeight = '44px';
    btn.style.padding = '8px 12px';
    if (disabled) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    }
    btn.addEventListener('click', onClick);
    return btn;
  }

  function updateDetail() {
    const row = rowsData[sel];
    detail.innerHTML = '';
    actions.innerHTML = '';
    if (!row) return;

    (/** @type {any} */ (panel))._equipmentSelectionSlot = row.slot;

    const slotTitle = document.createElement('div');
    slotTitle.style.fontWeight = 'bold';
    slotTitle.style.marginBottom = '4px';
    const slotText = humanize(row.slot);
    slotTitle.textContent = slotText ? `${slotText.charAt(0).toUpperCase()}${slotText.slice(1)}` : row.slot;
    detail.appendChild(slotTitle);

    if (row.blocked) {
      const blockedLine = document.createElement('div');
      blockedLine.style.color = '#ffbf5a';
      blockedLine.style.marginBottom = '4px';
      blockedLine.textContent = row.reason ? `Blocked: ${row.reason}` : 'Blocked';
      detail.appendChild(blockedLine);
    }

    if (row.item) {
      if (row.slot === 'brain') {
        const itemBody = document.createElement('div');
        detail.appendChild(itemBody);
        renderItemDetails(itemBody, row.item);
        actions.appendChild(createActionButton('Change Spell', () => {
          openSpellPicker();
        }));
      } else {
        const itemBody = document.createElement('div');
        detail.appendChild(itemBody);
        renderItemDetails(itemBody, row.item);
      }
      if (row.slot !== 'brain' && Number.isInteger(row.item.id) && row.item.id > 0) {
        actions.appendChild(createActionButton('Unequip', () => {
          pulseRow(rows[sel], 'unequip');
          window.dispatchEvent(new CustomEvent('ui:requestEquip', { detail: { itemId: row.item.id } }));
        }));
        if (row.item.identified === false) {
          const hasScroll = scrollOfIdentifyId > 0;
          actions.appendChild(createActionButton('Identify', () => {
            if (hasScroll) {
              window.dispatchEvent(new CustomEvent('ui:requestApply', {
                detail: { toolId: scrollOfIdentifyId, targetItemId: row.item.id },
              }));
            }
          }, !hasScroll));
        }
      }
      hideItemTooltip();
    } else {
      const empty = document.createElement('div');
      empty.textContent = '(nothing equipped)';
      empty.style.opacity = '0.75';
      detail.appendChild(empty);
      const canEquip = !row.blocked;
      if (row.slot === 'brain') {
        actions.appendChild(createActionButton('Choose Spell', () => {
          openSpellPicker();
        }));
      } else {
        actions.appendChild(createActionButton('Equip', () => {
          openInventoryForSlot(row.slot);
        }, !canEquip));
      }
      hideItemTooltip();
    }

  }

  function setSel(next, opts = {}) {
    sel = Math.max(0, Math.min(rowsData.length - 1, next | 0));
    rows.forEach((row, i) => {
      row.style.outline = (i === sel) ? UI.SEL_OUTLINE : 'none';
      row.style.background = (i === sel) ? UI.SEL_BG : UI.DEFAULT_BG;
    });
    rows[sel]?.scrollIntoView({ block: 'nearest' });
    updateDetail();
    if (opts?.revealDetail) {
      side.scrollIntoView({ block: 'nearest' });
    }
  }

  function onKey(e) {
    if (panel.style.display !== 'block') return;
    if (e.target === cb) return;
    const k = e.key;
    if (k === 'Tab') { dispatchCharacterMenuTabCycle('equipment', e.shiftKey); e.preventDefault(); }
    else if (k === 'ArrowUp') { const n = findNextVisible(sel, -1); if (n !== null) setSel(n); e.preventDefault(); }
    else if (k === 'ArrowDown') { const n = findNextVisible(sel, 1); if (n !== null) setSel(n); e.preventDefault(); }
    else if (k === 'Home') { const n = findNextVisible(-1, 1); if (n !== null) setSel(n); e.preventDefault(); }
    else if (k === 'End') { const n = findNextVisible(rowsData.length, -1); if (n !== null) setSel(n); e.preventDefault(); }
    else if (k === 'Enter' || k === 'e' || k === 'E') {
      const row = rowsData[sel];
      if (row?.slot === 'brain') {
        openSpellPicker();
        e.preventDefault();
      } else if (Number.isInteger(row?.item?.id) && row.item.id > 0) {
        pulseRow(rows[sel], 'unequip');
        window.dispatchEvent(new CustomEvent('ui:requestEquip', { detail: { itemId: row.item.id } }));
        e.preventDefault();
      } else if (row && !row.blocked) {
        openInventoryForSlot(row.slot);
        e.preventDefault();
      }
    }
    else if (k === 'i' || k === 'I') {
      window.dispatchEvent(new CustomEvent('ui:openInventory'));
      e.preventDefault();
    }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
    else if (k === 'c' || k === 'C') {
      window.dispatchEvent(new CustomEvent('ui:openCharacter'));
      e.preventDefault();
    }
  }

  setSel(sel);
  installDetachableKeyHandler(panel, '_equipmentDetach', (e) => onKey(e));
}
