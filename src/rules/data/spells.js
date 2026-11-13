// rules/data/spells.js
// Pure rules-side spell definitions. No visuals here.
/**
 * @typedef {Object} SpellEffectDef
 * @property {'damage'|'status'|'effect'|'movement'|'utility'} kind
 * @property {string} [element]
 * @property {string} [amount]
 * @property {string} [status]
 * @property {string} [duration]
 * @property {string} [mode]
 * @property {string} [note]
 */

/**
 * @typedef {Object} SpellActiveEffectDef
 * @property {number} duration
 * @property {number} [potency]
 * @property {number} [stacks]
 * @property {string[]} [capabilities]
 * @property {string[]} [statuses]
 * @property {Record<string, any>} [mechanics]
 */

/**
 * @typedef {Object} SpellDef
 * @property {string} id
 * @property {string} name
 * @property {string} [symbol]  // unicode glyph for UI display
 * @property {number} manaCost
 * @property {'mana'|'stamina'|'life'} [costResource]
 * @property {number} [staminaCost]
 * @property {number} [lifeCost]
 * @property {number} [minIntelligence]
 * @property {number} [range]   // max casting range in tiles
 * @property {number} [castTime] // turns to channel before casting (0 or omitted = instant)
 * @property {boolean} [breakOnDamage] // incoming damage interrupts a cast/channel
 * @property {number} [damageSetbackTurns] // incoming damage delays a cast/channel instead of cancelling it
 * @property {boolean} [channeling] // true = sustained realtime channel until cancelled
 * @property {number} [manaPerTick] // mana drained each channel tick when channeling
 * @property {number} [staminaPerTick] // stamina drained each channel tick when channeling
 * @property {number} [lifePerTick] // life drained each channel tick when channeling
 * @property {number} [boltsPerTick] // storm impacts per sustain tick
 * @property {string} [script]  // optional key for scripted behavior
 * @property {string} [description] // flavor-forward tooltip text
 * @property {'self'|'target'|'auto'|'path'|'area'|'enemy'} [targeting]
 * @property {number} [radius]
 * @property {number} [maxTargets]
 * @property {SpellEffectDef[]} [effects]
 * @property {SpellActiveEffectDef} [activeEffect]
 * @property {string[]} [schools]           // spell schools, e.g. ['destruction'], ['destruction','trickery']
 * @property {boolean}  [clearMindedCasting] // true = resolves normally even when caster is confused
 * @property {number}   [cooldown]           // turns before the spell can be cast again (0 or omitted = no cooldown)
 * @property {{ flatThreat?: number, threatMult?: number, threatKind?: string, targetField?: string, targetsField?: string, requiresField?: string }} [threat]
 */

/** @type {Record<string, SpellDef>} */
export const SPELL_DEFS = {
  lightning: {
    id: 'lightning',
    name: 'Lightning',
    symbol: '\u26A1',       // ⚡
    schools: ['destruction', 'electric', 'nature'],
    manaCost: 7,
    minIntelligence: 8,
    range: 12,
    script: 'lightning',
    targeting: 'auto',
    maxTargets: 3,
    description: 'A needle-bright bolt that leaps from foe to foe.',
    effects: [
      { kind: 'damage', element: 'electric', amount: '7 base, INT-scaled, can crit; reduced per jump' },
      { kind: 'utility', note: 'Chains to additional nearby enemies' },
    ],
  },
  meteor: {
    id: 'meteor',
    name: 'Meteor',
    symbol: '\u2604',       // ☄
    schools: ['destruction', 'fire'],
    manaCost: 12,
    minIntelligence: 0,
    range: 12,
    cooldown: 10,
    script: 'meteor',
    targeting: 'target',
    radius: 2,
    description: 'Drag a star to earth and let the blast wave finish the rest.',
    effects: [
      { kind: 'damage', element: 'fire', amount: '10 near impact, 5 on outer ring; INT-scaled, can crit' },
      { kind: 'status', status: 'burn', duration: '4 turns; spell-burn ticks also scale and can crit' },
    ],
  },
  blastwave: {
    id: 'blastwave',
    name: 'Blast Wave',
    symbol: '\u25CE',       // ◎
    schools: ['destruction', 'force'],
    manaCost: 7,
    minIntelligence: 0,
    script: 'blastwave',
    targeting: 'self',
    radius: 2,
    description: 'Release a concussive ring that batters and scatters nearby bodies.',
    effects: [
      { kind: 'damage', element: 'physical', amount: 'distance-scaled, INT-scaled, can crit' },
      { kind: 'movement', mode: 'knockback', note: 'Pushes targets away from caster' },
    ],
  },
  frost_nova: {
    id: 'frost_nova',
    name: 'Frost Nova',
    symbol: '\u2746',       // ❆
    schools: ['destruction', 'cold'],
    manaCost: 8,
    minIntelligence: 0,
    script: 'frost_nova',
    targeting: 'self',
    radius: 2,
    activeEffect: {
      duration: 8,
      potency: 1,
      stacks: 1,
      capabilities: ['immobilized', 'frozen'],
    },
    description: 'Burst a ring of blue ice from your feet, freezing nearby enemies in place.',
    effects: [
      { kind: 'damage', element: 'cold', amount: 'distance-scaled, INT-scaled, can crit' },
      { kind: 'effect', effect: 'frost_nova', note: 'freeze and root' },
    ],
  },
  mass_delirium: {
    id: 'mass_delirium',
    name: 'Mass Delirium',
    symbol: '\u2234',       // ∴
    schools: ['trickery', 'illusion', 'mind'],
    manaCost: 0,
    minIntelligence: 0,
    script: 'mass_delirium',
    targeting: 'self',
    radius: 32,
    activeEffect: {
      duration: 50,
      potency: 1,
      stacks: 1,
      statuses: ['confused'],
      capabilities: ['spell_impaired'],
    },
    threat: { flatThreat: 3, threatKind: "spell_control", targetsField: "affectedIds" },
    description: 'Unspool a field of impossible syntax that leaves nearby minds stumbling over themselves.',
    effects: [
      { kind: 'effect', effect: 'mass_delirium', note: 'projects confused; reader condition affects duration, not power' },
      { kind: 'utility', note: 'Wide self-centered area; affects living creatures without changing faction loyalty' },
    ],
  },
  blink: {
    id: 'blink',
    name: 'Blink',
    symbol: '\u{1F3C3}',   // 🏃
    schools: ['trickery', 'illusion', 'alteration'],
    clearMindedCasting: true,
    manaCost: 6,
    minIntelligence: 0,
    range: 10,
    cooldown: 8,
    script: 'blink',
    targeting: 'target',
    description: 'Fold space like cloth and step out where the seam opens.',
    effects: [
      { kind: 'movement', mode: 'teleport', note: 'Up to 10 tiles; snaps to nearest safe landing' },
      { kind: 'utility', note: 'Confusion or hallucination can randomize destination' },
    ],
  },
  homecoming: {
    id: 'homecoming',
    name: 'Homecoming',
    symbol: '\u{1F3E0}',   // 🏠
    manaCost: 1,
    minIntelligence: 0,
    cooldown: 20,
    script: 'homecoming',
    targeting: 'self',
    description: 'A homesick charm that yanks your soul toward the first stair.',
    effects: [
      { kind: 'movement', mode: 'depth-teleport', note: 'Returns caster to depth 0' },
      { kind: 'utility', note: 'Stores return ticket to prior depth and tile' },
    ],
  },
  hearthstone: {
    id: 'hearthstone',
    name: 'Hearthstone',
    symbol: '\u{1FAA8}',   // 🪨
    manaCost: 0,
    minIntelligence: 0,
    castTime: 10,
    script: 'hearthstone',
    targeting: 'self',
    description: 'Focus your will on hearth and home. After a long channel, you are pulled back to safety.',
    effects: [
      { kind: 'movement', mode: 'depth-teleport', note: 'Returns caster to depth 0 after 10-turn channel' },
      { kind: 'utility', note: 'Stores return ticket to prior depth and tile' },
    ],
  },
  fishing: {
    id: 'fishing',
    name: 'Fishing',
    symbol: 'F',
    schools: ['survival', 'nature'],
    manaCost: 0,
    minIntelligence: 0,
    clearMindedCasting: true,
    range: 6,
    castTime: 12,
    breakOnMove: true,
    script: 'fishing',
    targeting: 'target',
    description: 'Cast a line into water and hold steady until something bites.',
    effects: [
      { kind: 'utility', note: 'Requires an equipped fishing rod and a water tile target' },
      { kind: 'utility', note: 'Completes after a short channel and can add a catch to inventory' },
    ],
  },
  frost: {
    id: 'frost',
    name: 'Frost',
    symbol: '\u2744',       // ❄
    schools: ['destruction'],
    manaCost: 5,
    minIntelligence: 0,
    script: 'frost',
    targeting: 'auto',
    description: 'Winter-sharp shards bite deep and numb whatever survives.',
    effects: [
      { kind: 'damage', element: 'cold', amount: '4 base, INT-scaled, can crit' },
      { kind: 'status', status: 'frost', duration: '2-5 turns (longer on lighter targets)' },
    ],
  },
  fear: {
    id: 'fear',
    name: 'Fear',
    symbol: '\u2620',       // ☠
    schools: ['shadow', 'mind'],
    manaCost: 6,
    minIntelligence: 0,
    range: 8,
    castTime: 2,
    script: 'fear',
    targeting: 'enemy',
    description: 'Plant a deathly vision in a foe, forcing it to run from you.',
    effects: [
      { kind: 'status', status: 'fear', duration: '4-7 turns, INT-scaled' },
      { kind: 'movement', mode: 'flee', note: 'Target runs away while feared' },
    ],
  },
  blizzard: {
    id: 'blizzard',
    name: 'Blizzard',
    symbol: '\u2738', // ✸
    schools: ['destruction'],
    manaCost: 3,
    manaPerTick: 3,
    channeling: true,
    boltsPerTick: 3,
    minIntelligence: 0,
    range: 10,
    radius: 2,
    script: 'blizzard',
    targeting: 'area',
    description: 'Hold the sky open and let winter keep striking the ground you chose.',
    effects: [
      { kind: 'damage', element: 'cold', amount: 'Repeated low-damage ice strikes in the chosen storm area' },
      { kind: 'status', status: 'frost', duration: 'Brief slowing on creatures caught by an impact' },
      { kind: 'utility', note: 'Sustained channel; spends mana every realtime tick until cancelled or emptied' },
    ],
  },
  firestorm: {
    id: 'firestorm',
    name: 'Firestorm',
    symbol: '\u{1F525}', // 🔥
    schools: ['destruction', 'fire'],
    manaCost: 4,
    manaPerTick: 4,
    channeling: true,
    boltsPerTick: 3,
    minIntelligence: 0,
    range: 10,
    radius: 3,
    script: 'firestorm',
    targeting: 'area',
    description: 'Sustain a rain of cinders and falling embers over a marked patch of ground.',
    effects: [
      { kind: 'damage', element: 'fire', amount: 'Repeated low-damage fire strikes in the chosen storm area' },
      { kind: 'status', status: 'burn', duration: 'Short burning applied to survivors struck by an impact' },
      { kind: 'utility', note: 'Sustained channel; spends mana every realtime tick until cancelled or emptied' },
    ],
  },
  heal: {
    id: 'heal',
    name: 'Heal',
    symbol: '\u2764',       // ❤
    schools: ['healing','restoration'],
    manaCost: 8,
    minIntelligence: 0,
    range: 6,
    castTime: 3,
    script: 'heal',
    targeting: 'target',
    description: 'Thread raw mana through wounds until flesh remembers itself.',
    effects: [
      { kind: 'utility', note: 'Heals self or ally; cannot affect enemies' },
      { kind: 'utility', note: 'Restores about 20-35 HP, plus intelligence scaling' },
    ],
  },
  flash_heal: {
    id: 'flash_heal',
    name: 'Flash Heal',
    symbol: '\u2728',       // ✨
    schools: ['healing', 'holy', 'restoration'],
    clearMindedCasting: true,
    manaCost: 14,
    minIntelligence: 0,
    castTime: 1,
    script: 'flash_heal',
    targeting: 'self',
    description: 'A sudden burst of holy light that seals your wounds in an instant.',
    effects: [
      { kind: 'utility', note: 'Self-cast only' },
      { kind: 'utility', note: 'Consumes roughly a quarter of a cleric\'s starting mana' },
      { kind: 'utility', note: 'Restores 22% of max HP (minimum 1)' },
      { kind: 'damage', element: 'holy', amount: '2 base to adjacent hostile creatures; INT-scaled, can crit' },
    ],
  },
  renewal: {
    id: 'renewal',
    name: 'Renewal',
    symbol: '\u273F',       // ✿
    schools: ['healing', 'nature', 'restoration'],
    manaCost: 9,
    minIntelligence: 0,
    range: 6,
    script: 'renewal',
    targeting: 'target',
    description: 'Set a patient weave of living magic into a wounded ally.',
    effects: [
      { kind: 'utility', note: 'Heals an ally immediately, then restores health over 5 turns' },
      { kind: 'utility', note: 'The ongoing renewal is replaced, not stacked' },
    ],
  },
  sacred_restoration: {
    id: 'sacred_restoration',
    name: 'Sacred Restoration',
    symbol: '\u2727',       // ✧
    schools: ['healing', 'holy', 'restoration'],
    manaCost: 18,
    minIntelligence: 0,
    range: 7,
    castTime: 5,
    breakOnDamage: true,
    breakOnMove: true,
    script: 'sacred_restoration',
    targeting: 'target',
    description: 'Gather a deep reservoir of healing light and pour it into one battered ally.',
    effects: [
      { kind: 'utility', note: 'Large single-target heal after a 5-turn cast' },
      { kind: 'utility', note: 'Incoming damage or movement interrupts the cast' },
    ],
  },
  lifebloom: {
    id: 'lifebloom',
    name: 'Lifebloom',
    symbol: '\u2740',       // ❀
    schools: ['healing', 'nature', 'restoration'],
    manaCost: 4,
    manaPerTick: 4,
    channeling: true,
    minIntelligence: 0,
    radius: 3,
    script: 'lifebloom',
    targeting: 'self',
    description: 'Raise a living chorus that mends every nearby ally while you hold the note.',
    effects: [
      { kind: 'utility', note: 'Sustained area heal around the caster' },
      { kind: 'utility', note: 'The channel ends when mana runs out or the caster is interrupted' },
    ],
  },
  smite: {
    id: 'smite',
    name: 'Smite',
    symbol: '\u2726', // ✦
    schools: ['holy', 'destruction'],
    manaCost: 6,
    castTime: 2,
    minIntelligence: 0,
    range: 8,
    script: 'smite',
    targeting: 'target',
    description: 'Call down a clean spear of judgment on the nearest sinner in sight.',
    effects: [
      { kind: 'damage', element: 'holy', amount: '6 base, INT-scaled, can crit' },
      { kind: 'utility', note: 'Targets a hostile creature in line of sight' },
    ],
  },
  boar_charge: {
    id: 'boar_charge',
    name: 'Boar Charge',
    symbol: '\u21E2', // ⇢
    schools: ['bestial'],
    manaCost: 0,
    minIntelligence: 0,
    range: 5,
    impactDamage: 6,
    stunTurns: 1,
    script: 'boar_charge',
    targeting: 'enemy',
    description: 'Lower tusks and thunder forward, trampling through open lanes.',
    effects: [
      { kind: 'movement', mode: 'dash', note: 'Rushes in a straight line toward the target' },
      { kind: 'damage', element: 'physical', amount: 'On-hit impact damage with light knockback' },
      { kind: 'status', status: 'stun', duration: '1 turn on hit' },
    ],
  },
  boar_bite: {
    id: 'boar_bite',
    name: 'Boar Bite',
    symbol: '\u02C7', // ˇ
    schools: ['bestial'],
    manaCost: 0,
    minIntelligence: 0,
    range: 1,
    script: 'boar_bite',
    targeting: 'enemy',
    description: 'A snapping tusk-and-jaw bite that leaves the target briefly weakened.',
    effects: [
      { kind: 'damage', element: 'physical', amount: 'Close-range bite damage' },
      { kind: 'status', status: 'weakened', duration: '1 turn on hit' },
    ],
  },
  rat_gnaw: {
    id: 'rat_gnaw',
    name: 'Rat Gnaw',
    symbol: '\u02D2', // ˒
    schools: ['bestial'],
    manaCost: 0,
    minIntelligence: 0,
    range: 1,
    script: 'rat_gnaw',
    targeting: 'enemy',
    description: 'A filthy gnaw that tears skin and opens a shallow bleed.',
    effects: [
      { kind: 'damage', element: 'physical', amount: 'Light close-range bite damage' },
      { kind: 'status', status: 'bleeding', duration: '2 turns on hit' },
    ],
  },
  goblin_dirty_trick: {
    id: 'goblin_dirty_trick',
    name: 'Dirty Trick',
    symbol: '\u2731', // ✱
    schools: ['martial'],
    manaCost: 0,
    minIntelligence: 0,
    range: 1,
    script: 'goblin_dirty_trick',
    targeting: 'enemy',
    description: 'A low cheap-shot slash aimed to blur your vision for a moment.',
    effects: [
      { kind: 'damage', element: 'physical', amount: 'Light close-range slash damage' },
      { kind: 'status', status: 'blinded', duration: '1 turn on hit' },
    ],
  },
  snake_fang: {
    id: 'snake_fang',
    name: 'Snake Fang',
    symbol: '\u2307', // ⌇
    schools: ['bestial', 'chemical'],
    manaCost: 0,
    minIntelligence: 0,
    range: 1,
    script: 'snake_fang',
    targeting: 'enemy',
    description: 'A committed fang strike that drives venom deep into the wound.',
    effects: [
      { kind: 'damage', element: 'physical', amount: 'Close-range bite damage' },
      { kind: 'status', status: 'poisoned', duration: '4 turns on hit' },
    ],
  },
  spider_lunge: {
    id: 'spider_lunge',
    name: 'Spider Lunge',
    symbol: '\u27A4', // ➤
    schools: ['bestial'],
    manaCost: 0,
    minIntelligence: 0,
    range: 1,
    script: 'spider_lunge',
    targeting: 'enemy',
    description: 'A sudden body-check and bite that leaves the target staggered.',
    effects: [
      { kind: 'damage', element: 'physical', amount: 'Close-range lunge damage' },
      { kind: 'status', status: 'staggered', duration: '1 turn on hit' },
    ],
  },
  bat_shriek: {
    id: 'bat_shriek',
    name: 'Bat Shriek',
    symbol: '\u266B', // ♫
    schools: ['bestial', 'sonic'],
    manaCost: 0,
    minIntelligence: 0,
    range: 6,
    radius: 4,
    script: 'bat_shriek',
    targeting: 'self',
    description: 'A piercing cry that stirs nearby hostiles toward the player.',
    confuseTurns: 0,
    effects: [
      { kind: 'utility', note: 'Nearby same-faction enemies are alerted toward the player' },
    ],
  },
  shrieker_scream: {
    id: 'shrieker_scream',
    name: 'Shriek',
    symbol: '\u2620', // ☠
    schools: ['bestial', 'sonic'],
    manaCost: 0,
    minIntelligence: 0,
    range: 10,
    radius: 8,
    confuseTurns: 3,
    script: 'bat_shriek',
    targeting: 'self',
    description: 'An ear-splitting scream that wakes everything on the floor.',
    effects: [
      { kind: 'status', status: 'confused', duration: '3 turns to nearby hostiles' },
      { kind: 'utility', note: 'Alerts all monsters in large radius toward the player' },
    ],
  },
  web_spit: {
    id: 'web_spit',
    name: 'Web Spit',
    symbol: '\u2739', // ✹
    schools: ['bestial'],
    manaCost: 0,
    minIntelligence: 0,
    range: 6,
    slowTurns: 2,
    slowPotency: 1,
    script: 'web_spit',
    targeting: 'enemy',
    threat: { flatThreat: 3, threatKind: "spell_control", targetField: "targetId", requiresField: "slowed" },
    description: 'Hurls sticky silk that webs the tile and slows the struck target.',
    effects: [
      { kind: 'utility', note: 'Spawns a web tile at the target location' },
      { kind: 'status', status: 'slowed', duration: '2 turns on hit' },
    ],
  },
  wolf_howl: {
    id: 'wolf_howl',
    name: 'Wolf Howl',
    symbol: '\u266C', // ♬
    schools: ['bestial'],
    manaCost: 0,
    minIntelligence: 0,
    radius: 6,
    rallyTurns: 5,
    castTime: 3,
    auraVisual: 'pack',
    script: 'wolf_howl',
    targeting: 'self',
    description: 'A pack-call that hastens nearby allies and drives them into a coordinated hunt.',
    effects: [
      { kind: 'status', status: 'hastened', duration: '5 turns to nearby same-faction allies' },
      { kind: 'utility', note: 'Nearby allies are alerted and pointed toward the player' },
    ],
  },
  plaguebearer_aura: {
    id: 'plaguebearer_aura',
    name: 'Plaguebearer Aura',
    symbol: '\u2623', // ☣
    schools: ['chemical', 'necromancy'],
    manaCost: 0,
    minIntelligence: 0,
    radius: 3,
    auraTurns: 5,
    auraEffect: 'poison',
    auraEffectTurns: 3,
    auraPotency: 1,
    auraTarget: 'hostile',
    auraVisual: 'toxic',
    script: 'faction_aura',
    targeting: 'self',
    description: 'Radiates a sickly miasma that poisons nearby hostile creatures.',
    effects: [
      { kind: 'status', status: 'poison', duration: '3 turns to nearby hostiles' },
      { kind: 'utility', note: 'Leaves a persistent toxic aura for 5 turns' },
    ],
  },
  war_drum: {
    id: 'war_drum',
    name: 'War Drum',
    symbol: '\u266B', // ♫
    schools: ['martial'],
    manaCost: 0,
    minIntelligence: 0,
    radius: 4,
    auraTurns: 5,
    auraEffect: 'hastened',
    auraEffectTurns: 2,
    auraPotency: 1,
    auraTarget: 'allied',
    auraVisual: 'rally',
    script: 'faction_aura',
    targeting: 'self',
    description: 'A pounding rhythm drives nearby allies into a faster attack cadence.',
    effects: [
      { kind: 'status', status: 'hastened', duration: '2 turns to nearby allies' },
      { kind: 'utility', note: 'Leaves a persistent rallying aura for 5 turns' },
    ],
  },
  dread_warden_aura: {
    id: 'dread_warden_aura',
    name: 'Dread Warden Aura',
    symbol: '\u2620', // ☠
    schools: ['necromancy', 'shadow'],
    manaCost: 0,
    minIntelligence: 0,
    radius: 3,
    auraTurns: 5,
    auraEffect: 'fear',
    auraEffectTurns: 2,
    auraPotency: 1,
    auraTarget: 'hostile',
    auraVisual: 'dread',
    script: 'faction_aura',
    targeting: 'self',
    description: 'Projects a ward of terror that frightens nearby hostile creatures.',
    effects: [
      { kind: 'status', status: 'fear', duration: '2 turns to nearby hostiles' },
      { kind: 'utility', note: 'Leaves a persistent dread aura for 5 turns' },
    ],
  },
  void_priest_aura: {
    id: 'void_priest_aura',
    name: 'Void Priest Aura',
    symbol: '\u2205', // ∅
    schools: ['void', 'arcane'],
    manaCost: 0,
    minIntelligence: 0,
    radius: 3,
    auraTurns: 5,
    auraEffect: 'silenced',
    auraEffectTurns: 2,
    auraPotency: 1,
    auraTarget: 'hostile',
    auraVisual: 'void',
    script: 'faction_aura',
    targeting: 'self',
    description: 'Thins the world around it, suppressing spellcasting by nearby hostiles.',
    effects: [
      { kind: 'status', status: 'silenced', duration: '2 turns to nearby hostiles' },
      { kind: 'utility', note: 'Leaves a persistent anti-magic aura for 5 turns' },
    ],
  },
  blood_herald_aura: {
    id: 'blood_herald_aura',
    name: 'Blood Herald Aura',
    symbol: '\u2665', // ♥
    schools: ['blood', 'martial'],
    manaCost: 0,
    minIntelligence: 0,
    radius: 3,
    auraTurns: 5,
    auraEffect: 'berserk',
    auraEffectTurns: 3,
    auraPotency: 1,
    auraTarget: 'allied',
    auraVisual: 'blood',
    auraWoundedOnly: true,
    script: 'faction_aura',
    targeting: 'self',
    description: 'Stokes wounded allies into a blood-frenzied assault.',
    effects: [
      { kind: 'status', status: 'berserk', duration: '3 turns to nearby wounded allies' },
      { kind: 'utility', note: 'Leaves a persistent wounded-allies aura for 5 turns' },
    ],
  },
  shield_bash: {
    id: 'shield_bash',
    name: 'Shield Bash',
    symbol: '\u25C8', // ◈
    schools: ['martial'],
    manaCost: 0,
    minIntelligence: 0,
    range: 1,
    script: 'shield_bash',
    targeting: 'enemy',
    description: 'A close-range slam that rattles and shoves the target backward.',
    effects: [
      { kind: 'damage', element: 'physical', amount: 'Short-range impact damage' },
      { kind: 'status', status: 'stun', duration: '1 turn' },
      { kind: 'movement', mode: 'knockback', note: 'Pushes target 1 tile on contact' },
    ],
  },
  acid_spit: {
    id: 'acid_spit',
    name: 'Acid Spit',
    symbol: '\u223F', // ∿
    schools: ['bestial', 'chemical'],
    manaCost: 0,
    minIntelligence: 0,
    range: 6,
    script: 'acid_spit',
    targeting: 'enemy',
    description: 'A glob of caustic bile that corrodes flesh and leaves a sizzling patch.',
    effects: [
      { kind: 'damage', element: 'acid', amount: 'Ranged acid impact damage' },
      { kind: 'status', status: 'weakened', duration: '2 turns on hit' },
    ],
  },
  poison_spit: {
    id: 'poison_spit',
    name: 'Poison Spit',
    symbol: '\u223F', // ∿
    schools: ['bestial', 'poison'],
    manaCost: 0,
    minIntelligence: 0,
    range: 5,
    script: 'poison_spit',
    targeting: 'enemy',
    description: 'A venom glob that sickens prey and leaves noxious residue.',
    effects: [
      { kind: 'damage', element: 'poison', amount: 'Ranged poison impact damage' },
      { kind: 'status', status: 'poison', duration: '4 turns on hit' },
    ],
  },
  death_volley: {
    id: 'death_volley',
    name: 'Death Volley',
    symbol: '\u27B3', // ➳
    schools: ['martial', 'undead'],
    manaCost: 0,
    minIntelligence: 0,
    range: 10,
    radius: 1,
    script: 'death_volley',
    targeting: 'enemy',
    description: 'A staggered burst of spectral arrows rains onto a marked patch.',
    effects: [
      { kind: 'damage', element: 'pierce', amount: 'Single-shot damage to target tile and nearby neighbors' },
      { kind: 'utility', note: 'Telegraphed before release by elite archers' },
    ],
  },
  summon_skeleton: {
    id: 'summon_skeleton',
    name: 'Summon Skeleton',
    symbol: '\u{1F480}',   // 💀
    manaCost: 10,
    minIntelligence: 8,
    castTime: 5,
    script: 'summon_skeleton',
    targeting: 'self',
    description: 'Rip a skeleton from the earth to fight at your side.',
    effects: [
      { kind: 'utility', note: 'Summons a friendly skeleton nearby' },
      { kind: 'utility', note: 'Skeleton is always aggressive toward enemies' },
    ],
  },
  resurrection: {
    id: 'resurrection',
    name: 'Resurrection',
    symbol: '\u2620',
    manaCost: 18,
    minIntelligence: 10,
    castTime: 4,
    range: 8,
    script: 'resurrection',
    targeting: 'target',
    description: 'Call a fallen creature back into the world as a temporary undead ally. Powerful corpses burn out quickly.',
    effects: [
      { kind: 'utility', note: 'Raises a nearby corpse as a temporary friendly undead' },
      { kind: 'utility', note: 'Powerful corpses rise briefly before burning out' },
    ],
  },
  shadow_bolt: {
    id: 'shadow_bolt',
    name: 'Shadow Bolt',
    symbol: '\u{1F31A}',   // 🌚
    manaCost: 15,
    minIntelligence: 8,
    range: 10,
    castTime: 1,
    script: 'shadow_bolt',
    targeting: 'auto',
    description: 'A bolt of pure shadow that strikes with devastating force.',
    effects: [
      { kind: 'damage', element: 'shadow', amount: '12 base, INT-scaled, can crit' },
    ],
  },
  agony: {
    id: 'agony',
    name: 'Agony',
    symbol: '\u2620',       // ☠
    schools: ['destruction', 'darkness'],
    manaCost: 8,
    minIntelligence: 8,
    range: 8,
    script: 'agony',
    targeting: 'auto',
    description: 'Weave shadow into a curse that gnaws at life force. Auto-targets the visible enemy that needs agony most — missing it entirely, or closest to expiring.',
    effects: [
      { kind: 'damage', element: 'shadow', amount: 'Shadow DOT; cast-time damage scales with INT and each tick can crit' },
      { kind: 'status', status: 'agony', duration: '6-10 turns, snapshotted from cast-time INT' },
    ],
  },
  bog_curse: {
    id: 'bog_curse',
    name: 'Bog Curse',
    symbol: '\u2620',       // ☠
    schools: ['darkness', 'nature', 'curse'],
    manaCost: 0,
    minIntelligence: 6,
    range: 6,
    script: 'bog_curse',
    targeting: 'auto',
    activeEffect: {
      duration: 6,
      potency: 1,
      stacks: 1,
      capabilities: ['cursed', 'slowed'],
    },
    description: 'A marsh hex that drags luck, defense, and footing into the mud.',
    effects: [
      { kind: 'effect', effect: 'bog_curse', note: 'curse, drag, and bad footing; duration scales with intelligence' },
    ],
  },
  lifetap: {
    id: 'lifetap',
    name: 'Life Tap',
    symbol: '\u{1F4A0}',   // 💠
    schools: ['darkness'],
    manaCost: 0,
    costResource: 'life',
    lifeCost: 8,
    minIntelligence: 8,
    script: 'lifetap',
    targeting: 'self',
    description: 'Sacrifice a sliver of your life force, converting vitality into raw mana.',
    effects: [
      { kind: 'utility', note: 'Costs 8 HP, restores mana equal to 150% of HP spent (INT-scaled)' },
    ],
  },
  drain_life: {
    id: 'drain_life',
    name: 'Drain Life',
    symbol: '\u{1FA78}',   // 🩸
    schools: ['destruction', 'darkness'],
    manaCost: 2,
    manaPerTick: 2,
    channeling: true,
    minIntelligence: 8,
    range: 6,
    duration: 2,
    baseTickDamage: 2,
    healFraction: 0.75,
    breakOnMove: true,
    script: 'drain_life',
    targeting: 'enemy',
    description: 'Latch onto a hostile soul and siphon shadow each turn while you sustain the channel.',
    effects: [
      { kind: 'damage', element: 'shadow', amount: 'Ticks each turn while channel is maintained' },
      { kind: 'utility', note: 'Heals caster for a fraction of drained damage each tick' },
      { kind: 'utility', note: 'Breaks if caster moves, target leaves range, or line of sight is blocked' },
    ],
  },
  gaze_beam: {
    id: 'gaze_beam',
    name: 'Gaze Beam',
    symbol: '\u{1F441}',   // 👁
    schools: ['psychic'],
    manaCost: 0,
    channeling: true,
    castTime: 8,
    stunTurns: 3,
    stackLimit: 4,
    activeEffect: {
      duration: 3,
      potency: 1,
      stacks: 1,
      capabilities: ['immobilized', 'action_locked'],
      mechanics: { stackLimit: 4 },
    },
    script: 'gaze_beam',
    targeting: 'enemy',
    monsterOnly: true,
    breakOnNoLos: true,
    breakOnMove: true,
    description: 'The floating eye channels a psychic beam that stuns and mindwipes on completion.',
    effects: [
      { kind: 'effect', effect: 'gaze_beam', note: 'stun; mindwipe stacks up to 4' },
    ],
  },
  verdant_ward: {
    id: 'verdant_ward',
    name: 'Verdant Ward',
    symbol: '\u2042',       // ⁂
    schools: ['restoration', 'nature', 'alteration'],
    manaCost: 9,
    minIntelligence: 0,
    cooldown: 12,
    script: 'verdant_ward',
    targeting: 'self',
    activeEffect: {
      duration: 30,
      potency: 2,
      stacks: 1,
      mechanics: { tickHeal: 1, visionRampIn: 3, visionHold: 20, visionRampOut: 7 },
    },
    description: 'A blooming ward of bark and sap that knits flesh while hardening skin for a long stretch.',
    effects: [
      { kind: 'effect', effect: 'verdant_ward', note: '+2 AC, recovery, heightened sight' },
    ],
  },
  harmony_ward: {
    id: 'harmony_ward',
    name: 'Harmony Ward',
    symbol: '\u262F',       // ☯
    schools: ['restoration', 'nature', 'alteration'],
    manaCost: 11,
    minIntelligence: 0,
    cooldown: 14,
    script: 'harmony_ward',
    targeting: 'self',
    activeEffect: {
      duration: 55,
      potency: 1,
      stacks: 1,
      mechanics: { resistances: ['fire', 'poison', 'electric', 'acid'] },
    },
    description: 'A balanced seal that tempers flame, venom, shock, and acid as one harmonious ward.',
    effects: [
      { kind: 'effect', effect: 'harmony_ward', note: 'resists fire, poison, electric, and acid' },
    ],
  },
  shadow_veil: {
    id: 'shadow_veil',
    name: 'Shadow Veil',
    symbol: '\u2307',       // ⌇
    schools: ['trickery', 'illusion', 'alteration'],
    clearMindedCasting: true,
    manaCost: 8,
    minIntelligence: 0,
    cooldown: 10,
    script: 'shadow_veil',
    targeting: 'self',
    activeEffect: {
      duration: 45,
      potency: 1,
      stacks: 1,
      capabilities: ['concealed', 'phase_shift'],
      mechanics: { visionBonus: 3, visionRampIn: 2, visionHold: 35, visionRampOut: 8 },
    },
    description: 'A slit of dusk wraps your outline, making you invisible and hard to pin down.',
    effects: [
      { kind: 'effect', effect: 'shadow_veil', note: 'concealment, phase, ambush, perception' },
    ],
  },
  rampage: {
    id: 'rampage',
    name: 'Rampage',
    symbol: '\u{1F4A2}',    // 💢
    schools: ['alteration'],
    manaCost: 20,
    minIntelligence: 0,
    cooldown: 20,
    script: 'rampage',
    targeting: 'self',
    activeEffect: {
      duration: 100,
      potency: 1,
      stacks: 1,
    },
    description: 'Spend every drop of mana to fuel a long, savage battle fury.',
    effects: [
      { kind: 'effect', effect: 'rampage', note: '+3 to-hit accuracy and 1.5x melee damage' },
      { kind: 'utility', note: '+3 to-hit accuracy and 1.5x melee damage' },
    ],
  },
  phase_strike: {
    id: 'phase_strike',
    name: 'Phase Strike',
    symbol: '\u2381',       // ⌁
    schools: ['destruction', 'trickery'],
    clearMindedCasting: true,
    manaCost: 0,
    costResource: 'stamina',
    staminaCost: 10,
    minIntelligence: 0,
    range: 4,
    cooldown: 6,
    script: 'phase_strike',
    targeting: 'path',
    description: 'Slip between moments and cut everything standing on your line.',
    effects: [
      { kind: 'movement', mode: 'teleport', note: 'Dash up to 4 tiles' },
      { kind: 'damage', element: 'physical', amount: '6 base to enemies crossed; INT-scaled, can crit' },
      { kind: 'status', status: 'stun', duration: '3 turns' },
    ],
  },
  blind: {
    id: 'blind',
    name: 'Blind',
    symbol: '\u{1F441}\u{FE0F}',   // 👁️
    schools: ['trickery', 'illusion', 'darkness', 'alteration'],
    manaCost: 12,
    minIntelligence: 8,
    range: 8,
    script: 'blind',
    targeting: 'enemy',
    selfTargetable: true,
    threat: { flatThreat: 3, threatKind: "spell_control", targetField: "targetId" },
    description: 'Snuff the target\'s sight instantly, plunging them into darkness before their vision slowly recovers.',
    effects: [
      { kind: 'status', status: 'blinded', duration: 'instant blackout, 16 ticks hold, 4 ticks recovery' },
      { kind: 'utility', note: 'Sets effective vision to 0 immediately, then restores it gradually' },
    ],
  },
  earthshatter: {
    id: 'earthshatter',
    name: 'Earthshatter',
    symbol: '\u{1F30B}',   // 🌋
    schools: ['destruction', 'earth'],
    manaCost: 8,
    minIntelligence: 0,
    script: 'earthshatter',
    targeting: 'self',
    radius: 1,
    description: 'Slam the ground with devastating force, cracking the earth and stunning nearby foes.',
    effects: [
      { kind: 'damage', element: 'physical', amount: '3 base, INT-scaled per tick' },
      { kind: 'status', status: 'stun', duration: '3 ticks (refreshed each earthquake tick)' },
    ],
  },
  scorch: {
    id: 'scorch',
    name: 'Scorch',
    symbol: '\u{1F525}',    // 🔥
    schools: ['destruction'],
    manaCost: 6,
    minIntelligence: 6,
    range: 8,
    script: 'scorch',
    targeting: 'enemy',
    description: 'Sear the target with a precise flame. Low damage but high critical chance, and leaves the target vulnerable to fire for 15 turns.',
    effects: [
      { kind: 'damage', element: 'fire', amount: 'Low base (4), INT-scaled, high crit chance' },
      { kind: 'status', status: 'scorched', duration: '15 turns, target takes 30% more fire damage' },
    ],
  },
  entangle: {
    id: 'entangle',
    name: 'Entangle',
    symbol: '\u{1F517}',    // 🔗
    schools: ['nature', 'alteration'],
    manaCost: 10,
    minIntelligence: 6,
    range: 7,
    script: 'entangle',
    targeting: 'enemy',
    threat: { flatThreat: 5, threatKind: "spell_control", targetField: "targetId" },
    description: 'Grasping vines erupt from the earth and bind the target in place.',
    effects: [
      { kind: 'status', status: 'stunned', duration: '3 turns' },
      { kind: 'damage', element: 'nature', amount: '2 per turn while entangled' },
    ],
  },
  thorn_burst: {
    id: 'thorn_burst',
    name: 'Thorn Burst',
    symbol: '\u{1F940}',    // 🥀
    schools: ['destruction', 'nature'],
    manaCost: 7,
    minIntelligence: 5,
    radius: 3,
    script: 'thorn_burst',
    targeting: 'self',
    description: 'Erupts a ring of razor thorns outward from the caster, shredding everything nearby.',
    effects: [
      { kind: 'damage', element: 'nature', amount: '6 base, INT-scaled, all hostiles in radius' },
      { kind: 'status', status: 'poisoned', duration: '4 turns (30% chance per target)' },
    ],
  },

  plague_swarm: {
    id: 'plague_swarm',
    name: 'Plague Swarm',
    symbol: '\u{1F41D}',    // 🐝
    schools: ['nature', 'destruction'],
    manaCost: 10,
    minIntelligence: 6,
    range: 8,
    cooldown: 12,
    script: 'plague_swarm',
    targeting: 'auto',
    description: 'Unleash a stinging swarm that burrows into the target and leaps to a new host every few turns.',
    effects: [
      { kind: 'damage', element: 'nature', amount: '2 per tick, INT-scaled; jumps to nearby enemy every 3 ticks' },
      { kind: 'status', status: 'swarmed', duration: '8 turns; spreads on jump' },
    ],
  },
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    symbol: '\u{1F525}',    // 🔥
    schools: ['destruction', 'fire'],
    manaCost: 8,
    minIntelligence: 6,
    range: 10,
    script: 'fireball',
    targeting: 'auto',
    description: 'Hurl a roaring ball of fire that explodes on impact and leaves the target burning.',
    effects: [
      { kind: 'damage', element: 'fire', amount: '8 base, INT-scaled, can crit' },
      { kind: 'status', status: 'burn', duration: '2 turns' },
    ],
  },

  // ── Warden abilities ──────────────────────────────────────────────────────
  war_cry: {
    id: 'war_cry',
    name: 'War Cry',
    symbol: '\u{1F4E3}',    // 📣
    schools: ['alteration', 'martial'],
    manaCost: 6,
    minIntelligence: 0,
    cooldown: 14,
    script: 'war_cry',
    targeting: 'self',
    radius: 3,
    threat: { flatThreat: 3, threatKind: "spell_control", targetsField: "affectedIds" },
    description: 'A thundering bellow that rattles the nerve of every creature close enough to hear it.',
    effects: [
      { kind: 'status', status: 'weakened', duration: '6 turns to nearby hostiles' },
      { kind: 'utility', note: 'Breaks enemy aggro within radius, resetting them to alerted' },
    ],
  },
  cleave: {
    id: 'cleave',
    name: 'Cleave',
    symbol: '\u{1FA93}',    // 🪓
    schools: ['destruction', 'martial'],
    manaCost: 0,
    costResource: 'stamina',
    staminaCost: 4,
    minIntelligence: 0,
    cooldown: 5,
    script: 'cleave',
    targeting: 'self',
    radius: 1,
    description: 'A brutal horizontal sweep that carves through everything within arm\'s reach.',
    effects: [
      { kind: 'damage', element: 'physical', amount: '5 base, INT-scaled; hits all adjacent hostiles' },
    ],
  },
  bloodthirst: {
    id: 'bloodthirst',
    name: 'Bloodthirst',
    symbol: '\u{1FA78}',    // 🩸
    schools: ['alteration', 'darkness'],
    manaCost: 10,
    minIntelligence: 0,
    cooldown: 18,
    script: 'bloodthirst',
    targeting: 'self',
    activeEffect: {
      duration: 30,
      potency: 1,
      stacks: 1,
      mechanics: { healFraction: 0.25 },
    },
    description: 'Offer your rage to Molkhar and feast on the pain you deal.',
    effects: [
      { kind: 'effect', effect: 'bloodthirst', note: 'melee hits heal for 25% of damage dealt' },
    ],
  },

  // ── Cleric abilities ──────────────────────────────────────────────────────
  purify: {
    id: 'purify',
    name: 'Purify',
    symbol: '\u2624',        // ☤
    schools: ['restoration', 'holy'],
    clearMindedCasting: true,
    manaCost: 10,
    minIntelligence: 0,
    cooldown: 10,
    script: 'purify',
    targeting: 'self',
    description: 'Invoke Seraphine\'s mercy to burn corruption from your body.',
    effects: [
      { kind: 'utility', note: 'Removes all negative status effects (poison, burn, bleed, curse, stun, etc.)' },
    ],
  },
  divine_shield: {
    id: 'divine_shield',
    name: 'Divine Shield',
    symbol: '\u{1F6E1}',    // 🛡
    schools: ['holy', 'alteration'],
    manaCost: 14,
    minIntelligence: 0,
    cooldown: 16,
    script: 'divine_shield',
    targeting: 'self',
    activeEffect: {
      duration: 20,
      potency: 3,
      stacks: 1,
      mechanics: { guardStacks: 2, maxGuardStacks: 2, blessed: true },
    },
    description: 'Wrap yourself in Seraphine\'s light — a holy shell that absorbs blows before shattering.',
    effects: [
      { kind: 'effect', effect: 'divine_shield', note: 'A breakable holy ward with two guard charges' },
    ],
  },
  consecrate: {
    id: 'consecrate',
    name: 'Consecrate',
    symbol: '\u271D',        // ✝
    schools: ['holy', 'destruction'],
    manaCost: 12,
    minIntelligence: 0,
    cooldown: 12,
    script: 'consecrate',
    targeting: 'self',
    radius: 2,
    activeEffect: {
      duration: 5,
      potency: 2,
      stacks: 1,
      mechanics: { tickHeal: 2, hazardDuration: 5 },
    },
    description: 'Sanctify the ground beneath your feet. Holy fire scorches the wicked and mends the faithful.',
    effects: [
      { kind: 'damage', element: 'holy', amount: '3 per tick to hostiles in radius; INT-scaled', duration: '5 turns' },
      { kind: 'effect', effect: 'consecrate', note: 'caster recovery; field persists independently' },
    ],
  },

  // ── Outlaw abilities ──────────────────────────────────────────────────────
  smoke_bomb: {
    id: 'smoke_bomb',
    name: 'Smoke Bomb',
    symbol: '\u{1F4A8}',    // 💨
    schools: ['trickery'],
    manaCost: 8,
    minIntelligence: 0,
    cooldown: 12,
    script: 'smoke_bomb',
    targeting: 'self',
    radius: 3,
    description: 'Pop a flash of Loki\'s powder — blinding nearby foes and vanishing from their memory.',
    effects: [
      { kind: 'status', status: 'blinded', duration: '5 turns to nearby hostiles' },
      { kind: 'utility', note: 'Resets enemy aggro to unaware within radius' },
    ],
  },
  poison_blade: {
    id: 'poison_blade',
    name: 'Poison Blade',
    symbol: '\u2620',        // ☠
    schools: ['trickery', 'chemical'],
    manaCost: 6,
    minIntelligence: 0,
    cooldown: 8,
    script: 'poison_blade',
    targeting: 'self',
    description: 'Conjure a slick of venom and drag your blade through it.',
    effects: [
      { kind: 'utility', note: 'Coats equipped weapon with 8 charges of poison (75% proc chance per hit)' },
    ],
  },

  // ── Generators (resource builders) ─────────────────────────────────────────

  savage_strike: {
    id: 'savage_strike',
    name: 'Savage Strike',
    symbol: '\u{1F9AC}',     // 🦬
    schools: ['physical'],
    manaCost: 0,
    cooldown: 4,
    minIntelligence: 0,
    range: 1,
    script: 'savage_strike',
    targeting: 'auto',
    description: 'A brutal, efficient blow. Costs nothing — fuels everything.',
    effects: [
      { kind: 'damage', element: 'physical', amount: '4 base, STR-scaled' },
      { kind: 'utility', note: 'Restores 8% max stamina on hit (4-turn cooldown)' },
    ],
  },
  natures_touch: {
    id: 'natures_touch',
    name: "Nature's Touch",
    symbol: '\u{1F33F}',     // 🌿
    schools: ['nature'],
    manaCost: 0,
    cooldown: 4,
    minIntelligence: 0,
    range: 6,
    script: 'natures_touch',
    targeting: 'auto',
    description: 'Draw on the green — a wisp of nature that wounds and restores.',
    effects: [
      { kind: 'damage', element: 'nature', amount: '2 base, INT-scaled' },
      { kind: 'utility', note: 'Restores 6% max mana on hit (4-turn cooldown)' },
    ],
  },
  cheap_shot: {
    id: 'cheap_shot',
    name: 'Cheap Shot',
    symbol: '\u{1F44A}',     // 👊
    schools: ['trickery', 'physical'],
    manaCost: 0,
    cooldown: 4,
    minIntelligence: 0,
    range: 1,
    script: 'cheap_shot',
    targeting: 'auto',
    description: 'A dirty hit. No finesse, just momentum and mana.',
    effects: [
      { kind: 'damage', element: 'physical', amount: '3 base' },
      { kind: 'utility', note: 'Restores 7% max mana on hit (4-turn cooldown)' },
    ],
  },
  evocation: {
    id: 'evocation',
    name: 'Evocation',
    symbol: '\u{2728}',      // ✨
    schools: ['arcane'],
    manaCost: 0,
    manaPerTick: 0,
    channeling: true,
    breakOnMove: true,
    minIntelligence: 0,
    manaPerChannelTick: 6,
    script: 'evocation',
    targeting: 'self',
    cooldown: 8,
    description: 'Stand still, open your mind to the aether, and draw raw mana back into yourself. Each moment of concentration restores mana — but you are utterly vulnerable while channeling.',
    effects: [
      { kind: 'utility', note: 'Restores ~6 mana per tick (INT-scaled)' },
      { kind: 'utility', note: 'Sustained channel; breaks on movement, stun, or damage' },
    ],
  },
  arcane_bolt: {
    id: 'arcane_bolt',
    name: 'Arcane Bolt',
    symbol: '\u{2734}',      // ✴️
    schools: ['destruction', 'arcane'],
    manaCost: 0,
    cooldown: 3,
    minIntelligence: 0,
    range: 10,
    script: 'arcane_bolt',
    targeting: 'auto',
    description: 'A thin lance of raw arcana. Barely costs a thought — and returns more than it spends.',
    effects: [
      { kind: 'damage', element: 'arcane', amount: '3 base, INT-scaled' },
      { kind: 'utility', note: 'Restores 5% max mana on hit (3-turn cooldown)' },
    ],
  },
  magic_missile: {
    id: 'magic_missile',
    name: 'Magic Missile',
    symbol: '\u2734',
    schools: ['destruction', 'arcane'],
    manaCost: 5,
    cooldown: 2,
    minIntelligence: 0,
    range: 10,
    script: 'magic_missile',
    targeting: 'auto',
    description: 'A single arcane star curves through the air on an impossible wave.',
    effects: [
      { kind: 'damage', element: 'arcane', amount: '5 base, INT-scaled, can crit' },
      { kind: 'utility', note: 'A sinusoidal projectile carries bright arcane light to its target' },
    ],
  },
  arcane_barrage: {
    id: 'arcane_barrage',
    name: 'Arcane Barrage',
    symbol: '\u2051',
    schools: ['destruction', 'arcane'],
    manaCost: 8,
    cooldown: 5,
    minIntelligence: 0,
    range: 10,
    script: 'arcane_barrage',
    targeting: 'auto',
    description: 'Three smaller missiles split wide, weave, and strike as one.',
    effects: [
      { kind: 'damage', element: 'arcane', amount: '7 base, INT-scaled, can crit' },
      { kind: 'utility', note: 'Three synchronized light-bearing projectiles arrive together' },
    ],
  },
  void_hole: {
    id: 'void_hole',
    name: 'Void Hole',
    symbol: '\u25C9',
    schools: ['destruction', 'arcane', 'shadow'],
    manaCost: 10,
    cooldown: 8,
    minIntelligence: 0,
    range: 9,
    radius: 3,
    script: 'void_hole',
    targeting: 'target',
    description: 'Punch a persistent hungry absence into the floor for six turns and drag nearby enemies inward.',
    effects: [
      { kind: 'damage', element: 'shadow', amount: '7 base each turn, stronger near the center, can crit' },
      { kind: 'movement', mode: 'pull', note: 'Mass-aware pull; light creatures can be dragged farther as the well strengthens' },
      { kind: 'utility', note: 'Creates a growing void well that devours nearby light' },
    ],
  },
  leech_spores: {
    id: 'leech_spores',
    name: 'Leech Spores',
    symbol: '\u{1F344}',     // 🍄
    schools: ['nature', 'chemical'],
    manaCost: 0,
    cooldown: 4,
    minIntelligence: 0,
    range: 4,
    script: 'leech_spores',
    targeting: 'auto',
    description: 'Puff parasitic spores at the nearest foe. What they lose, you gain.',
    effects: [
      { kind: 'damage', element: 'nature', amount: '2 base' },
      { kind: 'utility', note: 'Restores 5% max mana and 5% max stamina on hit (4-turn cooldown)' },
    ],
  },
  holy_strike: {
    id: 'holy_strike',
    name: 'Holy Strike',
    symbol: '\u2600',         // ☀️
    schools: ['holy', 'physical'],
    manaCost: 0,
    cooldown: 4,
    minIntelligence: 0,
    range: 1,
    script: 'holy_strike',
    targeting: 'auto',
    description: 'Channel Seraphine\'s light through your weapon. Each blow renews your faith.',
    effects: [
      { kind: 'damage', element: 'holy', amount: '3 base, INT-scaled' },
      { kind: 'utility', note: 'Restores 6% max mana on hit (4-turn cooldown)' },
    ],
  },

  // ── Buff / Rotation abilities ─────────────────────────────────────────────

  iron_flesh: {
    id: 'iron_flesh',
    name: 'Iron Flesh',
    symbol: '\u{1F4AA}',     // 💪
    schools: ['alteration'],
    manaCost: 12,
    minIntelligence: 0,
    cooldown: 25,
    script: 'iron_flesh',
    targeting: 'self',
    activeEffect: {
      duration: 15,
      potency: 4,
      stacks: 1,
      capabilities: ['slowed'],
      mechanics: { recoilDamage: 2 },
    },
    description: 'Harden your body into living iron. You become nearly immovable — tougher, but slower.',
    effects: [
      { kind: 'effect', effect: 'iron_flesh', note: '+4 AC, recoil, movement penalty' },
    ],
  },
  ignite_weapons: {
    id: 'ignite_weapons',
    name: 'Ignite Weapons',
    symbol: '\u{1F525}',     // 🔥
    schools: ['alteration', 'fire'],
    manaCost: 10,
    minIntelligence: 8,
    cooldown: 20,
    script: 'ignite_weapons',
    targeting: 'self',
    activeEffect: {
      duration: 12,
      potency: 3,
      stacks: 1,
      mechanics: { bonusFireDamage: 3, burnChance: 0.2 },
    },
    description: 'Wreathe your weapons in arcane flame. Each strike sears the target.',
    effects: [
      { kind: 'effect', effect: 'ignite_weapons', note: 'Melee hits deal bonus fire damage and may apply burn' },
    ],
  },
  barkskin: {
    id: 'barkskin',
    name: 'Barkskin',
    symbol: '\u{1F333}',     // 🌳
    schools: ['nature', 'alteration'],
    manaCost: 8,
    minIntelligence: 5,
    cooldown: 18,
    script: 'barkskin',
    targeting: 'self',
    activeEffect: {
      duration: 20,
      potency: 2,
      stacks: 1,
      mechanics: { recoilDamage: 1, tickHeal: 1 },
    },
    description: 'Your skin hardens into gnarled bark. Thorns sprout from your flesh, punishing those who strike you.',
    effects: [
      { kind: 'effect', effect: 'barkskin', note: '+2 AC, recovery, retaliation' },
    ],
  },
  quicken: {
    id: 'quicken',
    name: 'Quicken',
    symbol: '\u26A1',         // ⚡
    schools: ['alteration', 'trickery'],
    costResource: 'stamina',
    staminaCost: 15,
    manaCost: 0,
    minIntelligence: 0,
    cooldown: 15,
    script: 'quicken',
    targeting: 'self',
    activeEffect: {
      duration: 10,
      potency: 5,
      stacks: 1,
      mechanics: { operation: 'stamina_restore' },
    },
    description: 'Flood your muscles with adrenaline. Everything slows down — except you.',
    effects: [
      { kind: 'effect', effect: 'quicken', note: '+15% crit chance, +2 attack, stamina cadence' },
    ],
  },
  mark_of_death: {
    id: 'mark_of_death',
    name: 'Mark of Death',
    symbol: '\u{1F480}',     // 💀
    schools: ['darkness', 'destruction'],
    manaCost: 14,
    minIntelligence: 7,
    range: 8,
    cooldown: 12,
    script: 'mark_of_death',
    targeting: 'enemy',
    activeEffect: {
      duration: 8,
      potency: 1,
      stacks: 1,
      mechanics: { damageTakenMultiplier: 0.35 },
    },
    threat: { flatThreat: 4, threatKind: "spell_control", targetField: "targetId" },
    description: 'Brand a foe with a skull sigil. All damage they receive is amplified.',
    effects: [
      { kind: 'effect', effect: 'mark_of_death', note: 'Target takes 35% more damage from all sources' },
    ],
  },
  primal_roar: {
    id: 'primal_roar',
    name: 'Primal Roar',
    symbol: '\u{1F981}',     // 🦁
    schools: ['nature', 'alteration'],
    manaCost: 15,
    minIntelligence: 0,
    cooldown: 30,
    script: 'primal_roar',
    targeting: 'self',
    radius: 2,
    activeEffect: {
      duration: 12,
      potency: 1,
      stacks: 1,
      mechanics: { staggerDuration: 4, killHeal: 5 },
    },
    description: 'Channel the fury of the wild. One predatory roar sharpens your strikes and rattles nearby enemies.',
    effects: [
      { kind: 'effect', effect: 'primal_roar', note: '+5 attack, 1.5x melee damage, restores 5 HP on kills' },
      { kind: 'utility', note: 'A short roar pulse staggers nearby hostiles' },
    ],
  },
};

/**
 * @param {string} id
 * @returns {SpellDef | null}
 */
export function getSpell(id) {
  return SPELL_DEFS[id] || null;
}

export function listSpells() {
  return Object.values(SPELL_DEFS);
}

/**
 * @param {SpellDef | null | undefined} spell
 * @returns {'mana'|'stamina'|'life'}
 */
export function spellCostResource(spell) {
  const resource = String(spell?.costResource || "mana").toLowerCase();
  if (resource === "stamina") return "stamina";
  if (resource === "life") return "life";
  return "mana";
}

/**
 * @param {'mana'|'stamina'|'life'} resource
 * @returns {string}
 */
export function spellResourceLabel(resource) {
  if (resource === "stamina") return "Stamina";
  if (resource === "life") return "Life";
  return "Mana";
}

/**
 * @param {SpellDef | null | undefined} spell
 * @returns {number}
 */
export function spellCost(spell) {
  const resource = spellCostResource(spell);
  if (resource === "stamina") return Number(spell?.staminaCost ?? 0);
  if (resource === "life") return Number(spell?.lifeCost ?? 0);
  return Number(spell?.manaCost ?? 0);
}

/**
 * @param {SpellDef | null | undefined} spell
 * @returns {number}
 */
export function spellCostPerTick(spell) {
  const resource = spellCostResource(spell);
  if (resource === "stamina") return Number(spell?.staminaPerTick ?? spell?.staminaCost ?? 0);
  if (resource === "life") return Number(spell?.lifePerTick ?? spell?.lifeCost ?? 0);
  return Number(spell?.manaPerTick ?? spell?.manaCost ?? 0);
}

/**
 * @param {SpellDef | null | undefined} spell
 * @returns {string[]}
 */
export function describeSpellDetailLines(spell) {
  if (!spell) return [];
  const resource = spellCostResource(spell);
  const resourceLabel = spellResourceLabel(resource);
  return [
    spell.channeling
      ? `${resourceLabel} ${spellCostPerTick(spell)} / tick`
      : `${resourceLabel} ${spellCost(spell)}`,
    Number.isFinite(spell.range) ? `Range ${Number(spell.range) | 0}` : "",
    Number.isFinite(spell.minIntelligence) && Number(spell.minIntelligence) > 0
      ? `Int ${Number(spell.minIntelligence) | 0}+`
      : "",
    Number.isFinite(spell.castTime) && Number(spell.castTime) > 0
      ? `Cast ${Number(spell.castTime) | 0} turns`
      : "",
    spell.channeling ? "Channel: Sustained" : "",
    Number.isFinite(spell.cooldown) && Number(spell.cooldown) > 0
      ? `Cooldown ${Number(spell.cooldown) | 0} turns`
      : "",
  ].filter(Boolean);
}

/**
 * @param {SpellDef | null | undefined} spell
 * @returns {string[]}
 */
export function describeSpellTargetEffects(spell) {
  if (!spell) return [];
  /** @type {string[]} */
  const lines = [];
  if (spell.targeting === 'self') lines.push('Targeting: Self');
  else if (spell.targeting === 'target') lines.push('Targeting: Chosen tile/target');
  else if (spell.targeting === 'auto') lines.push('Targeting: Auto-selects valid target');
  else if (spell.targeting === 'path') lines.push('Targeting: Along movement path');
  else if (spell.targeting === 'area') lines.push('Targeting: Area');
  else if (spell.targeting === 'enemy') lines.push('Targeting: Choose a visible enemy');
  if (Number.isFinite(spell.radius) && Number(spell.radius) > 0) {
    lines.push(`Area radius ${Number(spell.radius) | 0}`);
  }
  if (Number.isFinite(spell.maxTargets) && Number(spell.maxTargets) > 1) {
    lines.push(`Hits up to ${Number(spell.maxTargets) | 0} targets`);
  }

  const effects = Array.isArray(spell.effects) ? spell.effects : [];
  for (const effect of effects) {
    if (!effect || typeof effect !== 'object') continue;
    if (effect.kind === 'damage') {
      const element = String(effect.element || 'damage');
      const amount = String(effect.amount || '').trim();
      lines.push(amount ? `${element} damage: ${amount}` : `${element} damage`);
      continue;
    }
    if (effect.kind === 'status') {
      const status = String(effect.status || 'status');
      const duration = String(effect.duration || '').trim();
      lines.push(duration ? `Applies ${status}: ${duration}` : `Applies ${status}`);
      continue;
    }
    if (effect.kind === 'effect') {
      const effectKey = String(effect.effect || 'effect');
      const authoredDuration = spell.activeEffect?.duration;
      const duration = Number.isFinite(authoredDuration)
        ? `${Number(authoredDuration) | 0} turns`
        : String(effect.duration || '').trim();
      const note = String(effect.note || '').trim();
      const detail = [duration, note].filter(Boolean).join(' — ');
      lines.push(detail ? `Applies ${effectKey}: ${detail}` : `Applies ${effectKey}`);
      continue;
    }
    if (effect.kind === 'movement') {
      const mode = String(effect.mode || 'movement');
      const note = String(effect.note || '').trim();
      lines.push(note ? `${mode}: ${note}` : mode);
      continue;
    }
    if (effect.kind === 'utility') {
      const note = String(effect.note || '').trim();
      if (note) lines.push(note);
    }
  }
  return lines;
}
