# Issue #187: Current Stat Inventory and Resolution Map

Status: Phase-A baseline, 2026-11-14

This document records the current implementation before any Issue #187
canonicalization or presentation changes. It is an inventory and map, not a
replacement stat contract. Values and behavior below describe the current
code paths and should be treated as compatibility constraints until an
explicit follow-up changes them.

## Baseline health

- 990 source files are covered by the agent health scan.
- 103 systems are registered across the scheduler phases.
- Layer-boundary violations: 0.
- Rules nondeterminism hazards: 0.
- Focused stat/equipment/resource tests pass: 36 tests, 0 failures.
- The project has 460 test files and approximately 194,000 lines of JavaScript
  under `src/`.

The project is large, but the architecture guardrails are currently healthy.
The complexity relevant to this issue is concentrated in the stat resolution,
equipment/passive, resource regeneration, and UI projection paths.

## Resolution topology

```text
BaseStats + DerivedExpression topology
             |
             v
     resolveDerivedStats()
             |
             +--> synthesize primary-stat channels
             |
             +--> ResolvedStats virtual

equipped ItemInfo.bonuses + affix passive scripts
             |
             v
     resolvePassiveBonuses()
             |
             +--> PassiveBonuses virtual
             +--> Equipment.*Derived compatibility fields

ResolvedStats + PassiveBonuses
             |
             v
     resolveCanonicalStats()
             |
             v
     resolveCombatSnapshot(mode, target)
             |
             +--> melee/ranged hit and combat consumers
             +--> HUD and character data projections

Mana/Stamina/Vitality components + PassiveBonuses
             |
             +--> resource regeneration systems
             +--> HUD/resource projections
```

The architecture memo explicitly describes `ResolvedStats` as the stat-tree
direction and `PassiveBonuses` as the compatibility bridge. Consumers should
not treat `Equipment.*Derived` as canonical truth.

## Current channel inventory

| Category | Current identifiers / fields | Main authority today | Main consumers | Phase-A classification |
| --- | --- | --- | --- | --- |
| Primary attributes | `strength`, `dexterity`, `intelligence`, `vitality` | `BaseStats` → `resolveDerivedStats()`; equipment dexterity is merged in `resolveCanonicalStats()` | combat, character data, spell/healing scripts | coherent names, but multiple intelligence sources exist (`BaseStats`, `Brain`) |
| Resources | `hp`, `mana`, `stamina` | `Vitality`, `Mana`, `Stamina` | damage/healing, expenditure, HUD, character sheet | first-class state; not one stat record |
| Resource maximums | `maxHp`, `maxMana`, `maxStamina` and `*Derived` equipment bonuses | `effectiveMaxHp/ Mana/ Stamina()` plus resource systems | HUD, regeneration, inventory data, Vitality validation | duplicated projection paths; character data currently omits effective max HP bonus |
| Resource recovery | `manaRegen`, `staminaRegen`, cooldowns | resource components + passive bonuses + resolved modifiers + hunger/encumbrance systems | regeneration systems, character sheet | runtime-effective rate is not yet one shared read model |
| Accuracy / hit | `accuracy`, `attackBonus`, `spellHit`, `spellAvoid` | `resolveCanonicalStats()` and `resolveCombatSnapshot()` | melee, ranged, spell systems, HUD/sheet | `Attack` is presentation-ambiguous; physical and spell scopes differ |
| Damage capability | `damagePower`, `damageFlatBonus`, `damageMult`, `damageDice`, `baseDamageMin/Max` | canonical stats/combat snapshot plus item `ItemInfo.damageDice` | melee/ranged execution, HUD | HUD has a local expected-value projection; no shared UI projection yet |
| Critical | `critChancePhysical`, `critChanceSpell`, legacy `critChance`, `critMultPhysical`, `critMultSpell`, legacy `critMultiplier` | derived stat synthesis + passive bonuses + combat snapshot | physical/spell damage, HUD/sheet | scope and legacy alias semantics need documentation and parity audit |
| Avoidance / defense | `evade`, `armorClass`, `defense`, `mitigation` | combat snapshot plus canonical stats | melee/ranged hit resolution, sheet/HUD | `Defense`, `Evade`, and `Armor Class` overlap in ordinary presentation |
| Physical reduction | `kineticDR`, `mitigation`, typed physical resistances | canonical stats and damage resistance pipeline | damage resolution, character sheet | `Kinetic DR` is player-facing despite not being a universal scalar projection |
| Typed defenses | `fireResist`, `coldResist`, `poisonResist`, `acidResist`, `radiationResist`, `electricOhms`, `bluntResist`, `slashResist`, `pierceResist` | canonical stats plus damage resistance resolution | `dealDamage()`, character sheet | preserve mechanics; presentation and units need explicit contract |
| Penetration | `physicalPenetration`, `bluntPenetration`, `slashPenetration`, `piercePenetration` | canonical stats | damage resolution and combat | direct channels exist and should remain first-class |
| Magic capability | `spellPower`, `spellRadius`, `spellHit`, `spellAvoid` | derived/passive canonical stats | spell scripts and presentation | `spellPower` is expression-supported and now canonical, but gear vocabulary requires audit |
| Healing | `HealingModifiers`; direct `Brain.intelligence` scaling in some spells | `applyHealing()` for mutation/modifiers; individual spell scripts for amount | healing spells, effects, procs | canonical application exists; amount formulas are intentionally non-uniform and need mapping |
| Contextual stats | `visionRange`, `hungerRate`, speed, encumbrance/carry fields | canonical/passive stats plus dedicated components/systems | FOV, hunger, stamina, movement, UI | specialized behavior; not all belong in ordinary capability display |
| Exceptional mechanics | proc topology, `Hamingja`, deity effects, affix scripts, auras | child ECS topology and script bridges | combat/effects/proc systems | preserve passive/proc split; do not flatten into global stats |

## Producer-to-consumer map

### Primary and secondary stat path

- `BaseStats` provides primary attributes and legacy critical/damage defaults.
- `DerivedExpression` children are collected from actor/equipment topology in
  `gatherDerivedExpressions()` and applied in deterministic stage/priority/entity
  order.
- `resolveDerivedStats()` synthesizes Dexterity into Accuracy/Evade and
  Strength/Vitality/Intelligence into combat and spell channels.
- `ItemInfo.bonuses` and affix passive scripts are normalized by
  `resolvePassiveBonuses()`.
- Legacy equipment aliases are still active: `attack` contributes to both
  Accuracy and Damage Power; `defense` contributes to Evade.
- `resolveCanonicalStats()` merges both projections and adds passive/resource
  channels used by combat-facing consumers.
- `resolveCombatSnapshot()` adds mode, status, posture, aura, target, and
  conditional combat behavior.

### Resource path

- `Vitality`, `Mana`, and `Stamina` own current state and base capacities.
- Equipment/affix `maxHp`, `maxMana`, and `maxStamina` values are collected by
  `PassiveBonuses`.
- `effectiveMaxHp()`, `effectiveMaxMana()`, and `effectiveMaxStamina()` provide
  shared helpers, but not every presentation consumer uses them.
- Mana regeneration adds component rate, passive bonus, resolved modifier, and
  hunger multiplier, with post-spend cooldown.
- Stamina regeneration adds component rate, passive bonus, resolved modifier,
  and encumbrance multiplier, with post-spend cooldown.
- The HUD and character data currently reconstruct parts of these formulas
  independently.

### Damage and defense path

- Weapon `ItemInfo.damageDice` supplies the intrinsic distribution.
- `resolveCombatSnapshot()` supplies flat damage and conditional multipliers.
- The HUD currently computes `floor((averageDice + flatBonus) * damageMult)`.
- Actual damage remains stochastic and uses the rules combat pipeline; the HUD
  calculation is presentation-only and is not yet a shared expected-damage
  contract.
- `dealDamage()` owns actual HP reduction, resistance resolution, events, and
  death behavior.
- `resolveResistance()` and typed resistance channels must remain distinct from
  avoidance and armor presentation.

### Healing path

- `applyHealing()` owns healing mutation and `HealingModifiers` multipliers/
  suppression.
- Spell scripts provide several amount formulas; at least some directly read
  `Brain.intelligence`.
- Proc/effect/system callers route mutation through `applyHealing()`.
- There is no evidence in the current path that a universal Healing Power
  channel should be introduced; the audit must first classify existing scoped
  formulas.

## Ambiguities and compatibility constraints

1. `Attack` means a to-hit modifier in the character sheet, while HUD `attack`
   is expected weapon damage.
2. `Defense`, `Evade`, `Armor Class`, and `Mitigation` are simultaneously
   exposed even though they answer different or overlapping questions.
3. HUD `DEF%` combines physical reduction with an AC contribution, which mixes
   incompatible units.
4. `Kinetic DR` is an internal/mechanical channel presented as if it were a
   universal defensive percentage.
5. Character data uses raw `Vitality.maxHp`, while HUD uses effective HP max.
6. Mana/Stamina displayed recovery does not include every temporary runtime
   modifier used by the corresponding regeneration system.
7. `attack` and `defense` equipment aliases are intentionally compatible but
   semantically ambiguous; migration must not silently split or double them.
8. `spellPower` is a valid derived channel but ordinary equipment authoring and
   passive normalization need a complete key audit.
9. Physical and spell critical channels exist separately, while shared passive
   critical bonuses currently contribute to both.
10. Healing application is canonical, but spell amount formulas are not uniform.

## Baseline verification

The following focused tests passed before Phase-A documentation changes:

```text
deno test --allow-read --no-check \
  tests/derivedStats.test.mjs \
  tests/statPipeline.test.mjs \
  tests/equipmentSystem.test.mjs \
  tests/manaRegen.test.mjs \
  tests/encumbrance.test.mjs \
  tests/inventoryDataProvider.test.mjs

36 passed, 0 failed
```

Relevant existing guardrails include `statPipelineArchitectureGuards.test.mjs`,
`passiveBonusesArchitectureGuards.test.mjs`, `resistanceProjection.test.mjs`,
`applyHealing.test.mjs`, and `combat.test.mjs`.

## Phase-A follow-up boundaries

The next phase can now be split without re-discovering the topology:

1. Define the canonical vocabulary and units from this inventory.
2. Add shared effective resource/recovery read models and parity tests.
3. Add a shared expected-damage projection without changing stochastic combat.
4. Resolve defensive display concepts and remove the invalid HUD composite.
5. Audit critical and healing scopes before changing itemization semantics.

No gameplay behavior is changed by this document.
