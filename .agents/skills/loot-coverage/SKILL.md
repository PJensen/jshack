---
name: loot-coverage
description: Audit JSHack loot tables for schema errors, broken references, runtime reachability, and test coverage.
---

# Loot coverage

Use this skill when examining or extending `src/rules/data/lootTables.js`, or
when a new item, monster, chest, container, shop, rack, or fishing reward needs
to be proven reachable and covered.

The canonical audit tool is:

```bash
deno run --allow-read .agents/skills/agent-tools/scripts/loot-coverage-audit.mjs
```

Useful forms:

```bash
deno run --allow-read .agents/skills/agent-tools/scripts/loot-coverage-audit.mjs --format csv
deno run --allow-read .agents/skills/agent-tools/scripts/loot-coverage-audit.mjs --format json
deno run --allow-read .agents/skills/agent-tools/scripts/loot-coverage-audit.mjs --fail-on-catalog-gaps
deno task audit:loot
```

Interpret the report in three layers:

- `validation issues` are actionable definition problems: invalid rolls or
  weights, unknown item/equipment/archetype IDs, missing nested tables, or
  cycles.
- `runtime-unreachable` means no direct source reference or known dynamic route
  reaches the table. Shared `sub:` tables are expected to be reached through a
  parent table and should show `nested-or-dynamic`.
- `without direct test references` is a coverage lead, not automatically a bug:
  tests may exercise a table through a parent table or a structural audit.
- `catalog coverage` is the reverse audit: it asks whether every catalog
  equipment item, magic item, and `reagent_*` item appears in a reachable loot
  path. Archetype-backed drops such as berries and mapping scrolls are counted
  through their canonical archetype.

When adding a table or changing its entries:

1. Run the audit and inspect the CSV row for the table.
2. Add or update a focused behavior test for its canonical caller.
3. Keep `tests/lootCoverage.test.mjs` green; it guards catalog equipment
   inclusion and the audit's structural invariants.
4. Use `--fail-on-issues` for table integrity. Use
   `--fail-on-catalog-gaps` when catalog completeness is required. Use
   `--fail-on-uncovered` only when runtime, test, and catalog gaps have all
   been reviewed.

The tool is read-only and imports the canonical `LOOT_TABLES` and
`ITEM_CATALOG`; do not duplicate table data in the skill.
