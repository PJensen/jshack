# JSHack item playground: design proposals

> Preserved from the original brainstorm. These are proposals, not implemented
> game content. The source explored `ammo.js`, `wands.js`, `scrolls.js`,
> `gemSocketAffixes.js`, weapon coatings, cooking, and the item catalog.

## Current direction

- **Player's current pick: Breadcrumb Boots.** Treat these as the lead
  exploration: attractive trails that let players lure, divert, or reposition
  creatures. **Now implemented as the first world-owned investigation signal:**
  every fourth step leaves a glowing, eight-turn marker; each marker stores a
  Scatter charge, and four charges place a decoy trail. The general signal
  component and curious-enemy response can support later baits and beacons too.
- **Wand of Patient Thunder** remains the strongest small demonstration of the
  actor-owned effect lifecycle: delayed onset, independent overlapping
  instances, periodic electric damage, and expiration.
- The player's follow-up message ended at “patient thunder sounds co”. Its
  intended final word is unclear; retain Patient Thunder as a positive mention
  without assuming more.

## Design proposals

The proposals and mechanics below are preserved from the supplied brainstorm.

---

I dug further into JSHack's item systems, particularly `ammo.js`, `wands.js`, `scrolls.js`, `gemSocketAffixes.js`, weapon coatings, cooking, and the broader item catalog.

The discovery that got my attention: **arrows already have separate hooks for hitting creatures, striking walls, and missing entirely.** Wands can be fired or shattered. Potions can be drunk, thrown, or applied to equipment. Gems have their own socketed proc machinery.

That's an enormous playground.

I wouldn't restrict this experiment to effects that restore or drain health. I'd explore objects that interact with enemies, terrain, perception, other equipment, and even one another.

Here are 14 proposals. These are new designs, not existing implementations. I've distinguished mechanics that fit the current architecture from those that would require another reusable primitive.

# 🏹 AMMUNITION

## 1. ✧ Cartographer's Chalk Arrows

**Uncommon · Ammunition · Bundle of 6**

| Property | Value |
|---|---|
| Projectile | Standard piercing |
| Special Damage | None |
| Value | 36 gold/bundle |
| Rarity | 2 |
| Material | Wood / Chalk |

**On Creature Hit — Illuminated Quarry**

The target becomes Marked for eight turns.

The mark makes the creature easier to track, including when ordinary visibility is lost.

**On Wall Impact — Chalk Beacon**

A luminous chalk symbol appears on the wall for twelve turns, illuminating a small surrounding area.

**On Miss — Errant Signal**

The arrow produces a sharp whistle, potentially attracting nearby creatures toward its landing position.

**Description**

*Used by surveyors who mapped tunnels too dangerous to enter twice. Every arrow marks a place someone intended to return to.*

**Visual:** White chalk trails, pale blue runes, and a brief expanding circle on impact.

**Why I like it:** Three outcomes from the same ammunition. A deliberate miss might even be useful.

The creature mark fits existing effect semantics. Persistent wall beacons and sound-driven investigation need integration with world effects and AI.

---

## 2. ⌁ Pinbone Arrows

**Rare · Ammunition · Bundle of 4**

| Property | Value |
|---|---|
| Projectile | Piercing |
| Armor Penetration | +2 |
| Value | 48 gold/bundle |
| Rarity | 3 |
| Material | Bone / Iron |

**On Hit — Pinbone Wound**

The target becomes Rooted for two turns.

A separate six-turn wound inflicts 1 damage every two turns.

Additional arrows refresh the Rooted effect but create independent wounds, up to three concurrent wounds per target.

**Description**

*The heads are carved from the leg bones of enormous birds. They have an unpleasant tendency to remain exactly where they land.*

**Combat message**

> The arrow punches through flesh and fixes its victim in place.

**Why I like it:** An archer can pin an advancing creature, accumulate wounds, and reposition.

It also tests independent effect instances alongside a separately refreshed control status.

---

## 3. ☾ Pallbearer's Feathers

**Very Rare · Ammunition · Bundle of 3**

| Property | Value |
|---|---|
| Projectile | Piercing |
| Initial Damage | Normal arrow damage |
| Value | 75 gold/bundle |
| Rarity | 4 |

**On Hit — Funeral Mark**

Apply a six-turn mark to the target.

Every three turns, the mark inflicts 2 shadow damage.

If the marked creature dies before the mark expires, the remaining magical energy bursts outward, applying Fear for three turns to enemies within two tiles.

Each marked creature holds its own effect instance.

**Description**

*These feathers come from birds that gather outside houses where someone is about to die. No one has ever seen the birds arrive.*

**Visual:** Almost-black feathers trailing violet particles.

**Death message**

> THE MOURNERS HAVE ARRIVED.

**Why I like it:** An arrow that changes how the player approaches groups.

Rather than simply maximizing damage, the player can identify a weak target, mark it, and use its death to disrupt the surrounding enemies.

Death-triggered secondary effects would need a lifecycle event handler.

---

# 🪄 WANDS

## 4. ⚡ Wand of Patient Thunder

**Rare · Wand · Petrified Wood**

| Property | Value |
|---|---|
| Charges | 5 |
| Range | 6 tiles |
| Cooldown | 4 turns |
| Value | 185 gold |
| Rarity | 3 |

**Ability — Storm Appointment**

Apply an independently expiring electrical charge to one enemy.

The charge waits two turns before beginning a six-turn active period.

During that period, it deals 5 electric damage every three turns.

Total damage: 10, if both pulses resolve.

Reapplying creates an independent charge rather than refreshing the first.

**Description**

*Lightning is famously impatient. This particular storm has learned to make an appointment.*

**On activation**

> A small blue spark disappears beneath the creature's skin.

**On discharge**

> A thunderclap erupts from somewhere inside its chest.

**Visual:** Tiny electric filaments intensifying as the first discharge approaches.

**Why I like it:** This is a nearly ideal demonstration of the new lifecycle.

Delayed onset, independent instances, independent periodic schedules, electrical damage, and expiration are already expressible.

The player can plant several charges before a dangerous encounter reaches its climax.

---

## 5. ☂ Wand of Unseasonable Rain

**Rare · Wand · Willow**

| Property | Value |
|---|---|
| Charges | 6 |
| Range | 5 tiles |
| Cooldown | 3 turns |
| Value | 160 gold |
| Rarity | 3 |

**Ability — Drench**

Soak a target creature.

For eight turns, the creature remains Wet and suffers Slowed for four turns.

Wetness interacts with JSHack's existing material and electrical systems.

**Alternate Use — Break the Wand**

Shattering the wand creates a burst of water around its landing point.

The affected area and intensity scale with remaining charges.

**Description**

*Cut from a willow struck by lightning during a drought. It has never quite dried out.*

**Visual:** Silver-blue rain falling in a tiny circle around the target.

**Why I like it:** Think about the interaction with the existing Wand of Lightning, electrical resistance, and material reactions.

The wand isn't especially destructive by itself.

Its value comes from changing the conditions under which other attacks operate.

JSHack already models wetness and water exposure. The proposed timed Wet application and area saturation need a proper adapter rather than a decorative status.

---

## 6. ♬ Wand of the Borrowed Choir

**Very Rare · Wand · Blackthorn**

| Property | Value |
|---|---|
| Charges | 4 |
| Range | 5 tiles |
| Cooldown | 12 turns |
| Value | 245 gold |
| Rarity | 4 |

**Ability — Steal the Hymn**

The target becomes Silenced for six turns.

The caster receives a six-turn effect restoring 2 mana every turn.

However, the caster also becomes Deafened for those six turns.

All three effects are created through one activation.

**Description**

*Carved from a church pew where a hundred people once sang. Their voices remain trapped in the grain.*

**On activation**

> The creature opens its mouth. A hundred stolen voices answer from the wand.

**Visual:** Fine golden musical notation flowing backward from the target into the caster.

**Why I like it:** This isn't a simple resource transfer.

It's a control spell with a secondary benefit and a sensory consequence.

And it creates an interesting interaction with JSHack's perception mechanics.

---

# 🧪 POTIONS

## 7. ⚗ Physician's Receipt

**Rare · Potion · Glass**

| Property | Value |
|---|---|
| Doses | 1 |
| Weight | 0.5 |
| Value | 90 gold |
| Duration | 12 turns |
| Rarity | 3 |

**Drink — An Honest Exchange**

Every two turns:

Spend 3 mana.

If the entire payment succeeds, restore 4 HP.

If fewer than 3 mana are available, neither operation occurs.

The potion cannot kill the user through its payment mechanism.

**Description**

*A green medicinal tincture whose label itemizes every ingredient, every service, and every possible consequence. The bill is fourteen pages long.*

**On drinking**

> The medicine begins its work. Somewhere inside you, an accountant opens a ledger.

**Why I like it:** This directly addresses the exploit we discussed.

But it's more than a check at activation.

It introduces a useful general engine operation:

`exchangeResource(source, target, cost, reward)`

An atomic conditional exchange.

That would support health-for-mana, stamina-for-health, mana-for-damage, and many other mechanics without duplicating conditionals throughout content scripts.

**This needs a new effect operation.** Two independent periodic operations cannot guarantee the exchange.

---

## 8. ❄ Bottle of Winter in July

**Uncommon · Potion · Frosted Glass**

| Property | Value |
|---|---|
| Doses | 1 |
| Weight | 0.5 |
| Value | 65 gold |
| Rarity | 2 |
| Routes | Drink / Throw |

**Drink — Deep Winter**

Gain Stoneskin for eight turns.

Become Slowed for eight turns.

Both statuses expire together.

**Throw — Broken Season**

The bottle shatters into a temporary patch of supernatural frost.

Creatures entering the area become Slowed for four turns.

The frozen area persists for six turns.

**Description**

*The bottle is always cold, even beside a roaring fire. The label insists it was bottled on the warmest day in recorded history.*

**Visual:** White frost spreading across the floor, with a faint blue shimmer.

**Why I like it:** The distinction between drinking and throwing is meaningful.

Drink it to survive a direct confrontation.

Throw it to control a corridor.

The consumed potion's status combination fits the new system. The persistent frost field needs tile-anchored effect ownership.

---

# 📜 SCROLLS

## 9. ◈ Scroll of Unraveling

**Rare · Scroll · Vellum**

| Property | Value |
|---|---|
| Uses | 1 |
| Value | 125 gold |
| Rarity | 3 |
| Target | Self |

**Read — Unmake**

Remove every removable temporary effect currently affecting the reader.

Beneficial effects are removed.

Harmful effects are removed.

Permanent attributes, inherent traits, and equipment-derived passives are unaffected.

**Description**

*An immaculate sheet of vellum covered in hundreds of knots. When read aloud, every knot unties itself.*

**On reading**

> For one perfect instant, you feel entirely ordinary.

**Visual:** Multicolored effect particles unraveling into thin white strands.

**Why I like it:** This could become one of the most strategically useful scrolls in the game.

It isn't another Remove Curse scroll.

It is an indiscriminate reset.

A player might use it to escape poison, paralysis, or an awful combination of conditions—but doing so sacrifices precious buffs.

The implementation needs a unified cure operation across legacy and new effect instances, with explicit removable/permanent semantics.

---

## 10. ☠ Scroll of the Unfinished Funeral

**Very Rare · Scroll · Grave Parchment**

| Property | Value |
|---|---|
| Uses | 1 |
| Value | 195 gold |
| Rarity | 4 |
| Target | Nearby Corpse |

**Read — One More Service**

Target a nearby corpse.

The corpse produces a temporary allied skeleton.

For twelve turns, the skeleton receives a composite effect:

- Restore 2 stamina every three turns.
- Suffer 2 damage every four turns.

The creature retains its ordinary combat behavior.

After twelve turns, the summoning expires and the temporary creature disappears, even if its HP remains above zero.

**Description**

*This parchment contains the beginning of a funeral prayer. Whoever wrote it apparently lost interest before reaching the end.*

**On reading**

> The corpse sits upright. It seems annoyed to have been interrupted.

**Why I like it:** This connects several systems already present in JSHack: corpses, summoning, pets, temporary creatures, and persistent effects.

Rather than simply summoning a stronger skeleton, the player gets a temporary companion with a finite useful lifetime.

The effect operations already exist. Tying summoned-entity lifetime to a package expiration needs an additional lifecycle hook.

---

# 💎 SOCKETED GEMS

## 11. ◇ River Opal

**Rare · Socketable Gem · Opal**

| Property | Value |
|---|---|
| Value | 900 gold |
| Weight | 1 |
| Rarity | 3 |
| Socket | Armor |
| Trigger | Taking electrical damage |

**Socket Effect — Storm Memory**

When the wearer takes electrical damage, the gem has a 30% chance to create an eight-turn effect.

The effect restores 2 mana every two turns.

Multiple activations refresh the existing effect without resetting its periodic cadence.

**Description**

*A milky blue opal taken from the bed of a river that vanished a thousand years ago. Small storms move behind its surface.*

**Trigger message**

> The opal drinks the lightning. A blue current moves through your veins.

**Why I like it:** It rewards a very particular equipment strategy.

Imagine intentionally wearing relatively weak electrical protection to generate mana during a lightning-heavy encounter.

It's potentially exploitable in interesting ways—but the return is capped by damage actually received and a bounded proc probability.

This can reuse the existing socket/proc architecture, with the new effect instance as its output.

---

# 🥾 FOOTWEAR

## 12. ♧ Breadcrumb Boots

**Rare · Boots · Enchanted Leather**

| Property | Value |
|---|---|
| Defense | +1 |
| Maximum Stamina | +8 |
| Weight | 1.0 |
| Value | 175 gold |
| Rarity | 3 |

**Passive — Leave Something Behind**

Every fourth step leaves an enchanted breadcrumb at the previous tile.

Each breadcrumb persists for eight turns.

Nearby creatures can detect the trail and may investigate it.

**Active — Scatter**

Consume four stored breadcrumbs to scatter an attractive trail around the player's current position.

Cooldown: 20 turns.

**Description**

*Made for a child who was terrible at finding her way home. The shoemaker was considerably more interested in ensuring she could be found.*

**Visual:** Tiny golden crumbs briefly illuminating footprints.

**Why I like it:** I particularly like this one.

It gives the player a way to manipulate enemy movement without directly targeting enemies.

The player can lead creatures into traps, divert patrols, or lure them away from an important location.

This needs tile-owned temporary entities and AI investigation behavior.

But those are reusable capabilities, not necessarily specialized footwear code.

---

# 🧰 TOOLS

## 13. ♫ The Ratcatcher's Flute

**Uncommon · Musical Tool · Bone**

| Property | Value |
|---|---|
| Charges | 8 |
| Weight | 0.2 |
| Value | 75 gold |
| Rarity | 2 |
| Cooldown | 6 turns |

**Use — An Unpleasant Melody**

For six turns, the player emits a periodic sound every two turns.

The sound attracts nearby creatures toward the player's location.

Meanwhile, the player restores 2 stamina every turn.

**Description**

*A flute carved from a bone nobody has successfully identified. Its melody is almost beautiful, provided one has never heard music before.*

**On use**

> You play three terrible notes. Something in the distance answers.

**Visual:** Small vibrating musical notes, colored a sickly yellow.

**Why I like it:** A resource-recovery item that actively changes the surrounding encounter.

Perhaps the player wants monsters to approach.

Perhaps they're trying to lure them into a narrow corridor.

Or perhaps they're simply desperate for stamina.

The recovery fits the new architecture. Periodic sound emission needs a reusable effect-trigger operation.

---

# 🧴 ALCHEMICAL REAGENTS

## 14. ✦ Gravewick Oil

**Rare · Alchemical Coating · Black Glass**

| Property | Value |
|---|---|
| Applications | 1 |
| Coating Charges | 8 successful strikes |
| Weight | 0.3 |
| Value | 110 gold |
| Rarity | 3 |

**Apply — Gravewick Coating**

Apply the oil to a melee weapon.

The next eight successful strikes can inflict **Gravewick Fever**.

Gravewick Fever lasts six turns.

Every two turns:

- The afflicted target loses 2 stamina.
- The afflicted target takes 1 damage.

Reapplication refreshes the effect.

**Description**

*An oily black substance extracted from candles left burning in forgotten crypts. It smells of smoke, wet stone, and something faintly medicinal.*

**Combat message**

> The wound blackens. Thin threads of smoke rise from the flesh.

**Why I like it:** JSHack already supports weapon coatings and charged applications.

The next step is allowing those coatings to apply authored composite effects instead of only individual legacy statuses.

And importantly, this isn't another poison.

It combines exhaustion with slow, persistent injury.

---

# What I'd actually build from these

There are several distinct architectural opportunities here.

| Capability | Current state | Opportunity |
|---|---|---|
| Actor-owned periodic effects | Implemented | Wands, arrows, potions, weapon coatings |
| Independent effect lifetimes | Implemented | Delayed projectiles, overlapping curses |
| Conditional activation | Supported through scripting | Specialized weapons and tools |
| Composite statuses | Implemented | Potions, wands, consumables |
| Projectile impact hooks | Existing ammo system | Apply new effect instances from impact scripts |
| Potion drink/throw/dip | Existing item system | More expressive multi-route consumables |
| Equipment-triggered procs | Existing proc architecture | Reactive armor, socketed effects |
| Conditional resource exchanges | Not implemented as an atomic effect | Mana-for-health and similar exchanges |
| Tile-owned persistent effects | Needs extension | Beacon arrows, frost fields, breadcrumbs |
| Lifecycle event triggers | Needs broader support | On-expire, on-death, on-removal behavior |

The first seven rows are about **connecting existing capabilities** rather than inventing new ones.

The final three are the most interesting candidates for future expansion.

### One larger architectural idea

Right now, your new effect packages belong to actors.

That makes sense as a starting point.

But imagine if effects could belong to **anything in the ECS**.

An actor can be poisoned.

A sword can be temporarily enchanted.

A tile can be burning.

A door can be cursed.

A corpse can be preparing to rise.

An arrow embedded in a wall can emit light.

A chest can become increasingly dangerous the longer it remains unopened.

All of these potentially share the same underlying concepts:

**Ownership. Duration. Operations. Triggers. Stacking. Expiration.**

The actual operations differ, of course. And you wouldn't want to turn every system into an abstract effect executor.

But there's a compelling architectural direction here: **persistent behavior attached to entities rather than hardcoded into individual item categories.**

That's where I see the genuinely expansive opportunity.

Not 100 new variations of magical equipment.

A system where someone can dream up an absurd item—like boots that leave enchanted breadcrumbs—and most of its behavior can be expressed using a small, composable vocabulary.

My favorites from this batch are the Chalk Arrows, Patient Thunder, Scroll of Unraveling, and Breadcrumb Boots. They offer four very different gameplay experiences while suggesting reusable extensions to the same underlying machinery.
