# Spell identity conversion targets

This is the working inventory for converting bundled spells into self-contained
runtime identities. The goal is not to remove useful mechanics; it is to stop a
single spell cast from materializing as an unrelated collection of generic
timers.

## Working rule

Each converted spell should have one canonical spell-owned active effect. That
effect owns the spell's duration, source, refresh/stack behavior, and authored
identity. Existing status names may remain as projected compatibility views for
combat, targeting, resistance, AI, and other rule queries. They should not be
separate spell timers unless the mechanic genuinely has an independent
lifecycle.

Spell-specific mechanics belong in the spell identity, not in an accidental
bundle of whichever existing statuses happen to approximate the design.

## Conversion targets

| Spell | Current bundle | Target identity | Status |
| --- | --- | --- | --- |
| Primal Roar | `berserk` + `battle_fury` + nearby `stagger` | `primal_roar`, with a short roar response for hostiles | pilot complete |
| Harmony Ward | four elemental resistance timers | `harmony_ward`, projecting the four resistances | pilot complete |
| Shadow Veil | `invisible` + `phase_shift` + `shadow_cloak` + vision envelope | one veil state with explicit concealment, phase, ambush, and perception rules | next design pass |
| Divine Shield | `stoneskin` + `shield_guard` + `blessed` | one shield identity, with guard state treated as an independent breakable sub-state only if needed | design needed |
| Barkskin | `stoneskin` + `thorns` + `regen` | one barkskin identity with defense, retaliation, and recovery rules | design needed |
| Verdant Ward | `regen` + `stoneskin` + vision envelope | one ward identity with authored healing/defense/perception behavior | design needed |
| Quicken | `crit_boost` + `battle_fury` + stamina restoration | one acceleration identity with a defined resource cadence | design needed |
| Iron Flesh | `stoneskin` + `slowed` + `thorns` | one heavy-body identity with explicit tradeoff and retaliation | design needed |
| Bog Curse | `cursed` + `slowed` | one curse identity with authored footing/luck consequences | design needed |
| Frost Nova | `frost` + `rooted` plus damage | one freezing control identity; decide whether root is intrinsic or a projected response | design needed |
| Gaze Beam | `stun` + `mindwipe` | one psychic beam identity with channel completion state | design needed |
| Consecrate | persistent hazard + caster `regen` | one consecration field identity with caster benefit derived from the field | design needed |

## Acceptance criteria for each conversion

1. The caster's active-effect view shows one spell identity for the cast.
2. Recasting refreshes or transforms that identity instead of multiplying rows.
3. Projected statuses still satisfy canonical rule queries where they are
   intentionally retained.
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

- `EFFECT_DEFS.statuses` is a useful compatibility projection surface: one
  runtime key can satisfy several existing status queries.
- Projection alone is not enough for mechanics with different operations or
  lifecycles. Healing, retaliation, resource cadence, and breakable shields
  need explicit design before being collapsed into one effect.
- The active-effect row, spell event, message, VFX, and audio should converge on
  the spell-owned name. Generic projected statuses are implementation details,
  not the player's primary identity.
