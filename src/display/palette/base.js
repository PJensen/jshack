// display/palette/base.js
// Base palette for tiles, actors, and common symbols (display-only)

// ── Item scale constants ──────────────────────────────────────────
export const S_POTION   = 0.65;
export const S_SCROLL   = 0.7;
export const S_WAND     = 0.7;
export const S_AMMO     = 0.6;
export const S_FOOD     = 0.65;
export const S_REAGENT  = 0.55;
export const S_GEM      = 0.5;
export const S_STONE    = 0.5;
export const S_ORE      = 0.6;
export const S_RING     = 0.45;
export const S_AMULET   = 0.55;
export const S_WEAPON_S = 0.65; // daggers, knives
export const S_WEAPON_M = 0.8;  // swords, maces, axes
export const S_WEAPON_L = 0.9;  // bows, staves, 2H
export const S_ARMOR    = 0.85;
export const S_HELM     = 0.7;
export const S_GLOVES   = 0.6;
export const S_BELT     = 0.6;
export const S_BOOTS    = 0.65;
export const S_LEGS     = 0.75;
export const S_SHIELD   = 0.85;

const OVERWORLD_GRASS_BG = "#1e3214";

export const basePalette = {
  // Actors
  player:         { glyph: "@", fg: "#e8f7ff", glow: "#6cf" },
  player_druid:   { glyph: "@", fg: "#7ecc5a", glow: "#4a9030" },
  player_warden:  { glyph: "@", fg: "#e85050", glow: "#a03030" },
  player_outlaw:  { glyph: "@", fg: "#d4a0ff", glow: "#9060cc" },
  player_cleric:  { glyph: "@", fg: "#ffe066", glow: "#cca830" },
  player_archeologist: { glyph: "@", fg: "#d2a064", glow: "#8a6030" },
  player_warlock:  { glyph: "@", fg: "#b366ff", glow: "#8833cc" },
  player_mireborn: { glyph: "@", fg: "#40c8a0", glow: "#208060" },
  player_mage:     { glyph: "@", fg: "#ff8833", glow: "#cc5500" },
  player_pilgrim:  { glyph: "@", fg: "#f0f0ff", glow: "#aaaadd" },
  player_valkyrie: { glyph: "@", fg: "#d7e3f1", glow: "#8f9fb2" },
  monster: { glyph: "m", fg: "#ffb0a0", glow: "#f66" },  // fallback
  // Tiles
  floor: { glyph: ".", fg: "#446", glow: "#224", bg: "#1a1c28" },
  grass_a:  { glyph: "'", fg: "#cce07a", glow: "#8ab850", bg: "#2a3a1a" },  // sparse/bare
  grass:    { glyph: ",", fg: "#90c858", glow: "#5a9038", bg: OVERWORLD_GRASS_BG },  // light
  grass_c:  { glyph: ";", fg: "#6aaa42", glow: "#447828", bg: "#182c10" },  // medium
  grass_d:  { glyph: "`", fg: "#94c04e", glow: "#5a8030", bg: "#223616" },  // thick/lush
  water:        { glyph: "~", fg: "#5ea8d4", glow: "#3a6a90", bg: "#0e2a3a" },  // shallow water
  water_deep:   { glyph: "≈", fg: "#1a4070", glow: "#0a1f40", bg: "#010810" },  // deep ocean
  beach:        { glyph: "░", fg: "#e8d4a0", glow: "#c8a878", bg: "#8a7860" },  // sandy shore
  marsh:        { glyph: "✿", fg: "#7a9a6a", glow: "#5a7a4a", bg: "#4a6a3a" },  // wet grassy
  swamp:        { glyph: "≈", fg: "#5a8a6a", glow: "#3a6a4a", bg: "#2a5a3a" },  // boggy vegetation
  bog:          { glyph: "≈", fg: "#4a7a5a", glow: "#2a5a3a", bg: "#1a3a2a" },  // peat bog
  sand_dunes:   { glyph: "◊", fg: "#e8c860", glow: "#c8a840", bg: "#9a7a38" },  // desert dunes
  mud:          { glyph: "▓", fg: "#7a6a5a", glow: "#5a4a3a", bg: "#4a3a2a" },  // mudflats
  tidal_flat:   { glyph: "▫", fg: "#d8c8a8", glow: "#a89878", bg: "#8a7860" },  // tidal zone
  rocky_shore:  { glyph: "*", fg: "#a9a9a9", glow: "#6a6a6a", bg: "#4a4a4a" },  // rocky beach
  kelp_forest:  { glyph: "≋", fg: "#4a8a8a", glow: "#2a6a6a", bg: "#0a3a4a" },  // kelp beds
  salt_marsh:   { glyph: "▒", fg: "#8aaa8a", glow: "#6a8a6a", bg: "#3a6a3a" },  // salt grass
  shingle:      { glyph: "◌", fg: "#c0b0a0", glow: "#8a7a68", bg: "#6a5a48" },  // pebble shore
  seagrass:     { glyph: "✿", fg: "#6a9a8a", glow: "#4a7a6a", bg: "#1a4a3a" },  // seagrass shallow
  moorland:     { glyph: "¨", fg: "#9a8a7a", glow: "#6a5a4a", bg: "#4a3a2a" },  // open moor
  scrubland:    { glyph: "≈", fg: "#8aaa6a", glow: "#6a8a4a", bg: "#4a6a2a" },  // scrub brush
  badlands:     { glyph: "≈", fg: "#d8a878", glow: "#c87840", bg: "#8a5830" },  // eroded clay
  gravel:       { glyph: "▫", fg: "#b0a8a0", glow: "#7a7268", bg: "#5a5248" },  // gravel plains
  pine_forest:  { glyph: "🌲", fg: "#3a6a3a", glow: "#1a4a1a", bg: "#2a4a2a" },  // pine forest
  palm_forest:  { glyph: "🌴", fg: "#4a8a4a", glow: "#2a6a2a", bg: "#1a5a1a" },  // palm forest
  mangrove:     { glyph: "≈", fg: "#5a8a7a", glow: "#3a6a5a", bg: "#2a5a4a" },  // mangrove
  coral_reef:   { glyph: "◇", fg: "#e8a868", glow: "#d87840", bg: "#4a3a2a" },  // coral shallow
  lava:       { glyph: "≈", fg: "#ff8b36", glow: "#8f2e10", bg: "#3a1008" },
  mountain:   { glyph: "⛰", fg: "#9da0a4", glow: "#5a5d61", bg: "#2a2c2e" },  // foothills
  mountain_b: { glyph: "∧", fg: "#bec1c4", glow: "#6e7174", bg: "#343638" },  // mid-peak
  mountain_c: { glyph: "▲", fg: "#e0e3e6", glow: "#969ea4", bg: "#3e4042" },  // high-peak
  tree: { glyph: "🌲", fg: "#3f7b3d", glow: "#275026", bg: OVERWORLD_GRASS_BG },
  farmland:  { glyph: "░", fg: "#8b7355", glow: "#5a4a38", bg: "#302818" },
  fence:     { glyph: "f", fg: "#a08050", glow: "#6b5530", bg: "#1e3214" },
  roof_thatch_shadow: { glyph: "▓", fg: "#9c7f2c", glow: "#6b5418", bg: "#4a3c14" },
  roof_thatch_lit:    { glyph: "▓", fg: "#d8bf5a", glow: "#9d8221", bg: "#6b5418" },
  roof_thatch_shadow_charred: { glyph: "▓", fg: "#6c5530", glow: "#3b2410", bg: "#3a2a14" },
  roof_thatch_lit_charred:    { glyph: "▓", fg: "#b98642", glow: "#6f3210", bg: "#5a3c18" },
  wall: { glyph: "#", fg: "#99a", glow: "#667", bg: "#222328" },
  door_closed: { glyph: "+", fg: "#cc9", glow: "#aa7", bg: "#1a1c28" },
  door_open: { glyph: "/", fg: "#cc9", glow: "#aa7", bg: "#1a1c28" },
  stair_down: { glyph: ">", fg: "#ccc", glow: "#888", bg: "#1a1c28" },
  stair_up:   { glyph: "<", fg: "#ccc", glow: "#888", bg: "#1a1c28" },
  gold: { glyph: "$", fg: "#ffde5a", glow: "#fc6", baseScale: 0.7 },
  // Potions
  potion:             { glyph: "!", fg: "#8fd7ff", glow: "#6bc7ff", baseScale: S_POTION },
  potion_health:      { glyph: "!", fg: "#66ff99", glow: "#5cff9a", baseScale: S_POTION },
  potion_vigor:       { glyph: "!", fg: "#ff4466", glow: "#cc2244", baseScale: S_POTION },
  potion_endurance:   { glyph: "!", fg: "#ffcc33", glow: "#cc9900", baseScale: S_POTION },
  potion_second_wind: { glyph: "!", fg: "#44ddee", glow: "#22aacc", baseScale: S_POTION },
  potion_adrenaline:  { glyph: "!", fg: "#ff8822", glow: "#cc5500", baseScale: S_POTION },
  potion_mana:        { glyph: "!", fg: "#6fa7ff", glow: "#4872d1", baseScale: S_POTION },
  potion_poison:      { glyph: "!", fg: "#84d26d", glow: "#4a8f3f", baseScale: S_POTION },
  potion_water:       { glyph: "!", fg: "#8fd7ff", glow: "#4f97be", baseScale: S_POTION },
  potion_holy_water:  { glyph: "!", fg: "#fff2b0", glow: "#d7b457", baseScale: S_POTION },
  potion_stoneskin:   { glyph: "!", fg: "#b0b3be", glow: "#6f7485", baseScale: S_POTION },
  potion_resist_fire:     { glyph: "!", fg: "#ff9a5c", glow: "#cc5a2e", baseScale: S_POTION },
  potion_resist_poison:   { glyph: "!", fg: "#9bdc7a", glow: "#6ca84f", baseScale: S_POTION },
  potion_anti_venom:      { glyph: "!", fg: "#c2f28d", glow: "#7eb34a", baseScale: S_POTION },
  potion_resist_electric: { glyph: "!", fg: "#8fd0f2", glow: "#5d97b7", baseScale: S_POTION },
  potion_resist_acid:     { glyph: "!", fg: "#d4f06c", glow: "#94b33f", baseScale: S_POTION },
  potion_sickness:        { glyph: "!", fg: "#b89a66", glow: "#7d6440", baseScale: S_POTION },
  potion_paralysis:       { glyph: "!", fg: "#ccaa88", glow: "#997744", baseScale: S_POTION },
  potion_hallucination:   { glyph: "!", fg: "#dd77dd", glow: "#aa44aa", baseScale: S_POTION },
  potion_blindness:       { glyph: "!", fg: "#555566", glow: "#333344", baseScale: S_POTION },
  potion_weakness:        { glyph: "!", fg: "#99887a", glow: "#665544", baseScale: S_POTION },
  potion_confusion:       { glyph: "!", fg: "#ddaa55", glow: "#aa7722", baseScale: 0.65 },
  potion_echoing_focus:   { glyph: "!", fg: "#d28cff", glow: "#8c4fc4", baseScale: S_POTION },
  // Spellbooks
  spellbook_fire: { glyph: "?", fg: "#ff704d", glow: "#ff704d", baseScale: 0.7 },
  spellbook_ice: { glyph: "?", fg: "#4da6ff", glow: "#4da6ff", baseScale: 0.7 },
  spellbook_lightning: { glyph: "?", fg: "#ffff66", glow: "#ffff66", baseScale: 0.7 },
  // Scrolls
  scroll_mapping: { glyph: "?", fg: "#eeddaa", glow: "#ccbb88", baseScale: 0.7 },
  scroll_blastwave: { glyph: "?", fg: "#ffa333", glow: "#dd8811", baseScale: 0.7 },
  scroll_homecoming: { glyph: "?", fg: "#9fe8ff", glow: "#62b7d5", baseScale: 0.7 },
  scroll_heal: { glyph: "?", fg: "#66ff99", glow: "#44bb66", baseScale: 0.7 },
  scroll_summon_skeleton: { glyph: "?", fg: "#ddd8c8", glow: "#aaa590", baseScale: 0.7 },
  scroll_identify: { glyph: "?", fg: "#ccddff", glow: "#99aacc", baseScale: 0.7 },
  scroll_remove_curse: { glyph: "?", fg: "#ffe066", glow: "#ccb844", baseScale: 0.7 },
  scroll_amnesia: { glyph: "?", fg: "#bb77dd", glow: "#8844aa", baseScale: 0.7 },
  scroll_cursing: { glyph: "?", fg: "#884444", glow: "#662222", baseScale: 0.7 },
  scroll_summoning: { glyph: "?", fg: "#ff66ff", glow: "#cc33cc", baseScale: 0.7 },
  scroll_decay: { glyph: "?", fg: "#8a7a5a", glow: "#5a4a32", baseScale: 0.7 },
  scroll_fire: { glyph: "?", fg: "#ff4444", glow: "#cc0000", baseScale: 0.7 },
  scroll_aggravation: { glyph: "?", fg: "#ff6655", glow: "#cc3322", baseScale: 0.7 },
  scroll_genocide: { glyph: "?", fg: "#cc2244", glow: "#991133", baseScale: 0.7 },
  scroll_teleportation: { glyph: "?", fg: "#66eeff", glow: "#33bbcc", baseScale: 0.7 },
  scroll_polymorph: { glyph: "?", fg: "#dd77ff", glow: "#aa44cc", baseScale: 0.7 },
  scroll_taming: { glyph: "?", fg: "#88cc88", glow: "#55aa55", baseScale: 0.7 },
  scroll_enchant_poison:     { glyph: "?", fg: "#88cc44", glow: "#558822", baseScale: S_SCROLL },
  scroll_enchant_fire:       { glyph: "?", fg: "#ff8833", glow: "#cc5500", baseScale: S_SCROLL },
  scroll_enchant_frost:      { glyph: "?", fg: "#88ccff", glow: "#4488cc", baseScale: S_SCROLL },
  scroll_enchant_flame_ward: { glyph: "?", fg: "#ffcc66", glow: "#cc9933", baseScale: S_SCROLL },
  scroll_enchant_venom_ward: { glyph: "?", fg: "#aaddaa", glow: "#77aa77", baseScale: S_SCROLL },
  scroll_enchant_fortified:  { glyph: "?", fg: "#c8ccd0", glow: "#8890a0", baseScale: S_SCROLL },
  return_portal: { glyph: "O", fg: "#7bd6ff", glow: "#3f98bb" },
  rift_portal: { glyph: "◇", fg: "#d67bff", glow: "#7b3fbb" },
  // Aliases to match rules identity so they render on the ground
  book_lightning: { glyph: "?", fg: "#ffff66", glow: "#ffff66", baseScale: 0.7 },
  book_meteor: { glyph: "?", fg: "#ff704d", glow: "#ff704d", baseScale: 0.7 },
  book_blastwave: { glyph: "?", fg: "#ffa333", glow: "#ffa333", baseScale: 0.7 },
  book_frost: { glyph: "?", fg: "#4da6ff", glow: "#4da6ff", baseScale: 0.7 },
  book_frost_nova: { glyph: "?", fg: "#8fd6ff", glow: "#66cfff", baseScale: 0.7 },
  book_fear: { glyph: "?", fg: "#bb44dd", glow: "#7722aa", baseScale: 0.7 },
  book_blizzard: { glyph: "?", fg: "#8fd6ff", glow: "#8fd6ff", baseScale: 0.7 },
  book_firestorm: { glyph: "?", fg: "#ff8a3d", glow: "#ff8a3d", baseScale: 0.7 },
  spellbook_dark: { glyph: "?", fg: "#b366ff", glow: "#b366ff", baseScale: 0.7 },
  spellbook_healing: { glyph: "?", fg: "#66ff99", glow: "#66ff99", baseScale: 0.7 },
  spellbook_summoning: { glyph: "?", fg: "#ff66ff", glow: "#ff66ff", baseScale: 0.7 },
  spellbook_earth: { glyph: "?", fg: "#cc9966", glow: "#cc9966", baseScale: 0.7 },
  book_blink: { glyph: "?", fg: "#66eeff", glow: "#33bbcc", baseScale: 0.7 },
  book_earthshatter: { glyph: "?", fg: "#cc9966", glow: "#996633", baseScale: 0.7 },
  book_heal: { glyph: "?", fg: "#66ff99", glow: "#44bb66", baseScale: 0.7 },
  book_blind: { glyph: "?", fg: "#9966cc", glow: "#663399", baseScale: 0.7 },
  book_verdant_ward: { glyph: "⁂", fg: "#9ee486", glow: "#5ca94a", baseScale: 0.7 },
  book_harmony_ward: { glyph: "☯", fg: "#d8d38a", glow: "#7aa8e0", baseScale: 0.7 },
  book_shadow_veil: { glyph: "⌇", fg: "#b78cff", glow: "#6b4ab2", baseScale: 0.7 },
  book_flash_heal:      { glyph: "?", fg: "#ffffff", glow: "#cceecc", baseScale: 0.7 },
  book_smite:           { glyph: "?", fg: "#ffe080", glow: "#ccaa40", baseScale: 0.7 },
  book_summon_skeleton: { glyph: "?", fg: "#c8c8ff", glow: "#8888cc", baseScale: 0.7 },
  book_shadow_bolt:     { glyph: "?", fg: "#cc66ff", glow: "#8833cc", baseScale: 0.7 },
  book_agony:           { glyph: "?", fg: "#aa33cc", glow: "#660088", baseScale: 0.7 },
  book_drain_life:      { glyph: "?", fg: "#e05a76", glow: "#8b2538", baseScale: 0.7 },
  book_rampage:         { glyph: "?", fg: "#ff4444", glow: "#cc2222", baseScale: 0.7 },
  book_phase_strike:    { glyph: "?", fg: "#66ccff", glow: "#2299cc", baseScale: 0.7 },
  book_scorch:          { glyph: "?", fg: "#ff7700", glow: "#cc4400", baseScale: 0.7 },
  book_homecoming:      { glyph: "?", fg: "#88aaff", glow: "#4466cc", baseScale: 0.7 },
  book_hearthstone:     { glyph: "?", fg: "#bb8855", glow: "#885522", baseScale: 0.7 },
  book_iron_flesh:      { glyph: "?", fg: "#aab0b8", glow: "#6a7080", baseScale: 0.7 },
  book_bloodthirst:     { glyph: "?", fg: "#cc3333", glow: "#881818", baseScale: 0.7 },
  book_cleave:          { glyph: "?", fg: "#dd7744", glow: "#aa4422", baseScale: 0.7 },
  book_war_cry:         { glyph: "?", fg: "#ff6655", glow: "#cc3322", baseScale: 0.7 },
  book_barkskin:        { glyph: "?", fg: "#8bc76a", glow: "#5a8840", baseScale: 0.7 },
  book_thorn_burst:     { glyph: "?", fg: "#cc5577", glow: "#882244", baseScale: 0.7 },
  book_entangle:        { glyph: "?", fg: "#55bb55", glow: "#338833", baseScale: 0.7 },
  book_quicken:         { glyph: "?", fg: "#eedd55", glow: "#bbaa22", baseScale: 0.7 },
  book_poison_blade:    { glyph: "?", fg: "#77cc44", glow: "#448822", baseScale: 0.7 },
  book_smoke_bomb:      { glyph: "?", fg: "#99aabb", glow: "#667788", baseScale: 0.7 },
  book_mark_of_death:   { glyph: "?", fg: "#bb44dd", glow: "#7722aa", baseScale: 0.7 },
  book_ignite_weapons:  { glyph: "?", fg: "#ff9944", glow: "#cc6622", baseScale: 0.7 },
  book_fireball:        { glyph: "?", fg: "#ff6633", glow: "#cc3311", baseScale: 0.7 },
  book_primal_roar:     { glyph: "?", fg: "#ddaa33", glow: "#aa7718", baseScale: 0.7 },
  book_plague_swarm:    { glyph: "?", fg: "#88bb33", glow: "#557722", baseScale: 0.7 },
  book_divine_shield:   { glyph: "?", fg: "#ffdd88", glow: "#ccaa44", baseScale: 0.7 },
  book_purify:          { glyph: "?", fg: "#eeeeff", glow: "#aaaacc", baseScale: 0.7 },
  book_consecrate:      { glyph: "?", fg: "#ffcc55", glow: "#cc9922", baseScale: 0.7 },
  book_magic_missile:   { glyph: "?", fg: "#c888ff", glow: "#8844cc", baseScale: 0.7 },
  book_arcane_barrage:  { glyph: "?", fg: "#dda6ff", glow: "#9955dd", baseScale: 0.7 },
  book_void_hole:       { glyph: "?", fg: "#9a5cff", glow: "#4a1688", baseScale: 0.7 },
  book_arcane_bolt:     { glyph: "?", fg: "#cc88ff", glow: "#8844cc", baseScale: 0.7 },
  book_evocation:       { glyph: "?", fg: "#88bbff", glow: "#4477cc", baseScale: 0.7 },
  book_dead: { glyph: "?", fg: "#888888", glow: "#555555", baseScale: 0.7 },

  // Wands
  wand_lightning: { glyph: "/", fg: "#ffff66", glow: "#cccc33", baseScale: 0.7 },
  wand_meteor: { glyph: "/", fg: "#ff704d", glow: "#cc3322", baseScale: 0.7 },
  wand_frost: { glyph: "/", fg: "#4da6ff", glow: "#2277cc", baseScale: 0.7 },
  wand_heal: { glyph: "/", fg: "#66ff99", glow: "#44bb66", baseScale: 0.7 },
  wand_stasis: { glyph: "/", fg: "#d0d0ff", glow: "#9090cc", baseScale: 0.7 },
  glacier_sigil: { glyph: "❄", fg: "#9fdcff", glow: "#5b97c8", baseScale: 0.7 },
  conduction_lens: { glyph: "◉", fg: "#e0d88f", glow: "#a08f47", baseScale: 0.7 },
  echo_grimoire: { glyph: "📘", fg: "#b7b0ff", glow: "#7268cc", baseScale: 0.7 },

  // Ammo
  ammo_arrows: { glyph: "/", fg: "#c4a46c", glow: "#a08050", baseScale: 0.6 },
  ammo_fire_arrows: { glyph: "/", fg: "#ff6a33", glow: "#ff4400", baseScale: 0.6 },
  ammo_piercing_arrows: { glyph: "/", fg: "#bfc8d6", glow: "#6d7685", baseScale: 0.6 },
  ammo_bodkin_arrows: { glyph: "/", fg: "#d0d4db", glow: "#8b929d", baseScale: 0.6 },
  ammo_blunt_arrows: { glyph: "/", fg: "#b89b72", glow: "#8f6f45", baseScale: 0.6 },
  ammo_bomb_arrows: { glyph: "/", fg: "#ffcc33", glow: "#bb7711", baseScale: 0.6 },

  // Pets
  kitty: { glyph: "f", fg: "#ffcc88", glow: "#cc9955" },
  familiar: { glyph: "f", fg: "#b366ff", glow: "#8833cc" },

  // NPCs
  shopkeeper:          { glyph: "@", fg: "#c47bff", glow: "#9955cc" },
  townfolk_farmer:     { glyph: "@", fg: "#8bc34a", glow: "#558b2f" },
  townfolk_woodcutter: { glyph: "@", fg: "#a1887f", glow: "#6d4c41" },
  townfolk_miner:      { glyph: "@", fg: "#90a4ae", glow: "#546e7a" },
  townfolk_smith:      { glyph: "@", fg: "#ff8a65", glow: "#d84315" },
  townfolk_priest:     { glyph: "@", fg: "#ce93d8", glow: "#8e24aa" },
  townfolk_barkeep:    { glyph: "@", fg: "#ffb74d", glow: "#e65100" },
  townfolk_villager:   { glyph: "@", fg: "#a5d6a7", glow: "#388e3c" },
  townfolk_mason:      { glyph: "@", fg: "#bcaaa4", glow: "#795548" },
  townfolk_herbalist:  { glyph: "@", fg: "#81c784", glow: "#2e7d32" },
  townfolk_alchemist:  { glyph: "@", fg: "#80deea", glow: "#00838f" },
  townfolk_enchantress: { glyph: "@", fg: "#d8b8ff", glow: "#7f5ac8" },
  townfolk_fisher:     { glyph: "@", fg: "#64b5f6", glow: "#1565c0" },
  townfolk_gem_vendor: { glyph: "@", fg: "#8fdcff", glow: "#3ea0d4" },
  townfolk_book_vendor: { glyph: "@", fg: "#d4a76a", glow: "#8b6914" },
  townfolk_general_vendor: { glyph: "@", fg: "#c8a87a", glow: "#7a5c2e" },

  // Containers
  chest:            { glyph: "]", fg: "#c8a050", glow: "#a07830" },
  basic_chest:      { glyph: "]", fg: "#c8a050", glow: "#a07830" },
  magic_chest:      { glyph: "]", fg: "#b070e8", glow: "#7030c0" },
  epic_chest:       { glyph: "]", fg: "#d672ff", glow: "#9a42c7" },
  legendary_chest:  { glyph: "]", fg: "#ffd040", glow: "#e08010" },
  mill_chest:      { glyph: "]", fg: "#d9b55a", glow: "#9f6c1d" },
  smithy_chest:    { glyph: "]", fg: "#caa27a", glow: "#8a5e34" },
  lumber_chest:    { glyph: "]", fg: "#b88752", glow: "#7c4f22" },
  bed_home: {
    layers: [
    { glyph: "┌", fg: "#965a5a", glow: "#aaaaaa", dx: -0.21, dy: -0.07, scale: 0.75 },
    { glyph: "┐", fg: "#9e6767", glow: "#aaaaaa", dx: 0.27, dy: -0.04, scale: 0.68 },
    { glyph: "▬", fg: "#7b6345", glow: "#5a4a3a", dx: 0.03, dy: -0.03, scale: 1.5 },
    { glyph: "▪", fg: "#d8d4cb", glow: "#a09080", dx: -0.14, dy: -0.06, scale: 0.75 },
    ]
  },
  house_sign:  { glyph: "!", fg: "#d8c08a", glow: "#8b6f3f" },
  audio_sign:  { glyph: "!", fg: "#ffe066", glow: "#ccaa00" },
  alchemy_bench: { glyph: "⚗", fg: "#93def6", glow: "#4f7fa1" },
  enchanting_bench: { glyph: "✧", fg: "#d8b8ff", glow: "#7f5ac8" },
  potion_shelf:  { glyph: "=", fg: "#7986cb", glow: "#3949ab" },
  herb_chest:    { glyph: "]", fg: "#66bb6a", glow: "#2e7d32" },
  tavern_chest:   { glyph: "]", fg: "#d7a15d", glow: "#8f5225" },
  apothecary_sign: { glyph: "⚗", fg: "#b39ddb", glow: "#7e57c2" },
  enchanter_shop_sign: { glyph: "✧", fg: "#d8b8ff", glow: "#7f5ac8" },
  gem_shop_sign: { glyph: "💎", fg: "#bdefff", glow: "#68bde2" },
  book_shop_sign: { glyph: "📖", fg: "#d4a76a", glow: "#8b6914" },
  general_store_sign: { glyph: "⚖", fg: "#d8c08a", glow: "#8b6f3f" },
  gem_display_case: { glyph: "◇", fg: "#d7f3ff", glow: "#75b8d2" },
  message_board: { glyph: "🪧", fg: "#d8c08a", glow: "#8b6f3f" },
  mailbox: { glyph: "📪", fg: "#d8e8ff", glow: "#6f96c8", baseScale: 0.9 },
  mailbox_checking: { glyph: "📭", fg: "#d8e8ff", glow: "#6f96c8", baseScale: 0.9 },
  mailbox_has_mail: { glyph: "📬", fg: "#eaf4ff", glow: "#82addc", baseScale: 0.9 },
  mailbox_sent: { glyph: "📫", fg: "#d8e8ff", glow: "#6f96c8", baseScale: 0.9 },
  berry_bush: { glyph: "❀", fg: "#8b4ea9", glow: "#5a2d75" },
  herb_patch: { glyph: "✿", fg: "#63a85f", glow: "#3e6b3c" },
  fishing_spot: { glyph: "◌", fg: "#7fe6ff", glow: "#1b9fc2", baseScale: 0.8 },
  fishing_spot_depleted: { glyph: "·", fg: "#4b7d8c", glow: "#244954", baseScale: 0.65 },
  thorn_bramble: { glyph: "☘", fg: "#7ea157", glow: "#415b2e" },
  venom_fern: { glyph: "☣", fg: "#a5d95c", glow: "#648431" },
  moonleaf_cluster: {
    layers: [
    { glyph: ")", fg: "#0f3e36", glow: "#aaaaaa", dx: 0.03, dy: 0.4, scale: 0.45 },
    { glyph: "✺", fg: "#165f8d", glow: "#aaaaaa", dx: -0.01, dy: 0.05 },
    { glyph: "●", fg: "#5b5393", glow: "#aaaaaa", dx: -0.01, dy: 0.03, scale: 0.2 },
    ]
  },

  ember_root_patch: { glyph: "♨", fg: "#d57b3a", glow: "#9a3f14" },
  venom_spores: { glyph: "◌", fg: "#9dd46f", glow: "#5f8d3c" },
  // Mining nodes — filled = ore present, hollow = vein exhausted
  ore_vein_iron:  { glyph: "◈", fg: "#c0754a", glow: "#8a3e1e" },
  ore_vein_coal:  { glyph: "◈", fg: "#3a3a3a", glow: "#1a1a1a" },
  ore_vein_stone: { glyph: "◈", fg: "#8a8e93", glow: "#555a5e" },
  ore_vein_iron_exhausted:  { glyph: "◇", fg: "#c0754a", glow: "#8a3e1e" },
  ore_vein_coal_exhausted:  { glyph: "◇", fg: "#3a3a3a", glow: "#1a1a1a" },
  ore_vein_stone_exhausted: { glyph: "◇", fg: "#8a8e93", glow: "#555a5e" },
  // Bare soil left behind by a harvested plant node
  harvest_node_bare: { glyph: "·", fg: "#7a6550", glow: "#5a4a38" },
  // Crafting stations
  anvil:        { glyph: "⚒", fg: "#9aacba", glow: "#4a6070" },
  anvil_active: { glyph: "⚒", fg: "#ffd08a", glow: "#ff7a18" },
  furnace:       { glyph: "🫕", fg: "#ff8533", glow: "#cc4400" },
  furnace_unlit: { glyph: "🫕", fg: "#8a6040", glow: "#553320" },
  cooking_fire: { glyph: "♨", fg: "#ff9944", glow: "#dd5500" },
  // Tree harvest stages
  tree_stump:    { glyph: ".", fg: "#8b6914", glow: "#5a4a10", bg: OVERWORLD_GRASS_BG },
  tree_sapling:  { glyph: "🌱", fg: "#5a9040", glow: "#3a6020", bg: OVERWORLD_GRASS_BG },
  tree_harvest:  { glyph: "🌳", fg: "#2d8b2d", glow: "#1a5a1a", bg: OVERWORLD_GRASS_BG },
  // Growth stage glyphs
  farmland_tilled: { glyph: "⁙", fg: "#8b7355", glow: "#5a4a38" },
  seedling:      { glyph: "🌱", fg: "#7ecc5a", glow: "#4a9030" },
  herb_growing:  { glyph: "🌿", fg: "#63a85f", glow: "#3e6b3c" },
  // Overworld structures
  crop_wheat:    { glyph: "🌾", fg: "#d4a830", glow: "#a07820" },
  crop_carrot:   { glyph: "🥕", fg: "#7ecc5a", glow: "#4a9030" },
  crop_corn:     { glyph: "🌽", fg: "#e8c820", glow: "#b89a10" },
  well:          { glyph: "O", fg: "#7799bb", glow: "#445566" },
  scarecrow:     { glyph: "T", fg: "#b89070", glow: "#7a5a3a" },
  tavern_keg:    { glyph: "o", fg: "#8b5a2b", glow: "#5a3a1a" },
  tavern_table:  { glyph: "═", fg: "#a08050", glow: "#6b5530" },
  tavern_bench:  { glyph: "▭", fg: "#9a7040", glow: "#6a4a28" },
  tavern_pillar: { glyph: "□", fg: "#8a7a6a", glow: "#5a4a3a" },
  tavern_sign:   { glyph: "🍺", fg: "#d4a830", glow: "#a07820" },
  millstone:     { glyph: "◎", fg: "#9a9a9a", glow: "#5a5a5a" },
  millstone_active: { glyph: "◉", fg: "#d8d2b0", glow: "#b08a3a" },
  cobblestone:   { glyph: "·", fg: "#8a8e93", glow: "#555a5e", bg: "#2a2c30" },
  ice:           { glyph: "∙", fg: "#c8e8ff", glow: "#6ab8ff", bg: "#1a4a7a" },  // slippery ice
  pit:           { glyph: "🕳️", fg: "#111118", glow: "#000000", bg: "#1a1a1a" },  // open pit
  // Church
  church_altar:  { glyph: "⛩", fg: "#cc99ff", glow: "#9966cc" },
  church_pew:    { glyph: "▭", fg: "#8a6040", glow: "#5a3a28" },
  church_sign:   { glyph: "†", fg: "#d8c08a", glow: "#8b6f3f" },
  smithy_sign:   { glyph: "⚒", fg: "#d8c08a", glow: "#8b6f3f" },
  church_font:   { glyph: "⛲", fg: "#88bbff", glow: "#4477cc" },
  church_window: { glyph: "✦", fg: "#ff88cc", glow: "#cc44aa" },
  window_arched:     { glyph: "⌐", fg: "#aabbcc", glow: "#667799" },
  window_iron_grate: { glyph: "⊞", fg: "#8899aa", glow: "#556677" },
  window_shuttered:  { glyph: "⊟", fg: "#b89060", glow: "#7a5a38" },
  window_round:      { glyph: "◎", fg: "#99bbdd", glow: "#5588aa" },
  window_rect:       { glyph: "█", fg: "#88bbee", glow: "#5588bb" },
  bell:          { glyph: "🔔", fg: "#d4a017", glow: "#8b6914" },
  // Garden flowers (full-color emoji)
  flower_rose:       { glyph: "🌹", fg: "#ff3344", glow: "#cc1122" },
  flower_sunflower:  { glyph: "🌻", fg: "#ffdd33", glow: "#ccaa11" },
  flower_tulip:      { glyph: "🌷", fg: "#ff66aa", glow: "#cc3388" },
  flower_daisy:      { glyph: "🌼", fg: "#ffeeaa", glow: "#ccbb77" },
  flower_bluebell:   { glyph: "🌸", fg: "#7799ff", glow: "#4466cc" },
  // Town decorations
  barrel:        { glyph: "🛢️", fg: "#a07040", glow: "#6a4828" },
  crate: { glyph: "📦", fg: "#a07040", glow: "#6a4828" },
  
  // {
  //   layers: [
  //     { glyph: "□", fg: "#5f4228", glow: "#3a2818", scale: 0.92 },
  //     { glyph: "╳", fg: "#b08858", glow: "#6a5030", scale: 0.76 },
  //     { glyph: "▪", fg: "#7a5634", glow: "#4a3020", dy: 0.01, scale: 0.42 },
  //   ],
  // }
  
  woodpile:      { glyph: "≡", fg: "#8b6840", glow: "#5a4028" },
  hay_bale:      { glyph: "▓", fg: "#d4b44a", glow: "#a08828" },
  lantern_post:  { glyph: "♦", fg: "#ffcc55", glow: "#cc9922" },
  lantern_post_unlit: { glyph: "♦", fg: "#665533", glow: "#332211" },
  rain_barrel:   { glyph: "U", fg: "#7a8a94", glow: "#4a5a64" },
  wheelbarrow: {
    layers: [
    { glyph: "-", fg: "#120707", glow: "#aaaaaa", dx: -0.27, scale: 0.96 },
    { glyph: "-", fg: "#000000", glow: "#aaaaaa", dx: 0.35, dy: 0.23, scale: 0.6 },
    { glyph: "-", fg: "#000000", glow: "#aaaaaa", dx: 0.34, dy: -0.24, scale: 0.6 },
    { glyph: "■", fg: "#702929", glow: "#aaaaaa", dx: 0.01, dy: -0.03, scale: 0.72 },
    { glyph: "⊂", fg: "#b84c4c", glow: "#aaaaaa", dx: 0.01, dy: 0.04, scale: 1.39 },
    ]
  },
  market_stall:  { glyph: "⌂", fg: "#c4a060", glow: "#8a6830" },
  bench: {
    layers: [
      { glyph: "▬", fg: "#6b4a2c", glow: "#aaaaaa", dy: 0.064, scale: 1.18 },
      { glyph: "┄", fg: "#7a5e5e", glow: "#aaaaaa", dy: 0.016, scale: 0.9 },
    ]
  },
  // Natural features
  boulder:       { glyph: "●", fg: "#8a8e93", glow: "#5a5e63" },
  fallen_log:    { glyph: "═", fg: "#6a5a3a", glow: "#3a2a18" },
  lily_pad:      { glyph: "◌", fg: "#5aaa4a", glow: "#3a7a2a" },
  cattail:       { glyph: "|", fg: "#7a9a5a", glow: "#4a6a32" },
  // Garden features
  birdbath:      { glyph: "⊙", fg: "#99aabb", glow: "#667788" },
  trellis:       { glyph: "⊞", fg: "#7a9a5a", glow: "#4a6a32" },

  // Room features
  fountain:    { glyph: "⛲", fg: "#66bbee", glow: "#3388aa" },
  altar:       { glyph: "⛩", fg: "#cc99ff", glow: "#9966cc" },
  shrine:      { glyph: "⛫", fg: "#ffdd66", glow: "#ccaa33" },
  runestone:   { glyph: "ᚱ", fg: "#88bbff", glow: "#4477cc" },
  statue:      { glyph: "🗿", fg: "#ccccdd", glow: "#9999ab" },
  sarcophagus: { glyph: "⚰", fg: "#aaa8a0", glow: "#777570" },
  pillar:      { glyph: "#", fg: "#b0a8c0",  glow: "#706880" },
  weapon_rack: { glyph: "⚔", fg: "#bbbbcc", glow: "#888899" },
  armor_stand: { glyph: "♜", fg: "#c8d0d8", glow: "#8a96a0" },
  polished_mirror: { glyph: "◫", fg: "#e0e8ff", glow: "#9aa8d0" },
  mushrooms:   { glyph: "`", fg: "#88cc88", glow: "#558855" },
  mushrooms_picked: { glyph: " " },
  glowcap_patch: { glyph: "`", fg: "#70e0c8", glow: "#35a890" },
  web_mote_cluster: { glyph: "⁘", fg: "#8bd6ff", glow: "#4a9ac0" },
  web:         { glyph: "🕸", fg: "#c8c8c8", glow: "#888888" },
  torch:       { glyph: "╻", fg: "#ffaa44", glow: "#ff6600" },
  urn:         { glyph: "⚱", fg: "#c8a060", glow: "#8a6030" },
  candle_cluster: { glyph: "⋮", fg: "#ffe1a0", glow: "#d08a3a" },
  ember_brazier: { glyph: "♨", fg: "#ff8a44", glow: "#cc4420" },
  flayed_man:  { glyph: "╳", fg: "#3a2213", glow: "#aaaaaa" },
  hanging_chains: { glyph: "⛓", fg: "#8f9299", glow: "#aaaaaa" },
  dark_reliquary: { glyph: "▣", fg: "#7c5a92", glow: "#3a234f" },
  void_crack: { glyph: "⌁", fg: "#6b4c88", glow: "#2b173e" },
  portcullis: { glyph: "⛓", fg: "#98a0aa", glow: "#5a6470" },
  portcullis_raised: { glyph: "┬", fg: "#98a0aa", glow: "#5a6470" },
  chain_winch: { glyph: "⚙", fg: "#c0c7cf", glow: "#7b838c" },
  flood_gate_wheel: { glyph: "◍", fg: "#76b9d9", glow: "#3f7996" },
  drain_throat: { glyph: "⊚", fg: "#72808c", glow: "#47535f" },
  steam_vent: { glyph: "≋", fg: "#cfd8dd", glow: "#9eb3bf" },
  mist_vent: { glyph: "∵", fg: "#88d8e8", glow: "#4f9aaa" },
  pressure_plinth: { glyph: "▣", fg: "#9f8f76", glow: "#6f5f46" },
  pressure_plinth_pressed: { glyph: "▣", fg: "#d1bf8f", glow: "#8a7445" },
  bone_chime_rack: { glyph: "#", fg: "#c8c2b4", glow: "#8e8678" },
  steam_blast: { glyph: "≋", fg: "#dce7ed", glow: "#9eb3bf" },
  effigy:      { glyph: "🎯", fg: "#dd4422", glow: "#882211" },

  // Tombstones (player death markers)
  tombstone: { glyph: "†", fg: "#888888", glow: "#444444" },

  // Decorative dungeon books
  book_kitty:      { glyph: "📖", fg: "#ffcc88", glow: "#cc9955" },
  book_snakes:     { glyph: "📖", fg: "#55aa44", glow: "#338822" },
  book_spikes:     { glyph: "📖", fg: "#a84000", glow: "#d65d1f" },
  book_touchstone: { glyph: "📖", fg: "#aaaaaa", glow: "#888888" },
  book_corpses:    { glyph: "📖", fg: "#b89070", glow: "#a06030" },
  book_gridbugs:   { glyph: "📖", fg: "#bb66ff", glow: "#44ccff" },

  // Traps (revealed after triggering)
  trap_spike: { glyph: "^", fg: "#a84000", glow: "#d65d1f" },
  trap_snake: { glyph: "^", fg: "#55aa44", glow: "#338822" },
  trap_shock: { glyph: "^", fg: "#66ddff", glow: "#2299cc" },
  trap_pit: { glyph: "🕳️", fg: "#111118", glow: "#000000" },
  trap_siphon: { glyph: "^", fg: "#8a7dff", glow: "#5345bb" },
  trap_rust: { glyph: "^", fg: "#c7793d", glow: "#864824" },
  trap_swarm: { glyph: "^", fg: "#8dbb55", glow: "#527a2d" },
  trap_arrow: { glyph: "^", fg: "#d6c48a", glow: "#8a7134" },
  // Tier 0 (snake — spawned by snake traps)
  snake:    { glyph: "S", fg: "#55aa44", glow: "#338822" },

  // Spawners (monster nests)
  spawner: { glyph: "◍", fg: "#8b4513", glow: "#663311" },

  // Food & Rations
  food_ration:      { glyph: "%", fg: "#c4a46c", glow: "#a08050", baseScale: 0.65 },
  food_iron_ration: { glyph: "%", fg: "#d4b87c", glow: "#b09860", baseScale: 0.65 },
  food_wild_berries: { glyph: ":", fg: "#b476d7", glow: "#7a4c96", baseScale: 0.55 },
  food_wild_herbs:   { glyph: ";", fg: "#73c56f", glow: "#4f8b4c", baseScale: 0.55 },
  food_raw_fish:     { glyph: "%", fg: "#9fd8e7", glow: "#4e8fa0", baseScale: 0.62 },
  food_golden_carp:  { glyph: "%", fg: "#ffd24d", glow: "#c48a16", baseScale: 0.68 },
  food_moonfin:      { glyph: "%", fg: "#d7e6ff", glow: "#6f8fd6", baseScale: 0.68 },
  fishing_kelp:      { glyph: ";", fg: "#4fb67a", glow: "#2f7654", baseScale: 0.58 },
  junk_soggy_boot:   { glyph: ")", fg: "#6e5b48", glow: "#3e3328", baseScale: 0.62 },
  food_mushrooms:    { glyph: "`", fg: "#c8b898", glow: "#8a7a5a" },
  reagent_thorn_pod: { glyph: "✶", fg: "#a08f63", glow: "#6f6242", baseScale: 0.55 },
  reagent_venom_frond: { glyph: "☤", fg: "#9ccc69", glow: "#5f8d3c", baseScale: 0.55 },
  reagent_moonleaf: { glyph: "❋", fg: "#d7e3ff", glow: "#8292c4", baseScale: 0.55 },
  reagent_ember_root:    { glyph: "♢", fg: "#e09a54", glow: "#9a4f1d", baseScale: S_REAGENT },
  reagent_spider_leg:    { glyph: ")", fg: "#606060", glow: "#303030", baseScale: S_REAGENT },
  reagent_venom_gland:   { glyph: "◍", fg: "#aacc44", glow: "#6a8820", baseScale: S_REAGENT },
  reagent_resin:         { glyph: "◍", fg: "#d4a040", glow: "#9a6c18", baseScale: S_REAGENT },
  reagent_bone_dust:     { glyph: "∴", fg: "#ddd8c0", glow: "#b0ac90", baseScale: S_REAGENT },
  reagent_ectoplasm:     { glyph: "◎", fg: "#88ddcc", glow: "#44aa88", baseScale: S_REAGENT },
  reagent_rune_fragment: { glyph: "◈", fg: "#cc88ff", glow: "#8844cc", baseScale: S_REAGENT },
  reagent_frost_core:    { glyph: "◆", fg: "#99ddff", glow: "#44aadd", baseScale: S_REAGENT },
  reagent_beast_claw:    { glyph: ")", fg: "#c8a870", glow: "#8a6840", baseScale: S_REAGENT },
  reagent_cursed_thread: { glyph: "~", fg: "#884488", glow: "#552255", baseScale: S_REAGENT },
  food_wheat:    { glyph: "%", fg: "#d4a830", glow: "#a07820", baseScale: 0.65 },
  food_carrot:   { glyph: "%", fg: "#7ecc5a", glow: "#4a9030", baseScale: 0.65 },
  food_corn:     { glyph: "%", fg: "#e8c820", glow: "#b89a10", baseScale: 0.65 },
  // Ore items (dropped from mining nodes)
  ore_iron:  { glyph: "≡", fg: "#b86840", glow: "#7a3a18", baseScale: 0.6 },
  ore_coal:  { glyph: "■", fg: "#404040", glow: "#202020", baseScale: 0.6 },
  material_iron: { glyph: "▬", fg: "#bfc7cf", glow: "#6d7c89", baseScale: 0.6 },
  ore_stone: { glyph: "▪", fg: "#878b90", glow: "#50565c", baseScale: 0.6 },
  // Town economy goods
  food_flour:      { glyph: "%", fg: "#e8dcc0", glow: "#b8ac90", baseScale: 0.65 },
  food_cornmeal:   { glyph: "%", fg: "#e8c860", glow: "#b89030", baseScale: 0.65 },
  food_stew:       { glyph: "%", fg: "#c88a4a", glow: "#8a5a2a", baseScale: 0.65 },
  fuel_firewood:   { glyph: "≡", fg: "#a07040", glow: "#6a4828", baseScale: 0.65 },
  material_lumber: { glyph: "≡", fg: "#b88a52", glow: "#7c5222", baseScale: 0.65 },
  water_bucket:    { glyph: "🪣", fg: "#6a9ab4", glow: "#3a6a84", baseScale: 0.65 },
  tool_hatchet:    { glyph: ")", fg: "#a0a0a0", glow: "#707070", baseScale: 0.75 },
  tool_kitchen_knife: { glyph: ")", fg: "#c0c0c0", glow: "#888888", baseScale: 0.7 },
  // Seeds
  seed_wheat:   { glyph: "∙", fg: "#c8b060", glow: "#8a7a30", baseScale: 0.5 },
  seed_carrot:  { glyph: "∙", fg: "#e09040", glow: "#a06020", baseScale: 0.5 },
  seed_corn:    { glyph: "∙", fg: "#e8c820", glow: "#b89a10", baseScale: 0.5 },
  // Misc tools 
  lantern:      { glyph: "🕯", fg: "#ffcc55", glow: "#cc9922", baseScale: 0.7 },
  hearthstone:  { glyph: "◆", fg: "#bb8855", glow: "#885522", baseScale: 0.6 },
  breadcrumb:   { glyph: "·", fg: "#f3c86a", glow: "#9d6b2c", baseScale: 0.55 },

  // Corpses: auto-generated by buildPalette() — all monsters inherit their fg/glow with '%' glyph.
  bone:                { glyph: "(", fg: "#e8e4d4", glow: "#b0a890", baseScale: 0.55 },
  ashes:               { glyph: "∴", fg: "#888888", glow: "#555555", baseScale: 0.45 },
  ash:                 { glyph: "∴", fg: "#888888", glow: "#555555", baseScale: 0.45 },
  glass_shards:        { glyph: "∴", fg: "#c8e8ff", glow: "#88b0d0", baseScale: 0.45 },
  corpse_pet:          { glyph: "%", fg: "#ffcc88", glow: "#cc9955" }, // fallback for pets without a monster def

  // Engravings
  engraving: { glyph: "~", fg: "#8899aa", glow: "#556677" },

  // ── Gems (gemstones) ────────────────────────────────────────────
  gem_dilithium:   { glyph: "*", fg: "#ffffff", glow: "#ccccff", baseScale: 0.5 },
  gem_diamond:     { glyph: "*", fg: "#ffffff", glow: "#eeeeff", baseScale: 0.5 },
  gem_ruby:        { glyph: "*", fg: "#ff3333", glow: "#cc1111", baseScale: 0.5 },
  gem_jacinth:     { glyph: "*", fg: "#ff8833", glow: "#dd6611", baseScale: 0.5 },
  gem_sapphire:    { glyph: "*", fg: "#3366ff", glow: "#2244cc", baseScale: 0.5 },
  gem_black_opal:  { glyph: "*", fg: "#333344", glow: "#5555aa", baseScale: 0.5 },
  gem_emerald:     { glyph: "*", fg: "#33dd33", glow: "#22aa22", baseScale: 0.5 },
  gem_turquoise:   { glyph: "*", fg: "#44ccaa", glow: "#339988", baseScale: 0.5 },
  gem_citrine:     { glyph: "*", fg: "#ffee44", glow: "#ddcc22", baseScale: 0.5 },
  gem_aquamarine:  { glyph: "*", fg: "#44ddff", glow: "#22bbdd", baseScale: 0.5 },
  gem_amber:       { glyph: "*", fg: "#cc8833", glow: "#aa6622", baseScale: 0.5 },
  gem_topaz:       { glyph: "*", fg: "#cc9933", glow: "#aa7722", baseScale: 0.5 },
  gem_jet:         { glyph: "*", fg: "#222233", glow: "#444466", baseScale: 0.5 },
  gem_opal:        { glyph: "*", fg: "#eeddff", glow: "#ccbbdd", baseScale: 0.5 },
  gem_chrysoberyl: { glyph: "*", fg: "#dddd44", glow: "#bbbb22", baseScale: 0.5 },
  gem_garnet:      { glyph: "*", fg: "#cc3344", glow: "#aa2233", baseScale: 0.5 },
  gem_amethyst:    { glyph: "*", fg: "#aa44ff", glow: "#8822dd", baseScale: 0.5 },
  gem_jasper:      { glyph: "*", fg: "#cc4433", glow: "#aa3322", baseScale: 0.5 },
  gem_fluorite:    { glyph: "*", fg: "#88ff88", glow: "#66dd66", baseScale: 0.5 },
  gem_jade:        { glyph: "*", fg: "#55bb55", glow: "#449944", baseScale: 0.5 },
  gem_obsidian:    { glyph: "*", fg: "#222222", glow: "#555577", baseScale: 0.5 },
  gem_agate:       { glyph: "*", fg: "#ee8844", glow: "#cc6633", baseScale: 0.5 },

  // ── Worthless glass ─────────────────────────────────────────────
  glass_white:     { glyph: "*", fg: "#dddddd", glow: "#aaaaaa", baseScale: 0.5 },
  glass_blue:      { glyph: "*", fg: "#3366dd", glow: "#2244aa", baseScale: 0.5 },
  glass_red:       { glyph: "*", fg: "#dd3333", glow: "#aa1111", baseScale: 0.5 },
  glass_brown:     { glyph: "*", fg: "#aa7733", glow: "#885522", baseScale: 0.5 },
  glass_orange:    { glyph: "*", fg: "#dd7733", glow: "#bb5522", baseScale: 0.5 },
  glass_yellow:    { glyph: "*", fg: "#dddd33", glow: "#bbbb22", baseScale: 0.5 },
  glass_black:     { glyph: "*", fg: "#333333", glow: "#555555", baseScale: 0.5 },
  glass_green:     { glyph: "*", fg: "#33bb33", glow: "#229922", baseScale: 0.5 },
  glass_violet:    { glyph: "*", fg: "#9933dd", glow: "#7722bb", baseScale: 0.5 },

  // ── Gray stones & rocks ─────────────────────────────────────────
  stone_luckstone:  { glyph: "`", fg: "#999999", glow: "#777777", baseScale: 0.5 },
  stone_loadstone:  { glyph: "`", fg: "#888888", glow: "#666666", baseScale: 0.5 },
  stone_touchstone: { glyph: "`", fg: "#aaaaaa", glow: "#888888", baseScale: 0.5 },
  stone_flint:      { glyph: "`", fg: "#777777", glow: "#555555", baseScale: 0.5 },
  stone_rock:       { glyph: "`", fg: "#666666", glow: "#444444", baseScale: 0.5 },

  // Miscellaneous items
  tent:           { glyph: "⛺", fg: "#c48a50", glow: "#7a4a28" },
  scale:          { glyph: "⚖", fg: "#d0b070", glow: "#806030" },

  // Fallback
  default: { glyph: "•", fg: "#cfe8ff", glow: "#6cf" }
};

/**
 * Register content-DSL palette entries at runtime.
 * @param {Record<string, { glyph?: string, fg?: string, glow?: string, baseScale?: number }>} entries
 */
export function registerPaletteEntries(entries) {
  for (const [key, entry] of Object.entries(entries)) {
    if (!basePalette[key]) basePalette[key] = entry;
  }
}
