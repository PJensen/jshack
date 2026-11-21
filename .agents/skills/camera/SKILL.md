---
name: camera
description: Tune or extend JSHack's display-only camera behavior, including follow, zoom, focus effects, cinematic transitions, and camera-related input/FOV handoffs.
---

# Camera

Use this skill for camera motion or presentation work in JSHack. Keep camera
state display-only: gameplay coordinates, targeting, and simulation state stay
in `rules/` and are observed through the WorldView.

## Canonical ownership

- `src/display/camera/controller.js` owns the camera resource, smoothing,
  detached focus, transforms, and screen/world coordinate conversion.
- `src/display/camera/follow.js` owns ordinary entity-follow motion.
- `src/display/camera/utils.js` owns direct jumps and eased camera moves.
- `src/display/camera/zoomPunch.js` owns additive combat/reward zoom pulses.
- `src/main.js` owns camera creation, frame-loop ordering, pointer conversion,
  and the final decision between cinematic motion and player follow.
- `src/display/input/inputLock.js` provides overlapping input locks for camera
  cinematics that must temporarily prevent gameplay input.

## Frame-loop invariant

The frame loop updates camera state before rendering, then obtains the cached
WorldView. Ordinary follow happens after the WorldView is available. A camera
cinematic must take precedence over `followEntity()` while active and must
restore `cam._detached`, target coordinates, scale, and any temporary input/FOV
state when it completes.

## Opening flyovers

Opening flyovers belong in a small display-only director such as
`src/display/camera/openingFlyover.js`. Start them only for the intended fresh
run path; save-game restores and debug/spell-reel modes should not unexpectedly
replay a new-game introduction. Draw the unmasked terrain through the opening
landscape pass so gameplay FOV and exploration memory stay canonical. Use
`setInputLock()` with a unique key while the player cannot act.

The opening projects materialized entrances and quest givers in main and reads
outdoor landmark anchors from the cached overworld plan. Use the entrance label
for a site with a dungeon entrance so the tour titles it once. Check that
anchors are on loaded tiles. Keep the route deterministic and budget time per
leg so more stops do not squeeze the labels. Route ordering keeps the opening
corner and player fixed. Adjacent legs share waypoint velocities. Draw labels
in CSS pixels using the live camera projection so they stay legible and pinned
to the terrain through both pan and zoom.

The flyover composites one cached landscape image per frame. When changing the
world extent, keep the raster pixel budget independent of the number of tiles.
Test landmark placement with `tests/overworldStructures.test.mjs`.

## Verification

Start with focused pure-camera tests:

```bash
deno test --allow-read tests/cameraController.test.mjs tests/openingFlyover.test.mjs
```

For changes that touch frame-loop wiring or layer boundaries, also run:

```bash
deno task guard:architecture
```

When static tests cannot prove the visual handoff, use the runtime-tools skill
for a bounded seeded run. A successful process exit alone is not proof; verify
that the camera starts detached/zoomed out, reaches the player, and restores
input and FOV state.

