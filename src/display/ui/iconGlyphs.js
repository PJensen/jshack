// display/ui/iconGlyphs.js
// Shared UI glyph contracts. Do not normalize emoji presentation or add font-specific rendering hacks here.

export const UI_ACTION_GLYPHS = Object.freeze({
  character: '@',
  bag: '\u{1F392}',
  cast: '\u2726',
  spells: '\u{1F4D6}',
  shoot: '\u{1F3F9}',
  attack: '\u2694',
  zap: '\u26A1',
  pray: '\u{1F64F}',
  door: '\u{1F6AA}',
  postureBalanced: '\u2696',
  postureAggressive: '\u2694',
  postureGuarded: '\u{1F6E1}',
  wait: '\u23F3',
  search: '\u{1F50D}',
  bug: '\u{1F47E}',
  petDefault: '\u{1F43E}',
});

export const UI_PET_STATE_GLYPHS = Object.freeze({
  following: '\u{1F43E}',
  staying: '\u2693',
  fetching: '\u{1F9B4}',
  returning: '\u21A9',
  guarding: '\u{1F6E1}\uFE0F',
  aggressive: '\u2694\uFE0F',
  fleeing: '\u{1F4A8}',
  idle: '\u{1F4A4}',
});

export const CHARACTER_MENU_TAB_GLYPHS = Object.freeze({
  character: '@',
  inventory: '\u{1F392}',
  equipment: '\u{1F6E1}\uFE0F',
  quests: '\u{1F4DC}',
  settings: '\u2699\uFE0F',
});

export const CHARACTER_SHEET_GLYPHS = Object.freeze({
  strength: '♜',
  dexterity: '➶',
  intelligence: '▤',
  vitality: '❖',
  health: '♥',
  mana: '◆',
  stamina: 'ϟ',
  damage: '⚔',
  accuracy: '◎',
  avoidance: '➹',
  armor: '♜',
  critical: '✹',
  criticalStrike: '✹',
  spellPower: '✦',
  damagePower: '⚔',
  mitigation: '♜',
  luck: '♧',
  critMultiplier: '✹',
  damageBonus: '⚔',
  carry: '◇',
  maxHpBonus: '♥',
  speed: '➹',
  gold: '◉',
  hunger: '♨',
  depth: '▼',
  turn: '↻',
});
