---
name: aura-authoring
description: Add or extend persistent aura-backed abilities and content in the JSHack roguelike, including affected-entity visuals.
---

# Aura Authoring

Use this skill when an ability, item proc, monster power, or authored content
should affect entities in an area over time and visually mark each current
recipient.

## Canonical pipeline

An aura has two related but separate visual layers:

- the world-space aura field around its source, represented by an `AuraField`
  entity (not a `HazardArea`);
- a tight, colorized glow on every affected entity, including the source when
  the rules intentionally include it.

Author the gameplay effect through the canonical status/aura path:

1. Define the ability data in `src/rules/data/spells.js` or the relevant
   content catalog, including `auraVisual` when the effect has a recipient
   visual.
2. Apply the status with `sourceKind: "aura"` and a stable `sourceKey`.
3. Use `spawnAuraField()` from `src/rules/utils/auraFieldSpawn.js` or the
   established spell script path; do not overload `spawnHazard()` for aura
   persistence and do not create a parallel visual-only status.
4. Let `src/bridge/schema/worldView.js` derive `auraGlows` from aura provenance.
5. Map the visual key in
   `src/display/passes/vfx/particles/statusEmitterController.js` to the tight
   item-style halo, particles, and (when appropriate) a matching point-light
   probe.

The bridge should remain the read-only projection boundary. Rules should not
import display code or attach visual state to `world`.

When an aura field refreshes a status, preserve the authored spell/content key
in the refreshed status source. A field identity such as `wolf_howl_aura` is a
display label and may not exist in `SPELL_DEFS`; replacing `wolf_howl` with it
silently removes the recipient glow while leaving gameplay effects active.

## Content and behavior checks

For a new aura, test all of the following:

- correct faction/relation and radius targeting;
- duration/refresh behavior through the field pulse;
- source inclusion or exclusion explicitly;
- `auraGlows` projection on recipients;
- visual/light profile creation and cleanup;
- no aura visual for unrelated generic statuses unless their provenance is an
  aura source.

Useful focused commands:

```bash
deno test --allow-read tests/monsterAuras.test.mjs tests/monsterAbilities.test.mjs
deno test --allow-read tests/statusEmitterWeaponVfx.test.mjs
deno task guard:architecture
```

When an aura is attached to an item proc, preserve the canonical proc/status
path and add the item as the source. Do not turn a one-shot `ctx.vfx.glow()`
burst into the persistent aura representation; that API is for transient
presentation effects.
