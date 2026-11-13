---
name: vfx-authoring
description: Author or tune JSHack entity and item VFX, especially tight colorized glows, particles, and point-light profiles.
---

# VFX Authoring

Use this skill when a visual effect should make an entity or item read as
magical, elemental, rare, burning, or otherwise emissive. Keep the rules layer
free of presentation concerns.

## Item-style glow language

The established item glow is a tight entity-centered effect:

- additive radial halo with a bright inner core and soft outer falloff;
- subtle deterministic pulse based on `_fxTime` and entity ID;
- optional colored world light centered on the same entity;
- particles may be layered on top as texture, but should not carry the whole
  visual by themselves.

The item glow implementations live in `src/main.js` (`draw*GlowAura`), while
tag-driven world illumination lives in
`src/display/lighting/sources/index.js`.

## Entity/status VFX

For continuous status visuals, use
`src/display/passes/vfx/particles/statusEmitterController.js`:

1. Add a named visual profile with color, halo radius, pulse speed, and light
   radius.
2. Create a stable emitter key from the visual key and entity ID.
3. Add the entity as an origin for particles.
4. Add a matching `getActiveLights()` probe when the effect should illuminate
   nearby tiles.
5. Remove stale emitters through the controller's existing seen-key cleanup.

Keep the halo tight around the entity. Increase light radius or light intensity
for a larger environmental impression instead of making the local halo huge.

## Verification

Use the existing controller harness when possible:

```bash
deno test --allow-read tests/statusEmitterWeaponVfx.test.mjs
```

For item/tag changes, also run:

```bash
deno test --allow-read tests/displayGlyphCoverage.test.mjs tests/worldViewWeaponVfxProfiles.test.mjs
```

Do not use `Math.random()` for animated simulation-facing behavior. Display
animation may use the existing frame-time conventions, but keep the effect
stable per entity and avoid creating a new emitter every frame.
