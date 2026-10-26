// src/content/items/lodbrokSerpentBoundBreeches.js
// Loðbrók's Serpent-Bound Breeches — mythic serpent-hide mail legs.

import { defineItem } from '../define.js';

const SERPENT_SUMMON_COUNT = 3;
const SERPENT_HIDE_TURNS = 8;
const SPECTRAL_SERPENT_TURNS = 10;

defineItem('lodbrok_serpent_bound_breeches', {
  name: "Loðbrók's Serpent-Bound Breeches",
  type: 'armor',
  slot: 'legs',

  glyph: ']',
  color: '#2f3a26',
  glow: '#6f8f3a',
  scale: 0.78,

  weight: 5.5,
  value: 420,
  rarity: 'epic',
  material: 'serpenthide',

  description: "Cursed serpenthide mail that hardens into a thorned ward under pressure, then answers with spectral snakes when you slip the trap.",

  tags: [
    'armor',
    'legs',
    'mail',
    'serpent',
    'poison',
    'weatherproof',
    'mythic',
    'raider',
    'volatile',
    'bind_on_pickup',
  ],

  bonuses: {
    evade: 2,
    maxStamina: 10,
    critChance: 0.04,
    defense: 2,
  },

  procPackages: ['serpentBoundBreeches'],

  abilities: {
    laugh_at_the_pit: {
      name: 'Laugh at the Pit',
      icon: '🐍',
      targeting: 'none',
      cooldown: 100,
      serpentCount: SERPENT_SUMMON_COUNT,
      serpentHideTurns: SERPENT_HIDE_TURNS,
      serpentTurns: SPECTRAL_SERPENT_TURNS,
      description: 'Breaks snares, roots, webs, freezing, grapples, and constriction. Summons {serpentCount} spectral serpents for {serpentTurns} turns and grants serpent-hide for {serpentHideTurns} turns.',
      displayFormat: '{description} Cooldown: {cooldown} turns.',
      onActivate(ctx) {
        ctx.cure(ctx.user, [
          'slowed',
          'slow',
          'rooted',
          'snared',
          'webbed',
          'frozen',
          'grappled',
          'constricted',
        ]);

        ctx.apply(ctx.user, 'serpent_hide', SERPENT_HIDE_TURNS, { potency: 1 });

        ctx.setCooldown(100);
        ctx.message('{user} laughs at the pit — spectral serpents coil around them.', 'good');
        ctx.present('laugh_at_the_pit', { user: ctx.user, turns: SPECTRAL_SERPENT_TURNS });

        ctx.emit('lodbrok:laugh_at_pit', {
          actor: ctx.user,
          serpentCount: SERPENT_SUMMON_COUNT,
          serpentTurns: SPECTRAL_SERPENT_TURNS,
        });
      },
    },
  },

  presentations: {
    laugh_at_the_pit: {
      sound: 'poison_bloom',
      vfx: [
        { type: 'burst', color: '#6f8f3a', count: 12, speed: 1.4, life: 0.5 },
        { type: 'glow', color: '#3f5f2f', radius: 1.7, life: 1.3 },
        { type: 'floatText', text: 'LAUGH AT THE PIT', color: '#b6d957', life: 1.2 },
      ],
    },
  },

  meta: {
    bindOnPickup: true,
    armorClass: 'mail_legs',
    classFit: ['hunter', 'shaman', 'evoker'],
  },
});

/*
Materials Flavor / Future Crafting Notes

5x Serpenthide Scale
4x Shaggy Direwolf Pelt
3x Tarred Sailcloth
2x Blackened Iron Rivets
1x Lindworm Venom Gland
1x Rune-Etched Whale Bone

serpent-scale leather as the outer armor
harvested from a lindworm or sea-serpent, cured until the scales lie flat but still flex like hide.

bear or wolf pelt backing
the “hairy breeches” part — shaggy, insulating, primitive, and faintly ridiculous.

tar-boiled linen binding
wrapped through the seams, making them waterproof and blackened like ship-rigging.

iron serpent-rings
small riveted rings along the thighs and knees, more ritual than practical.

ash, venom, and whale-oil treatment
rubbed into the leather so blades slide oddly and the item has that Norse “this was made by someone who believed poison was a blessing” energy.
*/
