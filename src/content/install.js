// src/content/install.js
// Wires all DSL-registered content into the existing engine registries.
// Call installContent() once at game startup, after all content files
// have been imported (so their defineItem/defineMonster calls have run).

import { allContentItems, allContentMonsters, allContentEncounters, allContentInteractables, allContentPalettes } from './registry.js';
import { registerCatalogItem } from '../rules/data/itemCatalog.js';
import { registerMonsterDef } from '../rules/data/monsters.js';
import { registerEncounterDef } from '../rules/data/encounters.js';
import { registerPaletteEntries } from '../display/palette/base.js';
import { registerAuthoredInteractable } from '../rules/interaction/interactableRegistry.js';

/**
 * Install all DSL-defined content into the engine's existing registries.
 * Safe to call multiple times (idempotent per id — skips already-registered).
 */
export function installContent() {
  for (const [action, def] of allContentInteractables()) {
    registerAuthoredInteractable(action, def);
  }

  // ── Items → unified catalog ───────────────────────────────────
  for (const [id, def] of allContentItems()) {
    registerCatalogItem(id, def, { override: true });
  }

  // ── Monsters → monster registry ───────────────────────────────
  for (const [_id, def] of allContentMonsters()) {
    registerMonsterDef(def);
  }

  // ── Encounters → encounter registry ───────────────────────────
  for (const [_id, def] of allContentEncounters()) {
    registerEncounterDef(def);
  }

  // ── Palette entries ───────────────────────────────────────────
  const paletteEntries = {};
  for (const [identity, entry] of allContentPalettes()) {
    paletteEntries[identity] = entry;
  }
  if (Object.keys(paletteEntries).length > 0) {
    registerPaletteEntries(paletteEntries);
  }
}
