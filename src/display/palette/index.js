// display/palette/index.js
// Build the final palette from base + equipment + any optional packs

import { basePalette } from './base.js';
import { equipmentPalette } from './equipment.js';

// Non-creature entries in basePalette that should not get auto-generated corpse entries.
const _CORPSE_SKIP_PREFIXES = [
  'player', 'corpse_',
  'floor', 'grass', 'water', 'mountain', 'tree', 'wall', 'door', 'stair',
  'church_', 'potion_', 'spellbook_', 'book_', 'scroll_', 'return_', 'rift_', 'ammo_',
  'food_', 'reagent_', 'ore_', 'material_', 'gem_', 'trap_',
];
const _CORPSE_SKIP_KEYS = new Set([
  'gold', 'monster', 'bone', 'breadcrumb', 'engraving', 'spawner', 'tombstone',
  'chest', 'mill_chest', 'smithy_chest', 'lumber_chest', 'herb_chest', 'tavern_chest',
  'bed_home', 'house_sign', 'alchemy_bench', 'enchanting_bench',
  'berry_bush', 'herb_patch', 'thorn_bramble', 'venom_fern', 'moonleaf_cluster', 'ember_root_patch', 'venom_spores',
  'anvil', 'anvil_active', 'furnace', 'furnace_unlit', 'cooking_fire',
  'crop_wheat', 'crop_carrot', 'crop_corn',
  'well', 'scarecrow', 'tavern_keg', 'tavern_table',
  'tavern_bench', 'tavern_pillar', 'tavern_sign', 'millstone', 'millstone_active', 'smithy_sign',
  'apothecary_sign', 'enchanter_shop_sign', 'gem_shop_sign', 'gem_display_case', 'message_board',
  'farmland', 'fence', 'roof_thatch_shadow', 'roof_thatch_lit',
  'roof_thatch_shadow_charred', 'roof_thatch_lit_charred',
  'fountain', 'altar', 'runestone', 'shrine', 'statue', 'sarcophagus',
  'pillar', 'weapon_rack', 'mushrooms', 'web', 'torch',
  'urn', 'ashes',
  'armor_stand', 'polished_mirror', 'glowcap_patch', 'web_mote_cluster',
  'candle_cluster', 'ember_brazier', 'dark_reliquary', 'void_crack', 'mist_vent',
  'portcullis', 'portcullis_raised', 'chain_winch', 'flood_gate_wheel',
  'drain_throat', 'steam_vent', 'steam_blast', 'pressure_plinth',
  'pressure_plinth_pressed', 'bone_chime_rack',
  'lantern', 'hearthstone',
  'seed_wheat', 'seed_carrot', 'seed_corn',
]);

export function buildPalette() {
  const merged = { ...basePalette, ...equipmentPalette };

  // Auto-generate corpse entries: any creature in basePalette gets a '%' entry
  // that inherits its fg/glow. New monsters are handled automatically.
  for (const [k, v] of Object.entries(basePalette)) {
    if (_CORPSE_SKIP_KEYS.has(k)) continue;
    if (!v.fg) continue; // skip composite-only (layers) entries
    if (_CORPSE_SKIP_PREFIXES.some(p => k.startsWith(p))) continue;
    if (!merged[`corpse_${k}`]) {
      merged[`corpse_${k}`] = { glyph: '%', fg: v.fg, glow: v.glow };
    }
  }

  return merged;
}
