# Wand of Stasis Investigation Handoff

Date: 2026-09-14

## User repro

The reported live-game repro is:

```text
give wand_stasis
spawn war_drummer
use/cast the wand on the creature
the creature shows the stasis/frozen visual, but continues moving, following,
casting, and otherwise acting
```

The same behavior was also reported for rats. The user is confident this is
not monster-specific and suspects a real-runtime versus test-runtime split.

The user explicitly rejected retaining a `mirrorLegacy` fallback. `mirrorLegacy`
was removed and must not be reintroduced.

## Current repository state

- Current HEAD: `342a0099 fixed: stasis cont (pt 4)`
- Relevant preceding commits:
  - `6ed0f747 fixed: stasis moves corrected`
  - `055e7298 arch: explicit mv intent lifecycle`
  - `5512551d fixed: stasis pt 3`
  - `0199614f fixed: mirror legacy has been removed as initially intended`
- `VERSION` in HEAD: `0.9.1020`
- Working tree was clean at handoff.
- No `mirrorLegacy` references remain in the repository search.

## Canonical stasis implementation

`src/rules/utils/stasis.js`:

```js
applyStatusEffect(world, targetId, {
  key: "stasis",
  turnsLeft: 8,
  stacks: 1,
  potency: 1,
});
```

Stasis is topology-only. It is stored as an attached `StatusEffectNode` with a
`Duration` child/component. It is intentionally not stored in `ActiveEffects`
and `statusFacade.js` intentionally ignores legacy `ActiveEffects`/`Status`
stasis entries.

Relevant files:

- `src/rules/utils/stasis.js`
- `src/rules/utils/effects.js`
- `src/rules/utils/statusFacade.js`
- `src/rules/components/StatusEffectNode.js`
- `src/rules/components/Duration.js`
- `src/rules/data/effectDefs.js`

## Actual wand pathway

1. `wand_stasis` is authored in `src/content/items/wands.js`.
2. Its `on_use` hook emits `wand:stasis` through the interaction context.
3. `src/main/wiring/scrollWandWiring.js` listens for `wand:stasis`.
4. That listener scans visible enemies and opens enemy targeting.
5. The targeting callback calls `applyWandStasis(world, enemyId)`.
6. If successful it emits the message and `wand:stasis:vfx`.
7. `floatTextWiring.js` renders `FROZEN IN TIME!` and particle FX.

The ranged HUD pathway (`rules.shootRanged`) creates a `UseIntent`, so it still
routes through the canonical use pipeline. `useItemSystem.js` resolves it via
`executeInteraction()` and `usePipeline.js`.

## Fixes already made

### 1. Intent cancellation

`MoveIntent` now has:

```js
cancelled: false,
cancelReason: "",
```

`intentValidationSystem` runs first in the intents phase. During stasis it:

- marks `MoveIntent` as cancelled with reason `"stasis"`;
- removes all other action intents except `WaitIntent`;
- emits `intent:blocked`.

`movementSystem` also has a direct stasis guard and consumes cancelled moves.

### 2. AI/ability guards

Stasis is checked in:

- `speedGate.canActThisTurn()`;
- `aiChaseSystem` before perception/LOS callbacks;
- monster LOS callback context;
- direct AI callback factories (`castSpellOnLOS`, `gazeOnLOS`,
  `selfThrowNearTargetOnSeen`, `fireBreathLineOnLOS`);
- `knockbackSystem`;
- `tileStepEffectSystem` ice sliding;
- channel interruption policy.

This was intended to stop both ordinary intents and direct AI side effects.

### 3. Zero-delta runtime bug

The debug console calls `world.tick(0)` after every command. `World.tick(0)`
still invokes the scheduler, and the old `effectSystem` decremented timed
effects on every scheduler invocation regardless of `dt`.

That meant repeated console refreshes could consume all eight stasis turns
without advancing a gameplay turn.

`effectSystem(world, dt = 1)` now returns immediately when `dt <= 0`.

This fix is in `src/rules/systems/effectSystem.js` and was committed in
`342a0099`.

## What was verified successfully

The following focused tests passed after the fixes:

```text
40 passed:
  stasisRuntime, wandOfStasis, intentValidationSystem,
  movementRefactored

20 passed:
  effects, castSpell, monsterSpellcasters, stasisRuntime

13 passed:
  architecture guard suite
```

The configured runtime test spawns a real debug `war_drummer`, applies stasis,
ticks five real turns, and verifies:

- position is unchanged;
- no `monster:ability:cast` event occurs;
- no `CastSpellIntent` remains.

An additional direct runtime reproduction tested a rat while moving the player
for five turns. The rat stayed at the original position, retained stasis, and
did not acquire aggro.

An end-to-end source reproduction also exercised:

- `UseIntent`;
- `useItemSystem`;
- the actual wand hook;
- `wand:stasis` listener;
- targeting callback;
- `applyWandStasis`;
- subsequent player movement ticks.

That path also froze the rat correctly.

The exact old failure was reproduced with eight `world.tick(0)` calls after
applying stasis: stasis reached zero. That specific failure is now fixed.

## Important display clue

The persistent `stasis` light/tag is not currently projected from topology in
the bridge. `src/bridge/schema/worldView.js` projects display status tags from
`Status` and legacy `ActiveEffects`, while canonical stasis lives in topology.
The `FROZEN IN TIME!` text/particles come from the one-shot
`wand:stasis:vfx` event.

Therefore, if the live client shows a persistent stasis tag/light, verify which
runtime path produced it. Seeing the VFX alone proves only that the targeting
callback emitted its VFX event; it does not independently prove the live
client's rules runtime is the same source revision.

## Unresolved contradiction

The source-level configured runtime and the complete wand-use pathway work, but
the user still reports that a rat visibly follows after stasis, including after
the version was bumped.

No rat-specific direct movement bypass has been found. Rat authored behavior is
an ordinary enemy AI path with a `whileLOS` `castSpellOnLOS` hook. Both the rat's
movement and spell callback are currently guarded by the canonical stasis
checks.

Potential explanations still requiring live-runtime evidence:

1. The browser is executing a different/stale `main.js` or a deployment that
   does not contain the current source, despite the displayed version bump.
2. The VFX/visualized creature is not the entity ID that received the status.
3. The live client has another runtime world or another movement path not
   represented by the current source path.
4. The observed “glow” is the one-shot VFX rather than a topology-backed
   status projection.
5. The user is observing behavior after the intentional eight real-turn
   duration has expired.

## Recommended next investigation

Do not add another speculative guard first. Add temporary, visible runtime
telemetry at the exact wand callback and movement boundary:

- emit/log the target entity ID, identity, position, `world.step`, and topology
  duration immediately after `applyWandStasis`;
- log every `moved` event for that ID with the same values;
- expose the loaded `window.VERSION` and module version in the debug console;
- project canonical topology stasis into the bridge temporarily or add a debug
  command that prints the topology duration for a selected monster.

The key invariant to prove in the live client is:

```text
wand callback target ID === moving entity ID
AND
statusStrength(target ID, "stasis") > 0 at the movement tick
AND
no moved event is emitted for that ID during the active duration
```

Once those three values are captured from the same browser session, the
remaining issue should be localized quickly without restoring any legacy path.
