import { defineEffect, defineItem } from '../define.js';

// Pocket tools: activate from the bag or a quick slot; no equipment or gem socket.
defineEffect('bloodglass_tithe', {
  name: 'Bloodglass Tithe',
  description: 'The glass measures out your life in drops of spellpower.',
  visualIdentity: 'bloodglass_hourglass',
  periodic: [
    { operation: 'mana_restore', amount: 3 },
    { operation: 'damage', amount: 2, interval: 2, damageType: 'generic' },
  ],
});

defineItem('bloodglass_hourglass', {
  name: 'Bloodglass Hourglass', type: 'tool', material: 'glass', rarity: 'rare',
  glyph: '⌛', color: '#eb718f', glow: '#a63260', scale: 0.65,
  value: 160, weight: 0.4, identified: true,
  description: 'Pocket relic. Use: restore 3 mana each turn for 6 turns, but take 2 damage every 2 turns. 18-turn cooldown. The sand is suspiciously warm.',
  abilities: {
    turn_glass: {
      name: 'Turn the Glass', icon: '⌛', targeting: 'none', cooldown: 18,
      effects: [{ key: 'bloodglass_tithe', turnsLeft: 6 }],
      onActivate(ctx) {
        ctx.message('The {item} turns. Red sand rises toward your heart.', 'danger');
        ctx.present('turn', { target: ctx.user });
      },
    },
  },
  presentations: {
    turn: { vfx: [
      { type: 'burst', color: '#eb718f', count: 9, speed: 0.6, life: 0.6 },
      { type: 'glow', color: '#a63260', radius: 1.3, life: 1.0 },
    ] },
  },
});

defineEffect('widows_thread', {
  name: "Widow's Thread", stacking: 'stack', maxStacks: 3, match: 'actor',
  description: 'Each thread adds another point of venom damage per turn, up to three. Reapplication refreshes the six-turn knot.',
  visualIdentity: 'widows_spool',
  periodic: [{ operation: 'damage', amount: 1, damageType: 'poison' }],
});

defineItem('widows_spool', {
  name: "Widow's Spool", type: 'tool', material: 'bone', rarity: 'rare',
  glyph: '§', color: '#b4e77b', glow: '#628e43', scale: 0.7,
  value: 120, weight: 0.2, identified: true, chargePool: { current: 6, max: 6 },
  description: 'Pocket relic. Use on an enemy within 5 tiles: knot a venom thread for 6 turns. Each thread deals 1 poison damage per turn; stacks to 3. 6 charges; 1-turn cooldown. Something at the far end keeps sewing.',
  abilities: {
    stitch: {
      name: 'Stitch Venom', icon: '§', targeting: 'enemy', range: 5, cooldown: 1, chargeCost: 1,
      effects: [{ key: 'widows_thread', turnsLeft: 6 }],
      onActivate(ctx) {
        ctx.message('A green thread slips from the {item} and knots itself tight.', 'system');
        ctx.present('stitch', { target: ctx.target });
      },
    },
  },
  presentations: {
    stitch: { vfx: [
      { type: 'burst', color: '#b4e77b', count: 8, speed: 0.5, life: 0.5 },
      { type: 'floatText', text: 'KNOTTED', color: '#b4e77b' },
    ] },
  },
});

defineEffect('drowned_mercy', {
  name: 'Drowned Mercy', statuses: ['stunned'],
  description: 'A merciful silence: the enemy cannot act, but its wounds close while the bell rings.',
  visualIdentity: 'drowned_bell',
  periodic: [{ operation: 'heal', amount: 2 }],
});

defineItem('drowned_bell', {
  name: 'Bell of the Drowned Saint', type: 'tool', material: 'bronze', rarity: 'rare',
  glyph: '♧', color: '#8ed9df', glow: '#408caa', scale: 0.7,
  value: 140, weight: 0.7, identified: true, chargePool: { current: 3, max: 3 },
  description: 'Pocket relic. Use on an enemy within 4 tiles: stun for 3 turns, but heal it for 2 HP each turn. 3 charges; 12-turn cooldown. Its clapper is a pearl. Its kindness is inconvenient.',
  abilities: {
    toll: {
      name: 'Merciful Toll', icon: '♧', targeting: 'enemy', range: 4, cooldown: 12, chargeCost: 1,
      effects: [{ key: 'drowned_mercy', turnsLeft: 3 }],
      onActivate(ctx) {
        ctx.message('The {item} rings like a prayer heard underwater.', 'system');
        ctx.present('toll', { target: ctx.target });
      },
    },
  },
  presentations: {
    toll: { vfx: [
      { type: 'lightPulse', color: '#8ed9df', radius: 3, duration: 0.5 },
      { type: 'floatText', text: 'HUSH', color: '#8ed9df' },
    ] },
  },
});

defineEffect('brass_cricket_song', {
  name: 'Brass Cricket Song', stacking: 'independent',
  description: 'Each winding sings its own six-turn song. Overlapping songs restore more stamina and exact more blood.',
  visualIdentity: 'brass_cricket',
  periodic: [
    { operation: 'stamina_restore', amount: 3 },
    { operation: 'damage', amount: 1, interval: 2, damageType: 'generic' },
  ],
});

defineItem('brass_cricket', {
  name: 'Brass Cricket', type: 'tool', material: 'bronze', rarity: 'uncommon',
  glyph: '♪', color: '#f2ce69', glow: '#b18435', scale: 0.65,
  value: 90, weight: 0.2, identified: true, chargePool: { current: 4, max: 4 },
  description: 'Pocket relic. Use: restore 3 stamina each turn for 6 turns, but take 1 damage every 2 turns. Songs overlap independently. 4 windings; 2-turn cooldown. It knows the marching song your knees have forgotten.',
  abilities: {
    wind: {
      name: 'Wind the Cricket', icon: '♪', targeting: 'none', cooldown: 2, chargeCost: 1,
      effects: [{ key: 'brass_cricket_song', turnsLeft: 6 }],
      onActivate(ctx) {
        ctx.message('The {item} chirrs. Your legs hurry to keep time.', 'system');
        ctx.present('chirp', { target: ctx.user });
      },
    },
  },
  presentations: {
    chirp: { vfx: [
      { type: 'burst', color: '#f2ce69', count: 6, speed: 0.8, life: 0.5 },
      { type: 'floatText', text: '♪', color: '#f2ce69' },
    ] },
  },
});
