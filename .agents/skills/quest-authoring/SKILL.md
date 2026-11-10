---
name: quest-authoring
description: Use when adding a quest-backed dungeon, landmark destination, quest giver, encounter roster, or multi-stage content arc to JSHack.
---

# Quest Authoring

Build quests as complete authored content arcs: a believable quest giver, a reachable destination, an explicit encounter roster, deterministic progression, and focused verification.

## Start with intent and existing patterns

Before editing:

- Check `entire status`.
- Inspect recent checkpoints for related quest, dungeon, monster, or encounter work.
- Scan all relevant humanoid/monster definitions before inventing a new role.
- Use `agent-target` and `content-id-audit` for existing IDs and references.

Prefer extending existing thematic content. Do not force unrelated identities into a quest roster. For example, bandits should not become healers simply because a healer encounter is needed.

## Design the arc first

Define these explicitly:

- Quest giver and why they care.
- Destination and why its environment fits.
- Exact monster identities that appear there.
- Quest objective and completion condition.
- Reward that reinforces the discovery.
- Whether the destination is generic, quest-specific, or guaranteed authored content.

Avoid overloading one monster with every related ability. Split identities by theme:

- Priest: targeted support.
- Druid: nature/area healing.
- Shaman: ritual or elemental support.
- Geomancer: defensive stone-based support.
- Witch, bandit, or assassin identities should remain distinct unless their lore genuinely supports healing.

## Canonical files

For a quest-backed dungeon, inspect and usually update:

- `src/rules/environment/dungeon/underworldRegions.js`
- `src/rules/data/buildings/<landmark>.js`
- `src/rules/quests/definitions/<quest>.js`
- `src/rules/dialogues/townfolkDialogs.js`
- `src/main/scheduler.js`
- `src/content/monsters/*.js`
- `src/content/encounters/*.js`
- `tests/`

Use existing quest definitions such as `graveyardWatch.js`, `ratInfestation.js`, and `priestRift.js` as structural references.

## Dungeon destinations

When a landmark should lead to a special dungeon:

1. Add a `stair_down` spawn to the landmark building with `entranceTemplateId`.
2. Add a matching underworld template.
3. Use only registered dungeon features and traps.
4. Give the template an explicit `questId` when it is quest-owned.
5. Use explicit `content.monsters` entries when the quest must guarantee a particular encounter.
6. Add a restrictive `monsterFilter` so unrelated random monsters do not dilute the authored identity.
7. Run `deno task audit:quests` to validate the existing quest, destination,
   entrance, and authored monster fields.

Do not invent feature or trap IDs. Confirm them in `populate.js` or existing templates first.

## Quest implementation

A quest definition should:

- Use `registerQuest`.
- Have clear `offer`, objective, `report`, and terminal states where appropriate.
- Be instantiated idempotently with `ensure...Quest()`.
- Validate player, giver, quest ID, and speaker IDs in dialogue guards.
- Emit quest lifecycle events through existing quest actions.
- Grant rewards only once during the report transition.
- Be imported before `installQuestRuntime()` runs.

For quest-specific runtime hooks:

- Use `defineExtension(...)` and `world.install(...)`.
- Give the extension a stable key.
- Register systems in the correct scheduler phase.
- Death objectives should inspect `DeathApplied` and run after canonical monster-death hooks.
- New event contracts must use concrete `EcsEvent` classes; do not introduce string-only event contracts.

Multi-leg quests may reuse an existing event name at different nodes (for
example, `dialog:reported` when reporting to two different NPCs). The quest
compiler must preserve every node's edge for that event; add a regression test
when introducing a repeated event route.

Reward authoring should expose structured metadata in `journal.rewardItemIds`
or `journal.rewardItems` plus `journal.rewardGold`. For a choice, set
`journal.rewardChoice` and let the journal render each item from catalog data;
do not duplicate item names in prose or silently grant every listed option. For
balanced themed choices, use `journal.rewardChoices` with an `id`, display
`label`, and `items` package. Use `journal.rewardBonusItems` for a guaranteed
side reward shared by every choice. The canonical `grantSelectedReward()` path
creates both the selected package and bonus items, while
`selectedQuestRewardItemIds()` keeps completion events accurate for multi-item
packages. Validate every authored item with the canonical item factory; this
also covers rings, gems, and generated enchantment scrolls.

## Dialogue integration

Townfolk roles may receive a generic dialog automatically. If a role becomes a quest giver:

- Register a dedicated dialog with the same `townfolk:<role>` ID after the generic registration, or exclude it from the generic loop.
- Ensure the quest record exists when the dialog is evaluated.
- Show different text for offer, active objective, report, and complete states.
- Keep the destination and objective understandable without relying on hidden state.

## Verification

Run the smallest meaningful set:

```bash
deno check <touched-files>
deno test --allow-read tests/<quest-test>.mjs tests/dungeon.test.mjs
deno run --allow-read .agents/skills/agent-tools/scripts/content-id-audit.mjs <new-id> --limit 80
deno task guard:architecture
deno task guard:events
git diff --check
```

Add a focused contract test proving:

- The destination template is registered.
- The quest is registered.
- Required authored monster IDs appear in the destination.
- Quest stages exist.
- New monster variants have the intended tags and spell loadouts.

Common failure modes:

- Adding abilities to an existing mob instead of creating a distinct identity.
- Creating a dungeon that does not guarantee the quest encounter.
- Forgetting to import the quest before quest-runtime installation.
- Instantiating a quest only from its dialogue instead of seeding it during run
  setup, which prevents the quest-giver marker and journal discovery from appearing.
- Letting a generic townfolk dialog hide the quest-specific dialog.
- Referencing nonexistent dungeon features, traps, monsters, or landmark IDs.
- Adding a healer to a faction whose identity does not support it.
