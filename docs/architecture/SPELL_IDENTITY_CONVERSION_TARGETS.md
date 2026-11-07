# Spell identity conversion targets

This is the working inventory for converting bundled spells into self-contained
runtime identities. The goal is not to remove useful mechanics; it is to stop a
single spell cast from materializing as an unrelated collection of generic
timers.

## Working rule

Each converted spell should have one canonical spell-owned active effect. That
effect owns the spell's duration, source, refresh/stack behavior, mechanics, and
authored identity. The converted spell should not retain legacy component
statuses merely to keep old consumers working. Rule consumers should query the
spell-owned capability or a deliberate canonical mechanic interface.

Generic statuses remain valid when they are genuinely shared mechanics authored
by multiple independent sources. They are not valid as compatibility aliases
for a spell that has been given a clean identity.

Spell-specific mechanics belong in the spell identity, not in an accidental
bundle of whichever existing statuses happen to approximate the design.

## Capability model

The status facade is also the canonical semantic read model. Effect definitions
may declare capabilities such as `immobilized`, `action_locked`, `frozen`,
`concealed`, `slowed`, or `phase_shift`. The facade derives capability strength
and source rows from active effect identities and genuinely shared statuses.
Consumers should ask the facade for a capability when they care about an
outcome, while retaining source-specific checks when the outcome's reason or
mechanics differ (for example, reporting `asleep` separately from `stunned`).

This keeps authored spell identities as the source of truth: a spell-owned
effect contributes its capabilities through its authored definition; the
facade does not maintain a parallel spell-to-capability alias registry.

The co-location pilot extends that rule to unique persistent mechanics. A
spell-owned effect's authored duration, potency, stack policy, and mechanics
live under the spell's `activeEffect`; the script translates those values into
the runtime effect instance. Runtime fields such as `meta`, remaining turns,
and mutable guard stacks do not leak into the authored spell shape.

## Conversion targets

| Spell | Current bundle | Target identity | Status |
| --- | --- | --- | --- |
| Primal Roar | `berserk` + `battle_fury` + nearby `stagger` | `primal_roar`, with a short roar response for hostiles | pilot complete |
| Harmony Ward | four elemental resistance timers | `harmony_ward`, projecting the four resistances | pilot complete |
| Shadow Veil | `invisible` + `phase_shift` + `shadow_cloak` + vision envelope | `shadow_veil`, with concealment, phase, ambush, rearm, and perception metadata | converted |
| Divine Shield | `stoneskin` + `shield_guard` + `blessed` | `divine_shield`, with guard stacks and broken cooldown owned as metadata | converted |
| Iron Flesh | `stoneskin` + `slowed` + `thorns` | `iron_flesh`, with direct defense, movement, and recoil mechanics | converted |
| Barkskin | `stoneskin` + `thorns` + `regen` | `barkskin`, with direct defense, retaliation, and recovery rules | converted |
| Verdant Ward | `regen` + `stoneskin` + vision envelope | `verdant_ward`, with authored healing/defense/perception metadata | converted |
| Quicken | `crit_boost` + `battle_fury` + stamina restoration | `quicken`, with direct combat modifiers and a timed stamina cadence | converted |
| Bog Curse | `cursed` + `slowed` | `bog_curse`, with authored combat penalty and footing drag | converted |
| Frost Nova | `frost` + `rooted` plus damage | `frost_nova`, with direct freeze and rooted control semantics | converted |
| Gaze Beam | `stun` + `mindwipe` | `gaze_beam`, with stun duration and mindwipe stacks in one channel effect | converted |
| Consecrate | persistent hazard + caster `regen` | `consecrate` caster identity plus an independent consecrated field lifecycle | converted |

## Acceptance criteria for each conversion

1. The caster's active-effect view shows one spell identity for the cast.
2. Recasting refreshes or transforms that identity instead of multiplying rows.
3. Rule consumers use the spell-owned mechanic interface; no compatibility
   aliases or legacy spell-status rows are required.
4. Independent mechanics keep independent lifecycles only when the design
   requires them (for example, a shield that can break before its duration).
5. Spell-specific values come from the spell/effect definition and canonical
   stat pipelines; no duplicated live numbers are introduced in UI prose.
6. The spell has identity-specific messaging, audio/VFX hooks, and an active
   effect presentation plan.
7. Focused tests prove identity count, mechanics, refresh/expiry, save/load
   behavior where relevant, and no unintended status regressions.
8. A seeded runtime check confirms the cast through the real scheduler and
   WorldView path.

## Lessons from the pilots

- The pilots showed that collapsing several old statuses into one effect is a
  useful migration experiment, but it is not the final architecture.
- Projection alone is not enough for a clean disposition. Healing, retaliation,
  resource cadence, resistances, and breakable shields need explicit
  spell-owned mechanics and deliberate query surfaces.
- A breakable spell defense can remain one active effect when its guard stacks
  and recovery window live in effect metadata; equipment shield guard remains a
  separate mechanic because it has a different source and lifecycle.
- A converted effect does not need to project a generic status to be useful:
  `bog_curse` feeds combat and movement directly while unrelated `cursed` and
  `slowed` sources continue to use their generic mechanics.
- The active-effect row, spell event, message, VFX, and audio should converge on
  the spell-owned name. The old component statuses should disappear from the
  converted spell's implementation and presentation.
