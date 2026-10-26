# Content Authoring Guide

Items and monsters live in `src/content/`. One call registers everything: catalog
entry, glyph/palette, hooks. No secondary registration step, no parallel data
structure to keep in sync.

---

## Why this matters

Before Phase A, items existed in two places simultaneously:

- `src/rules/data/itemCatalogEquipment.js` — equipment, raw object arrays
- `src/rules/data/itemCatalogMagic.js` — potions, scrolls, rings, etc.

Both files were ~3500+ lines of object literals with no shared structure, no
validation, and hooks scattered through inline closures. Adding a new item meant
picking the right file, matching the implicit schema by hand, and hoping nothing
was silently missing.

The content DSL (`src/content/define.js`) collapses that into a single function
call that validates inputs, infers catalog kind from type, compiles hooks, and
registers palette — atomically. The old files are now empty stubs.

**Benefits in practice:**

- **One place.** `defineItem('my_ring', {...})` is the entire item. No second file,
  no merge step, no registration call.
- **Caught early.** Missing `name` or `type` throws at import time, not at the
  moment the item tries to spawn.
- **Hooks are first-class.** `onUse`, `onDrink`, `onThrow`, `onHit`, etc. are
  top-level fields — not nested inside `hooks: { on_use: fn }` buried in a 3000-
  line file.
- **Glyph and catalog travel together.** No drift between palette and catalog IDs.
- **Tree-shakeable by file.** Each category (`rings.js`, `weapons.js`, `potions.js`)
  is its own module. Barrel import via `index.js`. Tests can import only what they need.

---

## File layout

```
src/content/items/
  index.js              ← barrel import (import this, not individuals)
  weapons.js
  rangedWeapons.js
  armors.js   helms.js  boots.js  legs.js  gloves.js  belts.js
  rings.js    necks.js  offhands.js
  potions.js  scrolls.js  wands.js  spellbooks.js
  economy.js            ← ingredients, food, materials, fuel, junk
  dawnbreaker.js        ← unique/scripted items get their own file
  fishingRod.js
  ...

src/content/monsters/
  barrowWight.js        ← scripted monsters get their own file
```

**Rule:** pure-data items go in the category file. Items with significant scripted
behavior (unique weapons, artifacts, multi-hook consumables) get their own file.

---

## defineItem()

```js
import { defineItem } from '../content/define.js';

defineItem('ring_endurance', {
  name:        'Ring of Endurance',
  type:        'ring',                // drives catalogKind + slot inference
  glyph:       '◌',
  color:       '#8888aa',
  glow:        '#6666aa',
  scale:       0.45,
  material:    'iron',
  rarity:      'uncommon',           // 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  bonuses:     { maxHp: 5, defense: 1 },
  weight:      0.06,
  description: 'A plain iron band that makes you feel more resilient.',
});
```

`type` drives everything:

| type | catalogKind | slot |
|---|---|---|
| `weapon` | equipment | weapon |
| `armor` | equipment | armor |
| `helm` / `head` | equipment | head |
| `belt` | equipment | belt |
| `gloves` | equipment | gloves |
| `legs` | equipment | legs |
| `boots` | equipment | feet |
| `ring` | equipment | ring |
| `neck` / `amulet` | equipment | neck |
| `offhand` / `shield` | equipment | offhand |
| `ranged` | equipment | ranged |
| `potion` | magic | — |
| `scroll` | magic | — |
| `wand` | magic | — |
| `spellbook` | magic | — |
| `food` | food | — |
| `ingredient` | magic | — |
| `material` | magic | — |
| `tool` | magic | — |
| `fuel` | magic | — |
| `junk` | magic | — |

---

## Weapons

```js
defineItem('dagger_iron', {
  name:        'Iron Dagger',
  type:        'weapon',
  glyph:       '†',
  color:       '#a0a0a0',
  material:    'iron',
  rarity:      'common',
  damageDice:  '1d4',
  damageType:  'pierce',
  bonuses:     { attack: 1, accuracy: 5 },
  staminaCost: 2,
  weight:      0.4,
  value:       12,
  swingProfile: {
    lengthCm: 30,
    density:  'light',
    tint:     '#c0c0c0',
  },
});
```

`swingProfile` controls the swing arc VFX: `lengthCm` sets arc radius,
`density: 'heavy'|'light'` adjusts arc length factor, `tint` colors the trail.
Weapons without an explicit `swingProfile` get auto-resolved visual meta from
`weaponVisuals.js` based on damage dice and damage type.

---

## Armor and accessories

```js
defineItem('helm_steel', {
  name:     'Steel Helm',
  type:     'helm',
  glyph:    'n',
  color:    '#909090',
  material: 'steel',
  rarity:   'uncommon',
  bonuses:  { defense: 3 },
  weight:   2.0,
  value:    80,
});
```

Rings and amulets work identically — `type: 'ring'` or `type: 'neck'`.
`bonuses` keys: `attack`, `defense`, `accuracy`, `maxHp`, `maxMana`, `visionRange`,
`hungerRate`, `manaRegen`, `critChance`, and others; engine picks them all up via the
stat pipeline.

---

## Cursed items

```js
defineItem('ring_hunger', {
  name:      'Ring of Hunger',
  type:      'ring',
  material:  'iron',
  rarity:    'magic',
  beatitude: 'cursed',
  bonuses:   { hungerRate: 2 },
  ...
});
```

`beatitude: 'cursed' | 'blessed'` is a top-level field on the def. Works for any
item type (not just equipment).

---

## Potions

```js
defineItem('potion_healing', {
  name:     'Potion of Healing',
  type:     'potion',
  glyph:    '!',
  color:    '#cc4444',
  material: 'glass',
  rarity:   'common',
  weight:   0.5,
  value:    25,
  potion: {
    route:   'oral',
    doses:   1,
    channels: [],
    effects:  [],
    toxicity: null,
    feel:    'It tastes faintly of copper.',
  },
  onDrink(ctx) {
    ctx.heal(ctx.actor, 15);
    ctx.log('You feel your wounds close.');
  },
});
```

`potion.route` is `'oral'` (drunk) or `'splash'` (thrown at target). The `onDrink`
hook fires for oral route; `onThrow` fires when the potion lands on a target.

---

## Scrolls

```js
defineItem('scroll_identify', {
  name:        'Scroll of Identify',
  type:        'scroll',
  glyph:       '?',
  color:       '#eeeecc',
  material:    'paper',
  rarity:      'common',
  noQuickChip: true,           // suppress quick-chip shortcut in the UI
  weight:      0.1,
  value:       30,
  onUse(ctx) {
    ctx.io.emit('ui:open:identify_picker', { actor: ctx.actor });
  },
});
```

---

## Food

```js
defineItem('food_bread', {
  name:      'Loaf of Bread',
  type:      'food',
  glyph:     '%',
  color:     '#c8a060',
  material:  'organic',
  rarity:    'common',
  nutrition: 120,
  shelfLife: 'long',          // 'short' | 'medium' | 'long' | 'ration' | number
  weight:    0.4,
  value:     5,
  description: 'Dense rye bread. Filling.',
});
```

---

## Hooks reference

| Hook field | Fires when | Typical use |
|---|---|---|
| `onUse(ctx)` | Player uses item from inventory | scrolls, tools |
| `onDrink(ctx)` | Player drinks a potion | potions |
| `onThrow(ctx)` | Thrown item lands on a tile/target | thrown potions |
| `onDip(ctx)` | Item dipped in liquid | dipping interactions |
| `onHit(ctx)` | Equipped weapon lands a hit | enchant procs |
| `onEquip(ctx)` | Item equipped | stat bonuses, status apply |
| `onUnequip(ctx)` | Item unequipped | status remove |
| `onTurnWhileCarried` proc trigger | Each game turn while in inventory | carried passive effects |
| `onTurnWhileEquipped` proc trigger | Each game turn while equipped | equipped passive effects |
| `beforeUse` / `afterUse` | Before/after use pipeline | cancel/augment |
| `beforeDrink` / `afterDrink` | Before/after drink pipeline | cancel/augment |

Proc-triggered passives are authored through `procPackages` and the generic proc
script API. They receive the same proc context as combat triggers, including
`ctx.proc.getState()`, `ctx.proc.setState(...)`, `ctx.proc.entitiesInRadius(...)`,
`ctx.proc.light(...)`, and `ctx.proc.present(...)`. Legacy direct item tick
functions are not compiled into the catalog.

All interaction hooks receive a `ScriptCtx` (`ctx`). Key properties and methods:

```js
ctx.actor          // entity id of the actor
ctx.target         // entity id of the target (throw/dip)
ctx.world          // restricted world facade
ctx.log(msg)       // write to the message log
ctx.heal(id, amt)  // heal entity
ctx.damage(id, amt, type)
ctx.addEffect(id, key, turns)
ctx.removeEffect(id, key)
ctx.hasEffect(id, key)
ctx.io.emit(event, payload)   // emit a world event
ctx.rand()         // deterministic RNG (never use Math.random())
```

For complex hooks, pass raw catalog-style callbacks via `hooks: {}`:

```js
defineItem('my_item', {
  ...
  hooks: {
    on_use: (ictx, state) => { ... },  // raw format, no ScriptCtx wrapping
  },
});
```

---

## Unique / scripted items

Items with significant behavior get their own file. The pattern:

```js
// src/content/items/dawnbreaker.js
import { defineItem } from '../define.js';
import { createSomethingHelper } from './helpers/dawnbreakerHelpers.js';

export const DAWNBREAKER_ID = 'dawnbreaker';

defineItem(DAWNBREAKER_ID, {
  name: 'Dawnbreaker',
  type: 'weapon',
  ...
  onHit(ctx) { ... },
  onEquip(ctx) { ... },
});
```

Add the import to `src/content/items/index.js`.

---

## defineMonster()

```js
import { defineMonster } from '../define.js';

defineMonster('cave_troll', {
  name:        'Cave Troll',
  glyph:       'T',
  color:       '#448844',
  tier:        2,
  hp:          45,
  hpPerLevel:  4,
  attack:      3,
  defense:     2,
  damageDice:  '2d6',
  sizeClass:   'L',
  massKg:      320,
  speed:       1,
  intelligence: 3,
  lootTable:   'tier2_medium',
  immune:      ['poison'],
  vulnerable:  ['fire'],
  description: 'A hulking troll reeking of cave moss.',
});
```

Monster hooks: `onHit`, `onDamaged`, `onDeath`, `whileLOS`, `onSeen`.

```js
  onDeath(ctx) {
    ctx.io.emit('vfx:explosion', { x: ctx.world.posOf(ctx.actor).x, ... });
  },
```

---

## Adding content: checklist

1. Pick the right file in `src/content/items/` (or create a new one for complex items).
2. Call `defineItem(id, def)` — engine validates `name` and `type` at import time.
3. If a new file: add `import "./my-file.js"` to `src/content/items/index.js`.
4. Run `deno task test:fast` — if `Unknown item id: X` appears in any test, the item
   is referenced in a loot table but the id string doesn't match `defineItem`'s first arg.

No other registration step. `installContent()` in `main.js` merges the content
registry into `ITEM_CATALOG` at startup. Tests that spawn items must import
`tests/helpers/installContentCatalog.mjs` at the top.

---

## Loot tables

Items are referenced by their id string in `src/rules/data/lootTables.js`.
Adding an item to a loot pool is the only other file to touch:

```js
// lootTables.js
{ type: "equip", weight: 8, pool: ["ring_endurance", "ring_health"] }
```

If the id doesn't match a `defineItem` call, the game throws `Unknown item id: X`
at the moment a chunk spawns that item. The fast test suite will NOT catch this —
only in-game testing or a manual spawn will surface it.
