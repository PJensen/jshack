// src/content/items/boots.js
// All slot:feet definitions migrated from itemCatalogEquipment.js.

import { defineItem } from '../define.js';

defineItem('boots_of_vigor', {
  name: 'Boots of Vigor', type: 'boots',
  glyph: 'u', color: '#d0a56a', glow: '#9d7747', scale: 0.65,
  material: 'leather', rarity: 2,
  bonuses: { staminaRegen: 1.0 },
  weight: 0.8,
});

defineItem('boots_leather', {
  name: 'Leather Boots', type: 'boots',
  glyph: 'u', color: '#b7864f', glow: '#7f5b36', scale: 0.65,
  material: 'leather', rarity: 1,
  bonuses: { maxStamina: 6, staminaRegen: 0.2 },
  weight: 1.3,
});

defineItem('trail_boots', {
  name: 'Trail Boots', type: 'boots',
  glyph: 'u', color: '#9e7f55', glow: '#6a5236', scale: 0.65,
  material: 'leather', rarity: 1,
  bonuses: { defense: 1, maxStamina: 5, staminaRegen: 0.2 },
  description: 'Quiet soles built for long marches and quick retreats.',
  weight: 1.0,
});

defineItem('sandals_hemp', {
  name: 'Hemp Sandals', type: 'boots',
  glyph: 'u', color: '#c6b28a', glow: '#8f7c57', scale: 0.65,
  material: 'cloth', rarity: 1,
  bonuses: { maxStamina: 3, staminaRegen: 0.15 },
  weight: 0.3,
});

defineItem('shoes_cloth', {
  name: 'Pilgrim Shoes', type: 'boots',
  glyph: 'u', color: '#9ea7b9', glow: '#6c7485', scale: 0.65,
  material: 'cloth', rarity: 1,
  bonuses: { maxMana: 4, manaRegen: 0.1 },
  weight: 0.4,
});

defineItem('boots_plate', {
  name: 'Steel Greaves', type: 'boots',
  glyph: 'u', color: '#a3b0bf', glow: '#737f8f', scale: 0.65,
  material: 'steel', rarity: 2,
  bonuses: { defense: 2 },
  weight: 2.5,
});

defineItem('boots_ironshod', {
  name: 'Ironshod Boots', type: 'boots',
  glyph: 'u', color: '#9aa4b0', glow: '#6a747f', scale: 0.65,
  material: 'iron', rarity: 3,
  bonuses: { defense: 3, maxHp: 5 },
  description: 'Heavy boots with iron-capped toes. They make stealth impossible but survival likely.',
  weight: 2.8,
});

defineItem('boots_strider', {
  name: 'Strider Boots', type: 'boots',
  glyph: 'u', color: '#8bb87a', glow: '#5d8a4e', scale: 0.65,
  material: 'leather', rarity: 3,
  bonuses: { defense: 1, dexterity: 2, maxStamina: 8, staminaRegen: 0.5, luck: 1 },
  description: 'Soft-soled boots favored by rangers and thieves for their sure grip.',
  weight: 1.0,
});

defineItem('boots_sentinel', {
  name: 'Sentinel Sabatons', type: 'boots',
  glyph: 'u', color: '#b0bcc8', glow: '#7a8694', scale: 0.65,
  material: 'steel', rarity: 4,
  bonuses: { defense: 3, maxHp: 10, bluntResist: 0.1, pierceResist: 0.1 },
  description: 'Steel-plated boots with articulated ankles, built for warriors who hold the line.',
  affixes: ['kineticWard1'],
  weight: 3.0,
});

defineItem('boots_shadowstep', {
  name: 'Shadowstep Boots', type: 'boots',
  glyph: 'u', color: '#6e6e8a', glow: '#46465c', scale: 0.65,
  material: 'leather', rarity: 4,
  bonuses: { defense: 2, attack: 1, critChance: 0.04, maxStamina: 10, staminaRegen: 0.4 },
  description: 'Each step bends light around the wearer, leaving only a blur.',
  affixes: ['lucky1'],
  weight: 1.0,
});

defineItem('boots_conduit', {
  name: 'Conduit Slippers', type: 'boots',
  glyph: 'u', color: '#8fb0e0', glow: '#5a7cb0', scale: 0.65,
  material: 'cloth', rarity: 4,
  bonuses: { defense: 1, maxMana: 12, manaRegen: 0.4, spellHit: 1 },
  description: 'Silk slippers that draw ambient mana upward through the soles.',
  affixes: ['life1'],
  weight: 0.3,
});

defineItem('boots_earthbound', {
  name: 'Earthbound Greaves', type: 'boots',
  glyph: 'u', color: '#a0886a', glow: '#706040', scale: 0.65,
  material: 'steel', rarity: 5,
  bonuses: { defense: 4, maxHp: 15, bluntResist: 0.15, pierceResist: 0.1 },
  description: 'Forged from ore pulled from the deepest vein, they root the wearer to the earth itself.',
  affixes: ['shieldWall1'],
  weight: 3.5,
});

defineItem('boots_phantomstride', {
  name: 'Phantomstride Boots', type: 'boots',
  glyph: 'u', color: '#9a8cc8', glow: '#6a5e98', scale: 0.65,
  material: 'leather', rarity: 5,
  bonuses: { defense: 2, attack: 2, critChance: 0.06, maxStamina: 15, staminaRegen: 0.5, luck: 2 },
  description: 'Worn by the last of the ghost rangers. Their footprints never touch the ground.',
  affixes: ['guard1'],
  weight: 1.0,
});

defineItem('eclipse_sabatons', {
  name: 'Eclipse Sabatons', type: 'boots',
  glyph: 'u', color: '#d0b070', glow: '#9a7a40', scale: 0.65,
  material: 'steel', rarity: 5,
  bonuses: { defense: 2, fireResist: 0.1, poisonResist: 0.1 },
  description: 'One boot is sun-gold, one is moon-silver. Hits alternate between fire and frost through adjacent enemies. Light and dark answer in turn.',
  procPackages: ['eclipseHammer'],
  weight: 3.0,
});

defineItem('thundergod_greaves', {
  name: "Thunder God's Greaves", type: 'boots',
  glyph: 'u', color: '#7aaae8', glow: '#4a78b8', scale: 0.65,
  material: 'steel', rarity: 4,
  bonuses: { defense: 2, critChance: 0.04 },
  description: 'Arcs of static discharge with every step. Crits send lightning through every hostile in radius 2.',
  procPackages: ['thunderGod'],
  weight: 2.8,
});

defineItem('soul_mortgage_treads', {
  name: 'Soul Mortgage Treads', type: 'boots',
  glyph: 'u', color: '#7f89a8', glow: '#525a77', scale: 0.65,
  material: 'leather', rarity: 4,
  bonuses: { defense: 1, attack: 1 },
  weight: 1.0,
  description: 'The soles are stitched with debt-runes that accrue with every step and every hit. Crit chance, crit multiplier, and base damage are all boosted beyond reason. The debt accrues in silence. Something is coming to collect.',
  procPackages: ['debtHarvest'],
});

defineItem('warboots_of_cataclysm', {
  name: 'Warboots of Cataclysm', type: 'boots',
  glyph: 'u', color: '#b0a486', glow: '#7b6c51', scale: 0.65,
  material: 'iron', rarity: 5,
  bonuses: { defense: 2, critChance: 0.04 },
  weight: 1.0,
  description: 'Critical kills cascade through these boots: a hazard erupts on the corpse, a shockwave marks all adjacent hostiles, and those marked will detonate on the next hit. Nothing dies quietly in these boots.',
  procPackages: ['cataclysmGuard'],
});

defineItem('hollow_tide_boots', {
  name: 'Hollow Tide Boots', type: 'boots',
  glyph: 'u', color: '#9e8a70', glow: '#6d5d49', scale: 0.65,
  material: 'leather', rarity: 4,
  bonuses: { defense: 1, maxHp: 8 },
  weight: 1.2,
  description: 'Tidal runes circle the ankle straps. Below 75% HP, hits gain +1. Below 50%, +3. Below 25%, +6 and targets weaken. They were made for a fighter who never planned to be at full health.',
  procPackages: ['bloodsport'],
});

const BREADCRUMB_STEP_INTERVAL = 4;
const BREADCRUMB_LIFESPAN_TURNS = 8;
const BREADCRUMB_SCATTER_COUNT = 4;

defineItem('breadcrumb_boots', {
  name: 'Breadcrumb Boots', type: 'boots',
  glyph: 'u', color: '#d4b36a', glow: '#9e7137', scale: 0.68,
  material: 'leather', rarity: 3, value: 175, weight: 1.0,
  bonuses: { defense: 1, maxStamina: 8 },
  description: 'Enchanted leather boots. Every fourth step leaves a glowing crumb that lingers for 8 turns and draws curious creatures toward it. Each crumb stores one Scatter charge, up to four. Use Scatter while equipped to spend four charges and lay a decoy trail nearby. The shoemaker made them for a child who was terrible at finding her way home.',
  chargePool: { current: 0, max: 4 },
  procPackages: ['breadcrumbBoots'],
  state: { stepsTowardCrumb: 0 },
  meta: {
    breadcrumb: {
      stepInterval: BREADCRUMB_STEP_INTERVAL,
      lifespanTurns: BREADCRUMB_LIFESPAN_TURNS,
      scatterCount: BREADCRUMB_SCATTER_COUNT,
    },
  },
  abilities: {
    scatter: {
      name: 'Scatter', icon: '·', targeting: 'none', requiresEquipped: true,
      cooldown: 20, chargeCost: BREADCRUMB_SCATTER_COUNT,
      stepInterval: BREADCRUMB_STEP_INTERVAL,
      lifespanTurns: BREADCRUMB_LIFESPAN_TURNS,
      scatterCount: BREADCRUMB_SCATTER_COUNT,
      description: 'Every {stepInterval} steps, leave a glowing crumb that lingers for {lifespanTurns} turns. Scatter lays {scatterCount} decoy crumbs nearby.',
      displayFormat: '{description} Cooldown: {cooldown} turns. Cost: {cost} charges.',
      onActivate(ctx) {
        ctx.scatterBreadcrumbs(BREADCRUMB_SCATTER_COUNT);
        ctx.message(`${BREADCRUMB_SCATTER_COUNT} golden crumbs leap from your heels and skip into the dark.`, 'system');
        ctx.present('scatter', { target: ctx.user });
      },
    },
  },
  presentations: {
    scatter: { vfx: [
      { type: 'burst', color: '#f3c86a', count: 16, speed: 1.4, life: 0.8 },
      { type: 'glow', color: '#e6aa4b', radius: 2.5, life: 1.1 },
    ] },
  },
});
