import { defineArchetype } from "../../lib/ecs-js/archetype.js";
import { NamedIdentity }          from "../components/NamedIdentity.js";
import { ItemInfo }          from "../components/ItemInfo.js";
import { Potion } from "../components/Potion.js";
import { Consumable } from "../components/Consumable.js";
import { Material } from "../components/Material.js";
import { Beatitude } from "../components/Beatitude.js";

// Simple Health Potion archetype using Potion component
export const HealthPotion = defineArchetype(
    "HealthPotion",
    [Potion, {
        name: "Health Potion",
        route: "oral",
        doses: 1,
        channels: [],
        effects: [
            // Regeneration-over-time; potency resolved as % of max HP at use time (see drinkSystem)
            { key: "regen", potency: 0, onset: 0, peak: 0, duration: 12, stack: "refresh", meta: { percentOfMaxHp: 0.02 } }
        ],
        feel: "A gentle warmth spreads through your body.",
    }],
    [ItemInfo, {
        type: "potion",
        description: "Restores health over a short duration.",
        weight: 0.5,
        value: 25,
        count: 1,
        identified: true,
    }],
    [NamedIdentity, /** @param {any} p */ (p) => ({ name: (p && p.name) ?? "Health Potion", identity: 'potion_health' })],
    [Material, { kind: "glass" }],
    [Beatitude, { state: "uncursed" }],
);

// Currency stack (Gold) — zero weight, stackable via ItemInfo.count
export const GoldStack = defineArchetype(
    "GoldStack",
    [ItemInfo, {
        type: "currency",
        description: "Gold coins",
        weight: 0,
        value: 1, // per coin
        count: 1,
    }],
    [NamedIdentity, /** @param {any} p */ (p) => ({ name: (p && p.name) ?? "Gold", identity: "gold" })],
    [Material, { kind: "gold" }],
);

// Stackable arrows (ammo) — planning for ranged ammo consumption
export const ArrowsStack = defineArchetype(
    "ArrowsStack",
    [ItemInfo, {
        type: "ammo",
        slot: "ammo",
        description: "A bundle of arrows.",
        weight: 0.2,
        value: 1,
        count: 10,
    }],
    [NamedIdentity, /** @param {any} p */ (p) => ({ name: (p && p.name) ?? "Arrows", identity: "ammo_arrows" })],
    [Material, { kind: "wood" }],
);

// Fire arrows — bonus 1d4 fire damage on hit
export const FireArrowsStack = defineArchetype(
    "FireArrowsStack",
    [ItemInfo, {
        type: "ammo",
        slot: "ammo",
        subtype: "fire",
        description: "Arrows tipped with alchemical fire.",
        weight: 0.3,
        value: 5,
        count: 5,
        rarity: 3,
        rarityName: "rare",
    }],
    [NamedIdentity, /** @param {any} p */ (p) => ({ name: (p && p.name) ?? "Fire Arrows", identity: "ammo_fire_arrows" })],
    [Material, { kind: "wood" }],
);

// Piercing arrows — trade utility for armor penetration against high-DR targets.
export const PiercingArrowsStack = defineArchetype(
    "PiercingArrowsStack",
    [ItemInfo, {
        type: "ammo",
        slot: "ammo",
        subtype: "piercing",
        description: "Narrow hardened heads designed to punch through armor.",
        weight: 0.25,
        value: 4,
        count: 6,
    }],
    [NamedIdentity, /** @param {any} p */ (p) => ({ name: (p && p.name) ?? "Piercing Arrows", identity: "ammo_piercing_arrows" })],
    [Material, { kind: "wood" }],
);

// Bodkin arrows — narrow armor-piercing points.
export const BodkinArrowsStack = defineArchetype(
    "BodkinArrowsStack",
    [ItemInfo, {
        type: "ammo",
        slot: "ammo",
        subtype: "bodkin",
        description: "Slim steel heads that pierce armor, but carry less mass.",
        weight: 0.25,
        value: 5,
        count: 6,
    }],
    [NamedIdentity, /** @param {any} p */ (p) => ({ name: (p && p.name) ?? "Bodkin Arrows", identity: "ammo_bodkin_arrows" })],
    [Material, { kind: "wood" }],
);

// Blunt-head arrows — less lethal, better at disruption.
export const BluntHeadArrowsStack = defineArchetype(
    "BluntHeadArrowsStack",
    [ItemInfo, {
        type: "ammo",
        slot: "ammo",
        subtype: "blunt",
        description: "Rounded heads that bruise and stagger instead of puncturing.",
        weight: 0.25,
        value: 4,
        count: 6,
    }],
    [NamedIdentity, /** @param {any} p */ (p) => ({ name: (p && p.name) ?? "Blunt-Head Arrows", identity: "ammo_blunt_arrows" })],
    [Material, { kind: "wood" }],
);

export const ChalkArrowsStack = defineArchetype(
    "ChalkArrowsStack",
    [ItemInfo, {
        type: "ammo", slot: "ammo", subtype: "chalk",
        description: "Arrows tipped with soft chalk that leave marks on impact.",
        weight: 0.25, value: 6, count: 6, rarity: 3, rarityName: "rare",
    }],
    [NamedIdentity, /** @param {any} p */ (p) => ({ name: (p && p.name) ?? "Chalk Arrows", identity: "ammo_chalk_arrows" })],
    [Material, { kind: "chalk" }],
);

export const BombArrowsStack = defineArchetype(
    "BombArrowsStack",
    [ItemInfo, {
        type: "ammo", slot: "ammo", subtype: "bomb",
        description: "Arrows packed with a small alchemical charge that erupts into a blast zone.",
        weight: 0.35, value: 10, count: 4, rarity: 4, rarityName: "epic",
    }],
    [NamedIdentity, /** @param {any} p */ (p) => ({ name: (p && p.name) ?? "Bomb Arrows", identity: "ammo_bomb_arrows" })],
    [Material, { kind: "iron" }],
);

// Generic magic item (spellbooks, wands, scrolls) — resolves from item def params
export const MagicItem = defineArchetype(
    "MagicItem",
    [NamedIdentity, (p) => ({ name: p.name ?? "Item", identity: p.identity ?? "item" })],
    [ItemInfo, (p) => ({
        type: p.type ?? "learn",
        slot: p.slot ?? "bag",
        weight: p.weight ?? 1,
        value: p.value ?? 0,
        description: p.description ?? "",
        count: p.count ?? 1,
        rarity: p.rarity ?? 1,
        rarityName: p.rarityName ?? "common",
        affixes: [],
    })],
);

// Gem / stone — parameterized from GEM_DEFS at creation time
export const GemItem = defineArchetype(
    "GemItem",
    [NamedIdentity, (p) => ({ name: p.name ?? "gem", identity: p.identity ?? "gem" })],
    [ItemInfo, (p) => ({
        type: "gem",
        slot: "bag",
        weight: p.weight ?? 1,
        value: p.value ?? 0,
        appearance: p.appearance ?? p.description ?? "",
        description: p.description ?? "",
        details: p.details ?? "",
        detailLines: Array.isArray(p.detailLines) ? p.detailLines.slice() : [],
        identified: p.identified === true,
        count: 1,
        rarity: 1,
        rarityName: "common",
        affixes: [],
    })],
);

// Bone — dropped by skeletal monsters on death
export const Bone = defineArchetype(
    "Bone",
    [ItemInfo, {
        type: "misc",
        damageDice: "1d4",
        description: "A bleached bone from an undead skeleton.",
        weight: 1,
        value: 3,
        count: 1,
    }],
    [NamedIdentity, (p) => ({ name: (p && p.name) ?? "Bone", identity: "bone" })],
    [Material, { kind: "bone" }],
);

// Ashes — dropped when an urn is broken
export const Ashes = defineArchetype(
    "Ashes",
    [ItemInfo, {
        type: "misc",
        description: "A pile of dusty ashes.",
        weight: 0.5,
        value: 1,
        count: 1,
    }],
    [NamedIdentity, (p) => ({ name: (p && p.name) ?? "Ashes", identity: "ashes" })],
    [Material, { kind: "organic" }],
);

// Debug/utility: reveals entire dungeon map when used
export const ScrollOfMapping = defineArchetype(
    "ScrollOfMapping",
    [Consumable, {
        effectParams: {},
        remainingUses: 1,
        potency: 0,
    }],
    [ItemInfo, {
        type: "scroll",
        description: "Reveals the entire dungeon map.",
        weight: 0.1,
        value: 100,
        count: 1,
    }],
    [NamedIdentity, (p) => ({ name: (p && p.name) ?? "Scroll of Mapping", identity: "scroll_mapping" })],
    [Material, { kind: "paper" }],
);
