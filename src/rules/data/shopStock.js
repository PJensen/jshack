// rules/data/shopStock.js
// Generate shop inventory items for a shopkeeper.

import { createFrom } from '../../lib/ecs-js/archetype.js';
import { HealthPotion, ArrowsStack, FireArrowsStack, PiercingArrowsStack, BodkinArrowsStack, BluntHeadArrowsStack, BombArrowsStack, ScrollOfMapping, GemItem } from '../archetypes/Items.js';
import { resolveLootTable, materializeDrop } from './lootResolver.js';
import { Position } from '../components/Position.js';
import { ItemInfo } from '../components/ItemInfo.js';
import * as gems from './gems.js';
import { createItemById } from '../utils/itemFactory.js';

function stripPosition(world, id) {
    try { world.remove(id, Position); } catch {}
    return id;
}

function chooseWeighted(rng, entries) {
    let total = 0;
    for (let i = 0; i < entries.length; i++) total += Number(entries[i].weight || 0);
    if (!(total > 0)) return entries[0] || null;
    let roll = rng.next() * total;
    for (let i = 0; i < entries.length; i++) {
        roll -= Number(entries[i].weight || 0);
        if (roll <= 0) return entries[i];
    }
    return entries[entries.length - 1] || null;
}

function createArrowStock(world, rng) {
    const pick = chooseWeighted(rng, [
        { weight: 56, archetype: ArrowsStack },
        { weight: 16, archetype: FireArrowsStack },
        { weight: 12, archetype: PiercingArrowsStack },
        { weight: 10, archetype: BodkinArrowsStack },
        { weight: 6, archetype: BluntHeadArrowsStack },
        { weight: 2, archetype: BombArrowsStack },
    ]);
    const Arch = pick?.archetype || ArrowsStack;
    return createFrom(world, Arch, {});
}

/**
 * Generate a shopkeeper's stock as entity IDs (no Position component).
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} depth - current dungeon depth
 * @param {Object} rng - createRng() instance
 * @returns {number[]} array of item entity IDs
 */
export function generateShopStock(world, depth, rng) {
    const items = [];

    // Fixed staples: potions (3-5), arrows (1-2), scroll of mapping (1)
    const potionCount = rng.int(3, 5);
    for (let i = 0; i < potionCount; i++) {
        const id = createFrom(world, HealthPotion, {});
        try { world.remove(id, Position); } catch {} // ECS: may not exist
        items.push(id);
    }

    const arrowCount = rng.int(2, 3);
    for (let i = 0; i < arrowCount; i++) {
        const id = createArrowStock(world, rng);
        try { world.remove(id, Position); } catch {} // ECS: may not exist
        items.push(id);
    }

    const scrollId = createFrom(world, ScrollOfMapping, {});
    try { world.remove(scrollId, Position); } catch {} // ECS: may not exist
    items.push(scrollId);

    // Depth-scaled random equipment from the shop:equipment table
    const drops = resolveLootTable("shop:equipment", rng, depth);
    const dummyPos = { x: 0, y: 0 };
    for (const drop of drops) {
        if (drop.kind === "gold") continue; // shops don't sell gold
        const eid = materializeDrop(world, drop, dummyPos);
        if (eid != null) {
            try { world.remove(eid, Position); } catch {} // ECS: may not exist
            // Scale value by depth for equipment
            const info = world.get(eid, ItemInfo);
            if (info && info.value > 0) {
                const depthMult = 1 + (depth - 1) * 0.15;
                world.mutate(eid, ItemInfo, r => {
                    r.value = Math.ceil(r.value * depthMult);
                });
            }
            items.push(eid);
        }
    }

    return items;
}

/**
 * Generate exactly one shop floor item entity ID (no Position component).
 * This avoids creating a whole stock list when only one item is needed.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} depth
 * @param {Object} rng
 * @returns {number|null}
 */
export function generateShopItem(world, depth, rng) {
    const roll = rng.next();

    // Staples appear often to keep early shops useful.
    if (roll < 0.35) {
        return stripPosition(world, createFrom(world, HealthPotion, {}));
    }
    if (roll < 0.50) {
        return stripPosition(world, createArrowStock(world, rng));
    }
    if (roll < 0.60) {
        return stripPosition(world, createFrom(world, ScrollOfMapping, {}));
    }

    // Otherwise pull from shop equipment/magic/utility tables.
    const drops = resolveLootTable("shop:equipment", rng, depth);
    const dummyPos = { x: 0, y: 0 };
    for (const drop of drops) {
        if (drop.kind === "gold") continue;
        const eid = materializeDrop(world, drop, dummyPos);
        if (eid == null) continue;
        stripPosition(world, eid);
        const info = world.get(eid, ItemInfo);
        if (info && info.value > 0) {
            const depthMult = 1 + (depth - 1) * 0.15;
            world.mutate(eid, ItemInfo, r => {
                r.value = Math.ceil(r.value * depthMult);
            });
        }
        return eid;
    }

    // Fallback so shop_item spawn always materializes.
    return stripPosition(world, createFrom(world, HealthPotion, {}));
}

/**
 * Generate one Ratatoskr cache item from the legendary equipment table.
 * The caller owns placement and Unpaid pricing.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} depth
 * @param {Object} rng
 * @returns {number|null}
 */
export function generateRatatoskrLegendaryItem(world, depth, rng) {
    const drops = resolveLootTable("sub:equip_legendary", rng, Math.max(8, Number(depth || 0) | 0));
    const dummyPos = { x: 0, y: 0 };
    for (const drop of drops) {
        if (drop.kind === "gold") continue;
        const eid = materializeDrop(world, drop, dummyPos);
        if (eid == null) continue;
        stripPosition(world, eid);
        const info = world.get(eid, ItemInfo);
        if (info && info.value > 0) {
            world.mutate(eid, ItemInfo, r => {
                r.identified = true;
                r.value = Math.ceil(r.value * 1.35);
            });
        }
        return eid;
    }
    return null;
}

/**
 * Generate exactly one apothecary floor item entity ID (no Position component).
 * Authored alchemy shops use this for visible floor stock markers.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {Object} rng
 * @returns {number|null}
 */
export function generateAlchemyShopItem(world, rng) {
    const pick = chooseWeighted(rng, [
        { id: "potion_health", weight: 24 },
        { id: "potion_mana", weight: 16 },
        { id: "potion_anti_venom", weight: 12 },
        { id: "potion_vigor", weight: 10 },
        { id: "potion_endurance", weight: 10 },
        { id: "potion_second_wind", weight: 8 },
        { id: "potion_resist_poison", weight: 8 },
        { id: "potion_resist_fire", weight: 6 },
        { id: "potion_resist_electric", weight: 4 },
        { id: "potion_resist_acid", weight: 4 },
        { id: "potion_mana_surge", weight: 6 },
        { id: "potion_speed", weight: 5 },
        { id: "potion_acid", weight: 4 },
        { id: "potion_oil", weight: 4 },
        { id: "reagent_resin", weight: 10 },
        { id: "reagent_venom_gland", weight: 8 },
        { id: "reagent_bone_dust", weight: 7 },
        { id: "reagent_rune_fragment", weight: 7 },
        { id: "reagent_frost_core", weight: 6 },
        { id: "reagent_cursed_thread", weight: 6 },
    ]);
    if (!pick?.id) return stripPosition(world, createFrom(world, HealthPotion, {}));
    const itemId = createItemById(world, pick.id);
    if (!(itemId > 0)) return stripPosition(world, createFrom(world, HealthPotion, {}));
    return stripPosition(world, itemId);
}

/**
 * Generate exactly one gem shop display item entity ID (no Position component).
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {Object} rng
 * @returns {number|null}
 */
export function generateGemShopItem(world, rng) {
    return generateGemDisplayItem(world, rng, {});
}

/**
 * Generate exactly one gem display item with optional value-tier filtering.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {Object} rng
 * @param {{ stockTier?: string|null }} [opts]
 * @returns {number|null}
 */
export function generateGemDisplayItem(world, rng, opts = {}) {
    const socketableGems = gems.listGems().filter(g => g.socketable && gems.isRealGemstone(g));
    const miscPool = gems.listGems().filter(g => gems.isRealGemstone(g) && g.prob > 0);
    let pool = (rng.next() < 0.4 ? socketableGems : miscPool);
    pool = filterGemPoolByTier(pool, opts.stockTier);
    if (!pool.length) pool = filterGemPoolByTier(miscPool, opts.stockTier);
    if (!pool.length) pool = miscPool;
    if (!pool.length) return null;
    const gem = pool[rng.int(0, pool.length - 1)];
    const params = gems.buildGemItemParams(gem, { identified: true });
    if (!params) return null;
    return stripPosition(world, createFrom(world, GemItem, params));
}

function filterGemPoolByTier(pool, stockTier) {
    const tier = String(stockTier || "").toLowerCase();
    if (!tier) return pool.slice();
    if (tier === "rare") return pool.filter(g => g.value >= 1500 && g.value < 3000);
    if (tier === "epic") return pool.filter(g => g.value >= 3000);
    if (tier === "rare_or_epic") return pool.filter(g => g.value >= 1500);
    return pool.slice();
}

/**
 * Generate exactly one book shop floor item entity ID (no Position component).
 * 50% spell books (learn), 50% scrolls (one-time cast).
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {Object} rng
 * @returns {number|null}
 */
export function generateBookShopItem(world, rng) {
    const pick = chooseWeighted(rng, [
        // Spell books (learn permanently)
        { id: "book_lightning", weight: 10 },
        { id: "book_meteor", weight: 8 },
        { id: "book_blastwave", weight: 10 },
        { id: "book_earthshatter", weight: 10 },
        { id: "book_blink", weight: 10 },
        { id: "book_frost", weight: 12 },
        { id: "book_frost_nova", weight: 10 },
        { id: "book_blizzard", weight: 8 },
        { id: "book_firestorm", weight: 8 },
        { id: "book_heal", weight: 14 },
        { id: "book_fireball", weight: 12 },
        { id: "book_arcane_bolt", weight: 10 },
        { id: "book_evocation", weight: 8 },
        { id: "book_iron_flesh", weight: 10 },
        { id: "book_bloodthirst", weight: 8 },
        { id: "book_cleave", weight: 12 },
        { id: "book_war_cry", weight: 10 },
        { id: "book_barkskin", weight: 12 },
        { id: "book_thorn_burst", weight: 10 },
        { id: "book_entangle", weight: 10 },
        { id: "book_quicken", weight: 8 },
        { id: "book_poison_blade", weight: 10 },
        { id: "book_smoke_bomb", weight: 8 },
        { id: "book_mark_of_death", weight: 6 },
        { id: "book_drain_life", weight: 6 },
        { id: "book_ignite_weapons", weight: 10 },
        { id: "book_primal_roar", weight: 8 },
        { id: "book_plague_swarm", weight: 6 },
        { id: "book_divine_shield", weight: 8 },
        { id: "book_purify", weight: 8 },
        { id: "book_consecrate", weight: 6 },
        { id: "book_flash_heal", weight: 12 },
        { id: "book_smite", weight: 10 },
        { id: "book_shadow_bolt", weight: 8 },
        { id: "book_agony", weight: 6 },
        { id: "book_summon_skeleton", weight: 6 },
        { id: "book_shadow_veil", weight: 6 },
        { id: "book_rampage", weight: 4 },
        { id: "book_phase_strike", weight: 8 },
        { id: "book_homecoming", weight: 8 },
        // Scrolls (single-use)
        { id: "scroll_identify", weight: 18 },
        { id: "scroll_mapping", weight: 14 },
        { id: "scroll_blastwave", weight: 10 },
        { id: "scroll_heal", weight: 12 },
        { id: "scroll_homecoming", weight: 8 },
        { id: "scroll_fire", weight: 10 },
        { id: "scroll_remove_curse", weight: 6 },
        { id: "scroll_summon_skeleton", weight: 6 },
        { id: "scroll_mass_delirium", weight: 2 },
    ]);
    if (!pick?.id) return null;
    const itemId = createItemById(world, pick.id);
    if (!(itemId > 0)) return null;
    return stripPosition(world, itemId);
}

/**
 * Generate gem vendor stock: socketable gems (pre-identified) + misc gems.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {Object} rng - createRng() instance
 * @returns {number[]} array of item entity IDs
 */
export function generateGemShopStock(world, rng) {
    const items = [];

    // Socketable gems: pick 3-4 from the socketable pool, pre-identified
    const socketableGems = gems.listGems().filter(g => g.socketable && gems.isRealGemstone(g));
    const socketCount = rng.int(3, 4);
    // Deterministic shuffle via rng
    const pool = socketableGems.slice();
    for (let i = pool.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    for (let i = 0; i < Math.min(socketCount, pool.length); i++) {
        const gem = pool[i];
        const params = gems.buildGemItemParams(gem, { identified: true });
        if (!params) continue;
        const id = createFrom(world, GemItem, params);
        try { world.remove(id, Position); } catch {}
        items.push(id);
    }

    // Misc gems: 4-6 common gemstones, also sold pre-identified in the gem shop.
    const miscPool = gems.listGems().filter(g => gems.isRealGemstone(g) && g.prob > 0);
    const miscCount = rng.int(4, 6);
    for (let i = 0; i < miscCount; i++) {
        const gem = miscPool[rng.int(0, miscPool.length - 1)];
        const params = gems.buildGemItemParams(gem, { identified: true });
        if (!params) continue;
        const id = createFrom(world, GemItem, params);
        try { world.remove(id, Position); } catch {}
        items.push(id);
    }

    return items;
}
