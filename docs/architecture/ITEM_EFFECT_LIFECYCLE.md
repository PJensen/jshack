# Item activation and persistent effect instances

This is the first implementation milestone of the item/effect architecture:
Town Stew uses a complete topology-backed lifecycle, and named item abilities
resolve through the canonical use interaction. Existing authored ability scripts
also use that activation path.

## Authoring

`defineEffect()` and `defineItem()` share the existing content DSL entry point:

```js
import { defineEffect, defineItem } from '../../src/content/define.js';

defineEffect('example_charm_stun', {
  name: 'Tidal Stun',
  statuses: ['stunned'],
  stacking: 'refresh',
  periodic: [],
});

defineItem('example_charm', {
  name: 'Tidal Charm',
  type: 'tool',
  glyph: '*',
  color: '#66ccff',
  chargePool: { current: 3, max: 3 },
  abilities: {
    stun: {
      name: 'Tidal Stun',
      icon: '*',
      targeting: 'enemy',
      range: 4,
      cooldown: 12,
      chargeCost: 1,
      effects: [{ key: 'example_charm_stun', turnsLeft: 3 }],
    },
  },
});
```

The examples are illustrative; these items are not added to the game catalog.
The targeted charged charm in `tests/itemAbilities.test.mjs` exercises this path
through real catalog materialization and `UseIntent` resolution.

Supported periodic operations are `damage`, `heal`, `mana_restore`,
`stamina_restore`, `mana_drain`, and `stamina_drain`. Each entry authors its own
non-negative `amount` and positive integer `interval` (default 1). Potency and
stacks scale each operation independently. Damage may specify `damageType`.

`statuses` projects existing semantic statuses without adding separate active
effect instances. `visualIdentity` selects an existing item/palette identity;
otherwise an item-sourced effect can inherit its source item's glyph and color.
Generated details describe each operation using its actual cadence and amount.

An ability effect defaults to the selected target; `target: 'self'` directs an
entry to the user. `requiresEquipped: true` gates activation on equipment.
Scripted abilities retain `onActivate(ctx)` and can call `ctx.apply()`,
`ctx.cure()`, and `ctx.cancel()`. A registered effect key goes through the same
instance materializer from scripts, interaction mutations, and proc application.

## Runtime ownership and lifecycle

```text
affected actor
  effect instance
    EffectInstance + StatusEffectNode + TimedEffectNode + Duration + Source
    periodic operation child
    periodic operation child
```

Definitions hold static arrays; applied packages and operations are entities.
`applyEffectInstance()`, `removeEffectInstance()`, and
`snapshotEffectInstances()` are the canonical lifecycle facade. An effect
outlives a consumed source item. Attribution retains the source item ID, source
identity, and applying actor; the item is not its lifetime owner.

| Stacking policy | Reapplication |
| --- | --- |
| `refresh` (default) | Keep one instance, maximum remaining duration/potency, preserve periodic cadence |
| `extend` | Add remaining duration, preserve cadence |
| `replace` | Remove the prior package and apply a new lifetime |
| `stack` | Increase stacks up to `maxStacks`, refresh duration and scale operations |
| `independent` | Create another independent package |

Matching is by `definition` (default), applying `actor`, or source `item`.
Finite effects cannot shorten permanent effects through refresh/extension.
`turnsLeft: Infinity` represents permanence. Expiry, explicit removal, curing,
replacement, and actor death remove the package and its operation children.
Immunities to the definition or one of its semantic statuses prevent application.

An application does not perform periodic operations immediately. Each subsequent
positive simulation turn advances its operations once. Onset pauses both the
lifetime countdown and operation cadence. The final turn performs due operations
before expiry. Duplicate processing at the same simulation time and zero-delta
UI ticks do not advance a package. The existing effects phase owns execution;
there are no new scheduler phases or system-to-system calls.

## Activation and presentation

Inventory use and quick slots carry the selected ability ID. Main-layer targeting
collects a target before dispatching `UseIntent`; it performs no ability mutation.
The use pipeline revalidates ownership, living targets, faction, range, line of
sight, equipment requirements, charges, and cooldowns. Headless/AI callers can
submit the same intent. Enemy and untargeted actions have UI support; ally targets
can currently be supplied by rules callers.

Ability effects, scripted local state, charge costs, and cooldowns are queued in
the existing interaction transaction. Cancellation discards the queued changes.
A valid attempt against an immune target still spends the activation cost.
Charges belong to the item entity. Items with `Charges` or `ScriptState` do not
merge their simulation state into another item stack.

`EffectChanged` records application, refresh, and removal; `ItemAbilityActivated`
records successful activation. These are concrete events, not string aliases.
Existing authored activation presentations remain available through `ctx.present()`.

HUD and character details share `buildEffectRows()`. Independent packages retain
separate instance IDs, and VIS badges use those IDs. Permanent badges display
infinity. Projection restores persistent badges without emitting activation events.

## Persistence and migration

Game save/export uses `serializeSavegameWorld()` so absolute item cooldowns retain
the game turn. The registry includes `ItemCooldown`, `ScriptState`, and the new
effect components. Load restores permanent durations from the explicit lifecycle
flag after JSON serialization turns `Infinity` into `null`.

Town Stew is the first migrated definition. Legacy `town_stew` array records are
materialized through the canonical facade and removed before legacy resolution,
so they cannot tick twice. Other legacy effect families retain their existing
resolver while they are migrated incrementally.

## Playable authoring examples

`src/content/items/pocketRelics.js` demonstrates four bag tools, usable without
equipment or gem sockets. Bloodglass Hourglass couples mana recovery to periodic
self-damage; Widow's Spool stacks targeted venom to three; Bell of the Drowned
Saint combines enemy stun with healing that same enemy; Brass Cricket creates
independently expiring stamina/damage songs. The charged tools keep their own
charge pools, and all four author activation presentations beside their rules.

`src/content/items/dungeonSoups.js` demonstrates the existing food hook applying
composite effect instances. Pilgrim's Barley Stew mixes two recovery cadences;
Moonmilk Chowder trades mana for healing; Witchlight Broth restores mana while
hurting the eater. Eating consumes the item, feeds the actor, and leaves one
inspectable effect badge. Another serving refreshes the existing package.

All seven items have authored glyphs, colors, descriptions, and ordinary tier
0–3 loot routes. Soups also join `sub:food`; pocket tools use `sub:pocket_relics`.
Their acquisition and complete activation/lifetime behaviors are exercised in
`tests/pocketRelicsAndSoups.test.mjs`.

## Subsequent milestones

The broader item playground brainstorm, including the fourteen item concepts
and the proposed entity-owned persistent behavior direction, is recorded in
[`docs/design/ITEM_PLAYGROUND_BRAINSTORM.md`](../design/ITEM_PLAYGROUND_BRAINSTORM.md).
Breadcrumb Boots is the current player pick; Patient Thunder remains a compact
effect-lifecycle demo.

The first slice provides control statuses, periodic operations, charges, named
activation, persistence, and shared visual identity. Remaining work from the
architecture plan includes authored stat/proc children with lifecycle-aware
traversal, percentage movement/attack timing, scoped immunity definitions,
persistent world VFX profiles, and incremental migration of other legacy families.
New definitions should extend these shared surfaces as those capabilities land.
