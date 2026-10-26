// rules/utils/itemFactory.js
// Centralized item creation by ID. Single source of truth for spawning items.

import { createFrom } from '../../lib/ecs-js/archetype.js';
import { buildCatalogItem } from '../data/itemCatalogLoader.js';
import { ITEM_CATALOG, getCatalogItem } from '../data/itemCatalog.js';
import * as gems from '../data/gems.js';
import { ItemInfo } from '../components/ItemInfo.js';

// Archetypes
import { GoldStack, HealthPotion, ArrowsStack, FireArrowsStack, PiercingArrowsStack, BodkinArrowsStack, BluntHeadArrowsStack, ChalkArrowsStack, ScrollOfMapping, GemItem, Bone } from '../archetypes/Items.js';
import {
  Ration, IronRation, WildBerries, WildHerbs,
  DungeonMushrooms, Wheat, Carrot, Corn,
} from '../archetypes/Food.js';

let _SIMPLE_ITEM_ARCHETYPES = null;

/**
 * Centralized item creation registry.
 * Maps item identity strings to their archetype constructors.
 * Lazily built so circular import paths can load Food.js before reading
 * Food archetype bindings.
 */
function simpleItemArchetypes() {
  if (_SIMPLE_ITEM_ARCHETYPES) return _SIMPLE_ITEM_ARCHETYPES;
  _SIMPLE_ITEM_ARCHETYPES = {
    'gold': GoldStack,
    'potion_health': HealthPotion,
    'ammo_arrows': ArrowsStack,
    'ammo_fire_arrows': FireArrowsStack,
    'ammo_piercing_arrows': PiercingArrowsStack,
    'ammo_bodkin_arrows': BodkinArrowsStack,
    'ammo_blunt_arrows': BluntHeadArrowsStack,
    'ammo_chalk_arrows': ChalkArrowsStack,
    'scroll_mapping': ScrollOfMapping,
    'bone': Bone,
    'food_ration': Ration,
    'food_iron_ration': IronRation,
    'food_wild_berries': WildBerries,
    'food_wild_herbs': WildHerbs,
    'food_mushrooms': DungeonMushrooms,
    'food_wheat': Wheat,
    'food_carrot': Carrot,
    'food_corn': Corn,
  };
  return _SIMPLE_ITEM_ARCHETYPES;
}

/**
 * Create an item entity by its ID string.
 * Does NOT add Position - caller should place the item if needed.
 *
 * @param {import('../../lib/ecs-js/index.js').World} world - ECS world
 * @param {string} itemId - Item identifier (e.g., 'gold', 'sword_plain', 'book_lightning')
 * @param {Object} opts - Options
 * @param {number} [opts.count] - Optional explicit stack count override
 * @param {string[]} [opts.affixes=[]] - Affix IDs for equipment
 * @returns {number|null} - Created entity ID, or null if unknown item
 */
export function createItemById(world, itemId, opts = {}) {
  const rawCount = Number(opts?.count);
  const hasExplicitCount = Number.isFinite(rawCount) && rawCount > 0;
  const count = hasExplicitCount ? (rawCount | 0) : 0;
  const affixes = opts.affixes || [];

  // 1. Check simple archetypes (gold, potions, food, ammo, etc.)
  const simple = simpleItemArchetypes();
  if (simple[itemId]) {
    const id = createFrom(world, simple[itemId], {});
    // Set count for stackable items
    if (count > 1) {
      world.mutate(id, ItemInfo, r => { r.count = count; });
    }
    return id;
  }

  // 2. Check unified catalog definitions
  const catalogDef = getCatalogItem(itemId);
  if (catalogDef) {
    const buildOpts = { affixes };
    if (hasExplicitCount) buildOpts.count = count;
    return buildCatalogItem(world, itemId, buildOpts);
  }

  // 3. Check gem definitions
    const gemDef = gems.getGem(itemId);
  if (gemDef) {
    const params = gems.buildGemItemParams(gemDef);
    if (!params) return null;
    const id = createFrom(world, GemItem, params);
    return id;
  }

  // Unknown item
  return null;
}

/**
 * Check if an item ID is valid and can be created.
 * @param {string} itemId
 * @returns {boolean}
 */
export function isValidItemId(itemId) {
  return !!(
    simpleItemArchetypes()[itemId] ||
    getCatalogItem(itemId) ||
    gems.getGem(itemId)
  );
}

/**
 * Get all valid item IDs.
 * @returns {string[]}
 */
export function listAllItemIds() {
  const simpleIds = Object.keys(simpleItemArchetypes());
  const catalogIds = Object.keys(ITEM_CATALOG || {});
  const gemIds = gems.listGemIds();
  return Array.from(new Set([...simpleIds, ...catalogIds, ...gemIds]));
}
