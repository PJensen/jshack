import { defineItem } from '../define.js';
import { createLearnSpellFromIdentityHook, createOpenFlavorBookHook } from '../../rules/data/itemCatalogHooks.js';

const _learnHook = createLearnSpellFromIdentityHook({ identityPrefix: 'book_', consumeOnSuccess: true });

const _book = (id, name, rarity, desc) => defineItem(id, {
  name, type: 'learn', material: 'paper', rarity, weight: 0.7,
  description: desc,
  hooks: { on_use: _learnHook },
});

_book('book_lightning',     'Spellbook of Lightning',     'rare',   'Grants the ability to cast a lightning spell.');
_book('book_meteor',        'Spellbook of Meteor',        'epic',   'Grants the ability to cast a meteor spell.');
_book('book_blastwave',     'Spellbook of Blast Wave',    'magic',  'Grants the ability to cast a blast wave spell.');
_book('book_frost_nova',    'Spellbook of Frost Nova',    'rare',   'Grants the ability to cast Frost Nova.');
_book('book_earthshatter',  'Spellbook of Earthshatter',  'magic',  'Grants the ability to cast Earthshatter, cracking the ground to stun nearby foes.');
_book('book_blink',         'Spellbook of Blink',         'magic',  'Grants the ability to cast Blink.');
_book('book_frost',         'Spellbook of Frost',         'magic',  'Grants the ability to cast Frost.');
_book('book_fear',          'Spellbook of Fear',          'rare',   'Grants the ability to terrify a foe into flight.');
_book('book_blizzard',      'Spellbook of Blizzard',      'rare',   'Grants the ability to cast Blizzard.');
_book('book_firestorm',     'Spellbook of Firestorm',     'rare',   'Grants the ability to cast Firestorm.');
_book('book_heal',          'Spellbook of Healing',       'magic',  'Grants the ability to cast a healing spell.');
_book('book_blind',         'Spellbook of Blindness',     'rare',   'Grants the ability to cast a blinding spell.');
_book('book_verdant_ward',  'Spellbook of Verdant Ward',  'rare',   'Grants the ability to cast Verdant Ward.');
_book('book_harmony_ward',  'Spellbook of Harmony Ward',  'rare',   'Grants the ability to cast Harmony Ward.');
_book('book_shadow_veil',   'Spellbook of Shadow Veil',   'rare',   'Grants the ability to cast Shadow Veil.');
_book('book_flash_heal',    'Spellbook of Flash Heal',    'rare',   'Grants the ability to cast Flash Heal.');
_book('book_renewal',   'Spellbook of Renewal',   'rare',   'Grants the ability to cast Renewal.');
_book('book_sacred_restoration', 'Spellbook of Sacred Restoration', 'epic', 'Grants the ability to cast Sacred Restoration.');
_book('book_lifebloom', 'Spellbook of Lifebloom', 'epic', 'Grants the ability to channel Lifebloom.');
_book('book_smite',         'Spellbook of Smite',         'magic',  'Grants the ability to call down holy judgment on enemies.');
_book('book_summon_skeleton','Spellbook of Summon Skeleton','epic', 'Grants the ability to rip a skeleton from the earth to fight at your side.');
_book('book_resurrection',  'Spellbook of Resurrection',  'epic', 'Grants the ability to raise an eligible corpse as a temporary undead ally.');
_book('book_shadow_bolt',   'Spellbook of Shadow Bolt',   'epic',   'Grants the ability to hurl a devastating bolt of pure shadow.');
_book('book_agony',         'Spellbook of Agony',         'rare',   'Grants the ability to weave shadow into a curse that gnaws at life force.');
_book('book_rampage',       'Spellbook of Rampage',       'rare',   'Grants the ability to spend mana for a long, savage battle fury.');
_book('book_phase_strike',  'Spellbook of Phase Strike',  'rare',   'Grants the ability to slip between moments and cut everything on your line.');
_book('book_scorch',        'Spellbook of Scorch',        'magic',  'Grants the ability to sear a target with fire and leave them vulnerable to further burning.');
_book('book_homecoming',    'Spellbook of Homecoming',    'magic',  'Grants the ability to instantly return to the surface.');
_book('book_hearthstone',   'Spellbook of Hearthstone',   'rare',   'Grants the ability to channel your will homeward and be pulled back to safety.');
_book('book_iron_flesh',    'Spellbook of Iron Flesh',    'magic',  'Teaches Iron Flesh — harden your body into living metal.');
_book('book_bloodthirst',   'Spellbook of Bloodthirst',   'rare',   'Teaches Bloodthirst — each blow heals the striker.');
_book('book_cleave',        'Spellbook of Cleave',        'magic',  'Teaches Cleave — a sweeping arc that hits all adjacent foes.');
_book('book_war_cry',       'Spellbook of War Cry',       'magic',  'Teaches War Cry — a shout that weakens nearby enemies.');
_book('book_barkskin',      'Spellbook of Barkskin',      'magic',  'Teaches Barkskin — wrap yourself in living wood for armor and thorns.');
_book('book_thorn_burst',   'Spellbook of Thorn Burst',   'magic',  'Teaches Thorn Burst — explode thorns outward from your body.');
_book('book_entangle',      'Spellbook of Entangle',      'rare',   'Teaches Entangle — roots bind a target in place.');
_book('book_quicken',       'Spellbook of Quicken',       'rare',   'Teaches Quicken — sharpen reflexes, attack faster, recover stamina.');
_book('book_poison_blade',  'Spellbook of Poison Blade',  'magic',  'Teaches Poison Blade — coat your weapon in venom.');
_book('book_smoke_bomb',    'Spellbook of Smoke Bomb',    'rare',   'Teaches Smoke Bomb — blind nearby foes and vanish.');
_book('book_mark_of_death', 'Spellbook of Mark of Death', 'rare',   'Teaches Mark of Death — the marked target takes amplified damage.');
_book('book_drain_life',    'Spellbook of Drain Life',    'rare',   'Teaches Drain Life — siphon vitality from a foe while you channel.');
_book('book_ignite_weapons','Spellbook of Ignite Weapons','magic',  'Teaches Ignite Weapons — wreath your arms in flame.');
_book('book_fireball',      'Spellbook of Fireball',      'magic',  'Teaches Fireball — hurl a ball of fire at range.');
_book('book_primal_roar',   'Spellbook of Primal Roar',   'rare',   'Teaches Primal Roar — berserk fury staggering everything nearby.');
_book('book_plague_swarm',  'Spellbook of Plague Swarm',  'epic',   'Teaches Plague Swarm — unleash a jumping plague of decay.');
_book('book_divine_shield', 'Spellbook of Divine Shield', 'rare',   'Teaches Divine Shield — a holy ward of stoneskin and blessing.');
_book('book_purify',        'Spellbook of Purify',        'rare',   'Teaches Purify — cleanse all debuffs from your body.');
_book('book_consecrate',    'Spellbook of Consecrate',    'epic',   'Teaches Consecrate — sanctify the ground, burning the unholy.');
_book('book_magic_missile', 'Spellbook of Magic Missile', 'magic',  'Teaches Magic Missile — curve a single arcane star through the air.');
_book('book_arcane_barrage','Spellbook of Arcane Barrage','rare',   'Teaches Arcane Barrage — split three smaller missiles that strike together.');
_book('book_void_hole',     'Spellbook of Void Hole',     'epic',   'Teaches Void Hole — tear open a light-devouring gravity well.');
_book('book_arcane_bolt',   'Spellbook of Arcane Bolt',   'magic',  'Teaches Arcane Bolt — a lance of raw arcana that restores mana.');
_book('book_evocation',     'Spellbook of Evocation',     'rare',   'Teaches Evocation — channel raw aether to restore mana, but stand vulnerable.');

// ── Flavor books ──────────────────────────────────────────────────────

defineItem('book_dead', {
  name: 'Book of the Dead', type: 'book', material: 'paper', rarity: 'legendary', weight: 1.2,
  description: 'An ancient tome bound in pale leather. It records the fate of every hero who came before.',
  hooks: {
    on_use: (ctx, state) => { const actor = Number(state?.actor || ctx.actor || 0) | 0; ctx.io.emit('deathlog:open', { actor }); return { consumed: false }; },
  },
});

defineItem('book_kitty', {
  name: 'On the Care of Dungeon Cats', type: 'book', material: 'paper', rarity: 'common', weight: 0.3,
  description: 'A slim volume with claw marks on the cover.',
  hooks: { on_use: createOpenFlavorBookHook('On the Care of Dungeon Cats', 'Your kitty will follow you, fetch items, and flee when injured. It will also drop things at your feet unprompted. Do not question why. This is simply what cats do.') },
});

defineItem('book_snakes', {
  name: 'Snake Nest Husbandry', type: 'book', material: 'paper', rarity: 'common', weight: 0.3,
  description: 'Smells faintly of venom.',
  hooks: { on_use: createOpenFlavorBookHook('Snake Nest Husbandry', 'The snake trap releases a cluster of serpents when triggered. Venomous fangs, 25% poison chance. They appear from nowhere. Do not ask where they were hiding.') },
});

defineItem('book_spikes', {
  name: 'The Spike Trap Quarterly, Vol. III', type: 'book', material: 'paper', rarity: 'common', weight: 0.3,
  description: 'A trade publication for trap enthusiasts.',
  hooks: { on_use: createOpenFlavorBookHook('The Spike Trap Quarterly, Vol. III', 'This season\'s models deliver a clean 35% of max HP in damage. Reader question: \'Can adventurers see them?\' Editor\'s response: \'Not until it\'s too late.\'') },
});

defineItem('book_touchstone', {
  name: 'Touchstone: A Gemcutter\'s Manual', type: 'book', material: 'paper', rarity: 'common', weight: 0.3,
  description: 'Dog-eared and well-thumbed.',
  hooks: { on_use: createOpenFlavorBookHook('Touchstone: A Gemcutter\'s Manual', 'Rub the stone across the touchstone. A hard white streak means value. A dull scratch means you\'ve been carrying glass through fifteen floors of dungeon.') },
});

defineItem('book_corpses', {
  name: 'On Eating Monster Corpses', type: 'book', material: 'paper', rarity: 'common', weight: 0.3,
  description: 'Several pages are stained with something unidentifiable.',
  hooks: { on_use: createOpenFlavorBookHook('On Eating Monster Corpses', 'Rat corpse: disease. Snake corpse: poison. Spider corpse: also poison. Floating eye corpse: you forget who you are. There is a pattern here. Please notice it.') },
});

defineItem('book_gridbugs', {
  name: 'A Field Guide to Grid Bugs', type: 'book', material: 'paper', rarity: 'common', weight: 0.3,
  description: 'Illustrated with tiny diagrams of cardinal directions.',
  hooks: { on_use: createOpenFlavorBookHook('A Field Guide to Grid Bugs', 'The grid bug moves only along cardinal axes. Nobody knows why. One theory suggests they are bound by an ancient curse. Another theory: they are just very stubborn.') },
});
