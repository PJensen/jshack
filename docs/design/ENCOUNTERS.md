# Encounters

Encounters are the authored contract for how creatures enter a run. Monster
definitions describe what a creature is capable of; encounter definitions
describe where, when, and how it can appear.

Encounter content lives in `src/content/encounters/` and is installed into the
rules encounter registry. Runtime progress is represented by the ECS
`EncounterState` component, so activation and uniqueness survive floor changes
and save/restore in the same way as other simulation state.

An encounter can describe ordinary population, a dungeon composition, or a
singleton creature:

```js
defineEncounter("norse:draugr", {
  kind: "singleton",
  creatureId: "draugr",
  uniqueness: "run",
  activation: { type: "questCompleted", questId: "starter.priest_fetch" },
  placement: { plane: "underworld", minDepth: 4 },
  materialization: "near_player",
});
```

The encounter system owns activation, one runtime state per encounter,
placement checks, generic singleton materialization, and resolution of
run-unique creatures after defeat. Creature-specific behavior can remain in a
dedicated rules system, as Ratatoskr's roaming messenger state machine does;
that system consumes the encounter's active state instead of deciding whether
the creature exists.

The original overworld population table and dungeon encounter-group table are
also authored through this surface. New creature unlocks should add an
encounter definition and use an existing materialization/lifecycle strategy
before adding creature-specific spawn wiring.
