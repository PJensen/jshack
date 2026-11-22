---
name: sprite-sheet-authoring
description: Create, inspect, edit, and validate transparent game sprite sheets and optional companion maps without corrupting atlas alpha or coordinates.
---

# Sprite-sheet authoring

Use for new or edited raster sprites in an atlas, manifest updates, and
companion-map work.

## Map contract

Inspect the consumer before generating companions. A sheet may have only a
color atlas, a tangent-space normal atlas, or a true UV/layout map. These are
different artifacts. Do not assume every sheet has a normal or UV map, and do
not label a normal map as a UV map.

## Safe workflow

1. Inspect dimensions, alpha mode, cell size, manifest, and companions.
2. Generate a transparent standalone sprite and fit it into only the target
   cell.
3. Use `scripts/atlas_tool.py` for deterministic inspection, insertion, and
   optional normal generation.
4. Prefer PNG for alpha-sensitive intermediate compositing. WebP is valid, but
   re-encoding an existing transparent WebP can expose premultiplied-RGB or
   encoder artifacts in transparent pixels. Preserve WebP unless the decoded
   output is visually checked; a validated PNG atlas is safer than damaged
   alpha.
5. Update manifest coordinates after checking the rendered atlas. Keep color
   and companion-map cells aligned.
6. Validate with `view_image` and focused display tests.

`normal` is opt-in and creates a tangent-space normal map; it does not create a
UV unwrap. For JSHack class emblems, verify with:

```bash
deno test --allow-read tests/classes.test.mjs tests/classDisplayData.test.mjs tests/displayGlyphCoverage.test.mjs
```

Use `amplify` when an existing normal atlas has valid structure but the
consumer's light needs stronger relief. It scales the tangent X/Y response and
preserves the atlas layout; it does not invent a UV map.
