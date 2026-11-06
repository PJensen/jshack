---
name: agent-tools
description: Use JSHack's deterministic inspection and architecture tools to locate behavior, verify boundaries, and gather evidence before changing code.
argument-hint: <question-or-target>
---

Use this skill when a task needs repository-wide discovery, architecture evidence,
event wiring analysis, scheduler mapping, content-ID tracing, or a health check.
These tools are read-only unless a command explicitly says otherwise. Their
canonical implementations live beside this guide in `scripts/`; invoke them
from the repository root and prefer the smallest output mode that answers the
question.

## Start with the question

Choose the route before searching broadly:

| Need | Tool | First command |
| --- | --- | --- |
| Find a symbol, event, file, or test | `agent-target` | `deno run --allow-read .agents/skills/agent-tools/scripts/agent-target.mjs TERM --limit 80` |
| Trace an item, monster, spell, material, loot, or visual ID | `content-id-audit` | `deno run --allow-read .agents/skills/agent-tools/scripts/content-id-audit.mjs ID --limit 80` |
| Inventory item rarity slots and find legacy/mismatched labels | `item-rarity-audit` | `deno run --allow-read .agents/skills/agent-tools/scripts/item-rarity-audit.mjs --gear-only --format csv` |
| Find proc-package gear missing authored Equip mechanics | `proc-gear-audit` | `deno run --allow-read .agents/skills/agent-tools/scripts/proc-gear-audit.mjs --unconverted` |
| Compare same-slot gear and flag obvious strength outliers | `item-strength-audit` | `deno run --allow-read .agents/skills/agent-tools/scripts/item-strength-audit.mjs --outliers --format csv` |
| Understand event producers and consumers | `event-bus-explorer` | `deno run --allow-read .agents/skills/agent-tools/scripts/event-bus-explorer.mjs --format summary --top 40` |
| Inspect one event contract | `event-bus-explorer` | `deno run --allow-read .agents/skills/agent-tools/scripts/event-bus-explorer.mjs --format csv --event EVENT` |
| Map scheduler registration and phases | `system-map` | `deno run --allow-read .agents/skills/agent-tools/scripts/system-map.mjs --format summary` |
| Find unregistered or untested systems | `system-map` | `deno run --allow-read .agents/skills/agent-tools/scripts/system-map.mjs --unregistered` or `--missing-tests` |
| Check architecture hazards | `agent-health` | `deno run --allow-read .agents/skills/agent-tools/scripts/agent-health.mjs` |
| Inspect import-layer violations | `import-boundary-report` | `deno run --allow-read .agents/skills/agent-tools/scripts/import-boundary-report.mjs` |

## Evidence workflow

1. Run the narrowest relevant command before reading unrelated source.
2. Follow tool results to the named files, systems, tests, or event contracts.
3. Check scheduler registration and layer boundaries when the change crosses
   rules, bridge, display, or main.
4. Check event producers and consumers when adding or changing an event.
5. Use `content-id-audit` before changing content-facing definitions so every
   canonical reference and presentation path is known.
6. Run `deno test --allow-read tests/agentTools.test.mjs` if tool behavior or
   parsing assumptions change.

## Class identity/display verification

When adding or changing a player class, treat its identity as a cross-layer
contract. Verify all of these independently:

- `CLASS_DEFS` registration, valid deity, starter equipment, inventory, and spells.
- A fresh runtime applies `player_<classId>` to `NamedIdentity` and projects the
  same value through `WorldView`.
- `applyPlayerClassLoadout()` repairs the identity when the player entity
  already exists; this covers the live new-game path after entity creation.
- `buildPalette()` contains `player_<classId>` and the glyph atlas can resolve it.

The smallest useful regression set is:

```bash
deno test --allow-read tests/classes.test.mjs tests/agentRuntime.test.mjs tests/displayGlyphCoverage.test.mjs
```

Do not validate only the palette row: a correct palette cannot fix a stale or
generic `NamedIdentity` reaching the bridge.

## Useful output modes

- `summary` is for a fast human scan.
- `csv` is for exact producer/consumer or reference inspection.
- `mermaid` is for visualizing event relationships.
- `--producer-only` and `--consumer-only` expose orphaned event wiring.
- `--phase`, `--unregistered`, and `--missing-tests` focus the system map.

## Guardrails

- Treat reports as evidence, not as permission to delete apparently unused
  files. Listener installers and dynamic references can be intentionally absent
  from static registration results.
- Keep tool changes deterministic, import-safe, and usable with `--allow-read`.
- Extend existing tools when a question recurs; do not add a one-off grep script
  for a query they can already answer.
- When a new recurring workflow is proven, update this skill with the route and
  validation command rather than creating duplicate guidance elsewhere.

Use this skill to discover canonical code and event/scheduler ownership, then
hand off seeded behavior proof to `runtime-tools`. Producer-only and
consumer-only reports require manual classification; imported-but-unregistered
systems may be listener installers. Do not delete from reports alone.

## Related project tasks

```bash
deno task guard:architecture
deno task guard:events
deno task guard:tools
deno task audit:health
deno task audit:events
deno task audit:systems
```

