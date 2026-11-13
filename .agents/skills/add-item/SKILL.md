---
name: add-item
description: Add a new item to the roguelike dungeon crawler
argument-hint: <item_id>
disable-model-invocation: true
---

Add a new item with id `$ARGUMENTS` to the game.

## Steps

1. **Ask the user** for the item concept if not obvious from the name — category (weapon/armor/consumable/tool/scroll/etc.), theme, special behavior, flavor.
2. **Read the reference files** listed below to understand existing patterns.
3. **Define the item** through the current content path. Most authored items belong in `src/content/items/`; `src/rules/data/itemCatalog.js` is the merged public catalog, not usually the authoring file.
4. **Add an icon manifest entry** in `assets/icons/items/manifest.js` for the canonical item identity. Choose an unused `{ x, y }` cell in the 32px item atlas and keep the manifest entry aligned with the corresponding sprite in `assets/icons/items/sheet.webp`.
5. **Add a palette entry** in `src/display/palette/base.js` when the item needs a text/glyph fallback or existing palette coverage; the icon atlas is used by UI surfaces that support item icons.
6. **Add to a loot table** in `src/rules/data/lootTables.js` so it can drop, unless the item is intentionally crafted-only or shop-only.
7. **Add any new hooks** if the item has special behavior (use, drink, dip, throw).
8. **Run focused tests** for the item and relevant catalog/loot behavior; do not default to the full suite.

**Reference files to read before writing:**
- `src/rules/data/itemCatalog.js` — existing items, all patterns
- `src/content/items/` and `src/content/define.js` — canonical authored item definitions and automatic catalog/palette registration
- `assets/icons/items/manifest.js` — item icon atlas identity-to-cell mapping
- `src/display/palette/base.js` — existing glyph/color entries
- `src/rules/data/lootTables.js` — table structure and weights

---

## Item Categories

Choose the right `type` and `catalogKind` for the item:

| catalogKind  | type      | Examples                                   |
|--------------|-----------|--------------------------------------------|
| equipment    | equip     | longsword, chain_armor, helm_iron, ring    |
| magic        | potion    | potion_health, potion_mana, potion_poison  |
| magic        | scroll    | scroll_identify, scroll_fire               |
| magic        | learn     | book_frost (spellbook, teaches spell)      |
| magic        | book      | book_kitty (flavor book)                   |
| magic        | wand      | wand_lightning                             |
| material     | material  | ore_iron, lumber, coal (crafting mats)     |
| material     | ingredient| crafting ingredients                       |
| seed         | seed      | seed_wheat, seed_turnip                    |
| food         | food      | apple, bread, stew                         |

---

## File 1: Item Catalog (`src/rules/data/itemCatalog.js`)

Add an entry to the `ITEM_CATALOG` object. Key = item id.

### Required Fields (all items)

```js
my_item: {
  id:           "my_item",          // must match key
  catalogKind:  "equipment",        // "equipment" | "magic" | "material" | "seed" | "food"
  name:         "My Item",          // display name
  type:         "equip",            // see type table above
  slot:         "weapon",           // see Slots section below
  material:     "steel",            // see Materials section below
  rarity:       1,                  // 1=common 2=magic 3=rare 4=epic 5=legendary
  rarityName:   "common",           // matching string label
  description:  "Flavor text.",
},
```

### Equipment Fields (weapons & armor)

```js
// Weapon-specific
damageDice:   "1d6",              // damage roll (e.g. "1d4", "2d6")
damageType:   "slash",            // "blunt" | "slash" | "pierce" | "fire" | "poison" etc.
staminaCost:  3,                  // stamina per attack
twoHanded:    false,              // true blocks offhand slot

// Stat bonuses (optional, mix-and-match)
bonuses: {
  attack:        2,               // hit chance bonus
  defense:       1,               // armor class bonus
  critChance:    0.05,            // 5% crit chance
  critMult:      0.5,             // 50% extra crit damage
  maxHp:         10,
  maxStamina:    5,
  staminaRegen:  1,
  maxMana:       10,
  manaRegen:     1,
  spellHit:      2,
  spellAvoid:    2,
  spellRadius:   1,
  fireResist:    0.25,            // 0.0-1.0
  poisonResist:  0.25,
  acidResist:    0.25,
  electricOhms:  50,
  bluntResist:   0.1,
  slashResist:   0.1,
  pierceResist:  0.1,
  kineticDR:     3,               // flat kinetic damage reduction
  luck:          1,
  visionRange:   1,
  dig:           1,               // mining effectiveness (pickaxes)
},

// Gem sockets (optional)
maxSockets:   2,                  // how many gems can be socketed
```

### Consumable Fields (potions)

```js
type: "potion",
slot: "bag",
potion: {
  route:    "oral",               // "oral" | "splash" | "dip" | "throw"
  doses:    1,
  channels: ["vitality"],         // ["vitality"] | ["stamina"] | ["mana"] | []
  effects:  [
    { key: "heal",  potency: 25, onset: 0, peak: 0, duration: 0, stack: 1, maxStacks: 1 },
    { key: "haste", potency: 1,  onset: 0, peak: 0, duration: 10, stack: 1, maxStacks: 1 },
  ],
  toxicity:  null,                // null | "poison" | "disease"
  beatitude: "uncursed",          // "blessed" | "uncursed" | "cursed"
  feel:      "You feel refreshed!",
},
hooks: { on_drink: myDrinkHook },  // if behavior beyond simple effects
```

### Scroll Fields

```js
type: "scroll",
slot: "bag",
hooks: {
  on_use: createCastSpellFromIdentityHook({
    identityPrefix: "scroll_",
    targetMode: "self",           // "self" | "intentTarget"
    consumeOnSuccess: true,
  }),
},
```

### Enchantment Scrolls

For a scroll that applies a gear enchantment, use the shared enchantment path:

- Add the definition to `src/rules/content/enchanting/enchantCatalog.js`; `src/content/items/scrolls.js` generates the item and canonical apply/dip hooks.
- Reuse or author the affix in `src/rules/data/affixes.js`, keeping its supported slots aligned with the scroll definition.
- Add the item identity to `sub:scrolls` in `src/rules/data/lootTables.js` when it should be a normal drop.
- Add its identity to `assets/icons/items/manifest.js` and provide the matching atlas sprite cell.
- Cover successful binding in `tests/enchantingBench.test.mjs` and loot/shop policy in `tests/enchantingContent.test.mjs`.

### Spellbook Fields (teaches a spell)

```js
// id MUST be "book_{spell_id}" — the hook strips the prefix to get spell id
type: "learn",
slot: "bag",
hooks: {
  on_use: createLearnSpellFromIdentityHook({
    identityPrefix: "book_",
    consumeOnSuccess: true,
  }),
},
```

### Flavor Book Fields

```js
type: "book",
slot: "bag",
hooks: {
  on_use: createOpenFlavorBookHook("Title of Book", "Full text goes here. Can be long."),
},
```

---

## Equipment Slots

```
weapon    — primary hand weapon
offhand   — shield or secondary 1H weapon (dual-wield)
armor     — body armor
head      — helm / hat / crown
neck      — amulet / pendant / necklace
belt      — waist belt
gloves    — gauntlets / gloves
ring1     — first ring slot (use "ring" and system assigns ring1/ring2)
ring2     — second ring slot
legs      — leggings / greaves (lower body)
feet      — boots / footwear
ammo      — ammunition
ranged    — bow / crossbow
bag       — inventory only (not equipped)
```

---

## Materials

Common choices by item category:

| Category  | Common Materials                              |
|-----------|-----------------------------------------------|
| Weapons   | steel, iron, wood, silver, obsidian, bone, bronze |
| Armor     | leather, steel, iron, cloth, bronze, crystal  |
| Jewelry   | gold, silver, crystal, ivory, ebony           |
| Potions   | glass, organic                                |
| Scrolls   | paper                                         |
| Books     | paper, leather                                |
| Tools     | iron, steel, wood, mineral                    |
| Materials | iron, wood, stone, mineral, lead, copper      |

---

## Hook Patterns

Import hook creators from `./callbacks/items.js` (or the relevant callbacks file — check existing imports at the top of itemCatalog.js).

### Spell scroll

```js
hooks: {
  on_use: createCastSpellFromIdentityHook({
    identityPrefix: "scroll_",
    targetMode: "self",
    consumeOnSuccess: true,
  }),
},
```

### Spellbook

```js
hooks: {
  on_use: createLearnSpellFromIdentityHook({
    identityPrefix: "book_",
    consumeOnSuccess: true,
  }),
},
```

### Flavor book

```js
hooks: {
  on_use: createOpenFlavorBookHook("My Title", "Page one text..."),
},
```

### Poison coating (dippable poison)

```js
hooks: {
  can_dip_target: (state) => state.targetInfo?.damageDice != null,
  on_dip: createPoisonCoatDipHook({
    chargesGranted: 5,
    coatingColor: "#84d26d",
    messageTemplate: "The blade is coated with poison.",
  }),
},
```

### Thrown hazard

```js
hooks: {
  on_throw: createTorchThrowHook({ turnsLeft: 30, radius: 1, tickDamage: 3 }),
},
```

### Custom on_use (active item, special tool)

```js
hooks: {
  on_use(ctx, state) {
    // ctx.world, ctx.helpers, state.actorId, state.itemId, state.itemInfo
    const { world } = ctx;
    // ... custom logic ...
    return { consumed: true };
  },
},
```

---

## File 2: Palette Entry (`src/display/palette/base.js`)

Every item needs a palette entry to render on the ground or in UI. Add to the relevant section.

```js
my_item: { glyph: "!", fg: "#66ff99", glow: "#44bb77" },
```

### Fields
- `glyph` — single character or emoji shown on map/UI
- `fg` — foreground hex color
- `glow` — glow/shadow color (usually slightly darker)

### Glyph Conventions by Type

| Item Type         | Glyph | Notes                               |
|-------------------|-------|-------------------------------------|
| Potion            | `!`   | All potions use `!`, differentiate by color |
| Scroll            | `?`   | All scrolls use `?`                |
| Book (flavor)     | `📖`  | Emoji                               |
| Spellbook (fire)  | `📕`  | Red book                            |
| Spellbook (ice)   | `📘`  | Blue book                           |
| Spellbook (shadow)| `📙`  | Orange/dark book                    |
| Spellbook (electric)| `📓` | Yellow/notebook                    |
| Spellbook (healing)| `📒` | Green book                         |
| Sword / dagger    | `/`   | Slash glyph                        |
| Axe / hatchet     | `\`   | Backslash                          |
| Maul / hammer     | `T`   | Heavy weapons                      |
| Staff / spear     | `|`   | Pole weapons                       |
| Bow               | `)`   | Ranged                             |
| Arrow / ammo      | `/`   | Same as small blades               |
| Body armor        | `[`   | Torso equipment                    |
| Helm              | `^`   | Head equipment                     |
| Shield            | `(`   | Offhand                            |
| Boots             | `b`   | Feet                               |
| Gloves            | `g`   | Hands                              |
| Ring              | `=`   | Jewelry ring                       |
| Amulet / pendant  | `"`   | Neck jewelry                       |
| Belt              | `-`   | Waist                              |
| Gem               | `*`   | Gemstones                          |
| Tool (special)    | `~`   | Hearthstone, touchstone, etc.      |
| Gold              | `$`   | Currency                           |
| Food              | `%`   | Edibles                            |
| Seed              | `,`   | Planting seeds                     |
| Ore / material    | `:` or `•` | Raw crafting materials        |

### Color Families by Theme

| Theme         | fg example  | glow example |
|---------------|-------------|--------------|
| Health/life   | `#66ff99`   | `#44bb77`    |
| Mana/magic    | `#6fa7ff`   | `#4488dd`    |
| Stamina       | `#ffcc33`   | `#cc9900`    |
| Fire/red      | `#ff4444`   | `#cc0000`    |
| Ice/blue      | `#aabbff`   | `#7799dd`    |
| Electric/yellow | `#ffff66` | `#cccc33`    |
| Poison/green  | `#84d26d`   | `#55aa44`    |
| Acid/lime     | `#d4f06c`   | `#aacc44`    |
| Holy/gold     | `#ffe066`   | `#ccaa33`    |
| Shadow/purple | `#b366ff`   | `#9944dd`    |
| Bone/neutral  | `#ddd8c8`   | `#aaa590`    |
| Steel/iron    | `#b0b3be`   | `#8888a0`    |

---

## File 3: Loot Table (`src/rules/data/lootTables.js`)

Add to the appropriate sub-table. Common choices:

```js
// Common equipment drop
{ type: "equip", weight: 20, pool: ["my_weapon"], affixChance: 0.2, affixCountMax: 1 },

// Magic item (potion, scroll, book)
{ type: "item",  weight: 25, itemId: "potion_my_potion" },

// Into sub:spellbooks
{ type: "item",  weight: 20, itemId: "book_my_spell" },

// Into a specific depth table (e.g. "drop:tier1", "drop:tier2")
{ type: "table", weight: 15, table: "sub:equip_magic" },
```

**Weight guidance:**
- Common drops: 25-35
- Magic items: 18-28
- Rare/epic gear: 10-20
- Legendary: 3-8
- Nothing (skip slot): 30-60

**Table selection:**
- Generic mob drops → find the tier table (e.g. `"drop:tier0"`, `"drop:tier1"`)
- Spellbooks → `"sub:spellbooks"`
- Common equipment → `"sub:equip_common"`
- Magic equipment → `"sub:equip_magic"`
- Rare equipment → `"sub:equip_rare"`

---

## Balance Guidelines

### Weapon Balance by Tier

| Tier | Floors | damageDice | staminaCost | attack | bonuses     |
|------|--------|------------|-------------|--------|-------------|
| 0    | 1-5    | 1d4-1d6    | 2-3         | 0-2    | minor (≤+2) |
| 1    | 6-10   | 1d6-1d8    | 3-4         | 1-3    | moderate    |
| 2    | 11-15  | 1d8-2d6    | 3-5         | 2-4    | significant |
| 3    | 16+    | 2d6-3d8    | 4-6         | 3-5    | powerful    |

### Armor Balance by Slot

| Slot    | defense | kineticDR | Other bonuses           |
|---------|---------|-----------|-------------------------|
| armor   | 2-6     | 2-8       | —                       |
| head    | 1-3     | 1-4       | visionRange, spellHit   |
| belt    | 0-2     | 0-3       | maxStamina, staminaRegen|
| gloves  | 0-1     | 0-2       | attack, dig             |
| legs    | 1-3     | 1-4       | —                       |
| feet    | 0-2     | 0-2       | —                       |
| offhand | 2-5     | 2-6       | —                       |
| neck    | 0-1     | —         | thematic resist/regen   |
| ring    | 0       | —         | luck, thematic bonuses  |

### Consumable Balance

- Health potions: heal 15-60 HP depending on tier
- Mana potions: restore 10-40 mana
- Status potions: 5-15 turn duration
- Resist potions: 0.25-0.5 resist value, 20-40 turns

---

## Rules

- JavaScript only — no TypeScript.
- Never use `Math.random()` in rules code. Potions and scrolls don't need RNG at definition time, but any hook that rolls RNG must use `world.rand()` or a deterministic seed.
- Item `id` must match the object key in ITEM_CATALOG.
- Always add a matching palette entry in `src/display/palette/base.js`.
- Always add the item to at least one loot table (or document why it is shop/quest-only).
- Run `deno test --allow-read` after all changes.
