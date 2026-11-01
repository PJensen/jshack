# Agentic Development Techniques

This note identifies concrete techniques that make agentic development workable
in JSHack despite the project's scale, JavaScript-only implementation, lack of
static type safety, ECS complexity, and single-author architectural ownership.

This is not a ranking. It is an inventory of observed techniques, with concrete
project evidence where the technique lives in the repository. Some entries are
repo-local mechanisms; some are surrounding agent workflow/tooling that this repo
depends on operationally.

## Agent Field Manual

`AGENTS.md` is an operational manual for coding agents. It gives hard laws,
known commands, architecture maps, target lookup commands, event-bus inspection
commands, focused tests, common locations, listener patterns, and a merge
checklist.

Evidence:

- `AGENTS.md` lists hard architecture laws such as no build step, Deno-only
  tooling, no swallowed event failures, concrete event classes for new event
  contracts, deterministic rules simulation, no new `world[...]` state, and
  separation boundaries.
- `AGENTS.md` gives exact command recipes for `deno task check`,
  `deno task guard:architecture`, `deno task guard:events`,
  `deno task guard:tools`, `deno task ratchet:world-state`, and the
  `.agents/skills/agent-tools/scripts/` inspection tools.

Technique: the project does not rely on agents discovering local norms from
scratch. It publishes the intended workflow as an executable-oriented manual.

## Named Guardrail Tasks

`deno.json` packages project health checks into stable task names:

- `check`
- `guard:architecture`
- `guard:events`
- `guard:death`
- `guard:tools`
- `ratchet:world-state`
- `audit:events`
- `audit:damaged`
- `audit:died`
- `audit:systems`
- `audit:health`

Evidence: `deno.json` wires these tasks to architecture tests, event doctrine
tests, agent tooling tests, event-bus summaries, system-map summaries, and
world-state ratchets.

Technique: agents can run well-named project-level checks without reconstructing
the correct command line or deciding which tests matter for a given architectural
surface.

## CLI-Based Project Health

The project has custom CLIs that let an agent measure project health and locate
behavioral surface area.

Evidence:

- `.agents/skills/agent-tools/scripts/agent-health.mjs` scans for `emitSafe`, rules nondeterminism hazards,
  generation async allowances, layer boundary violations, possible
  system-to-system calls, and registered-vs-file system counts.
- `.agents/skills/agent-tools/scripts/event-bus-explorer.mjs` scans literal and dynamic `world.emit`,
  `world.on`, `ctx.io.emit`, and `ctx.on` usage. It can report producers,
  consumers, payload keys, orphaned producers, orphaned consumers, CSV, and
  Mermaid output.
- `.agents/skills/agent-tools/scripts/system-map.mjs` parses scheduler imports and `registerSystem(...)`
  calls, reports phases, unregistered system files, and registered systems
  without obvious tests.
- `.agents/skills/agent-tools/scripts/agent-target.mjs` ranks search results by event, symbol, file, import,
  and text.
- `.agents/skills/agent-tools/scripts/content-id-audit.mjs` follows content IDs through definitions, tests,
  visuals, spawn/loot references, events, and ordinary references.

Technique: agents are given measuring instruments, not just documentation. The
repo can answer questions such as "which events are orphaned?", "what consumes
this event?", "which systems are registered?", "where does this item ID appear?",
and "what hazards are currently known?".

## Tooling Is Tested

Agent-facing tools have their own regression suite.

Evidence:

- `tests/agentTools.test.mjs` tests event-bus extraction, orphan filters,
  system-map parsing, import-boundary classification, target-search ranking,
  content-ID classification, and agent-health formatting/classification.
- `deno task guard:tools` runs `tests/agentTools.test.mjs` and then prints the
  system map.

Technique: the tools agents depend on are treated as project infrastructure, not
throwaway scripts. This matters because broken diagnostics can mislead an agent
as badly as broken game code.

## Markdown Doctrine Plus Executable Enforcement

The repo has extensive Markdown doctrine, but Markdown is not assumed to be
self-enforcing.

Evidence:

- `docs/architecture/SEPARATION_MANIFEST.md` documents layer boundaries,
  deterministic rules, bridge contracts, display contracts, and merge checklist
  items.
- `docs/architecture/TEN_COMMANDMENTS.md` documents historical failure modes and
  converts them into rules such as tests before systems, one new system per
  session, gameplay before graphics, data before hard-coded system logic, and no
  second scheduler.
- `tests/separationBoundaries.test.mjs` enforces rules/display import separation.
- `tests/determinismArchitectureGuards.test.mjs` scans deterministic layers for
  forbidden random/time APIs.
- `tests/eventDoctrineGuards.test.mjs` ratchets event-pipeline behavior.
- `ratchets/worldStateAttachmentRatchet.test.mjs` enforces an allowance list for
  existing `world[...]` state and fails if that debt grows.

Technique: docs carry intent, but ratchets and CLIs carry enforcement. The
operational pattern is "write the doctrine, then give agents an executable way to
notice drift."

## Deterministic Simulation

The rules layer is designed to be replayable.

Evidence:

- `docs/architecture/SEPARATION_MANIFEST.md` says the same seed and intent
  sequence should produce identical state/events.
- `tests/determinismArchitectureGuards.test.mjs` rejects `Math.random()`,
  `Date.now()`, `new Date()`, `performance.now()`, `globalThis.crypto`, and
  `getRandomValues()` in deterministic layers.
- `src/lib/ecs-js/AGENTS.md` describes a deterministic core, caller-driven ticks,
  pure logic, and step-and-explain workflows.

Technique: deterministic replay lets agents investigate behavior by seed,
intent sequence, and focused tests rather than by visual guesswork or transient
runtime state.

## Clear Layer Boundaries

The codebase is divided into `rules`, `bridge`, `display`, `main`, `shared`,
`content`, and `lib`.

Evidence:

- `docs/architecture/SEPARATION_MANIFEST.md` declares allowed imports and the
  intended flow: rules -> bridge -> display.
- `tests/separationBoundaries.test.mjs` scans imports to reject rules importing
  display and display importing rules.
- `.agents/skills/agent-tools/scripts/import-boundary-report.mjs` and `agent-health.mjs` provide
  CLI-level import boundary reporting.

Technique: agents can work locally because boundaries constrain blast radius.
The display layer cannot casually mutate rules, and rules cannot smuggle
rendering concerns into simulation.

## Central Scheduler With Explicit Phases

`src/main/scheduler.js` is the composition root for rules systems.

Evidence:

- `configureWorld(world)` clears systems, installs listeners/virtuals/runtime
  hooks, registers systems, composes the scheduler, and sets it on the world.
- Systems are grouped into explicit phases: `ai`, `intents`, `effects`,
  `scripts`, and `cleanup`.
- Registrations use `before` and `after` constraints for local ordering, such as
  movement before ranged actions, channeling before spell casting, and cleanup
  before spatial index sync.

Technique: ordering is visible in one place. An agent can reason about causal
order without inferring it from hidden system-to-system calls.

## Event-Driven ECS Discipline

The project uses events and intent components to decouple systems.

Evidence:

- `AGENTS.md` requires systems to communicate with `world.emit` / `world.on`,
  not direct system-to-system calls.
- `.agents/skills/agent-tools/scripts/event-bus-explorer.mjs` exists specifically because event contracts are
  important enough to inspect.
- `AGENTS.md` requires new event contracts to use concrete `EcsEvent` classes.
- `src/events/Died.js` is an example concrete event class.
- `tests/eventDoctrineGuards.test.mjs` checks death/damage event doctrine and
  canonical death producer behavior.

Technique: event surfaces become queryable contracts. This gives agents a way to
trace behavior across many files without needing static type graphs.

## Data-Driven Content DSL

Items and monsters use a content DSL rather than parallel hand-maintained tables.

Evidence:

- `docs/CONTENT-AUTHORING.md` says one `defineItem(...)` call registers catalog
  entry, glyph/palette, and hooks, with no secondary registration step.
- `src/content/define.js` implements `defineItem(id, def)` and
  `defineMonster(id, def)`.
- `src/content/registry.js` stores compiled items, monsters, palettes,
  presentations, and abilities.
- `tests/contentDsl.test.mjs` checks item registration, palette registration,
  equipment-field compilation, hook compilation, monster registration, and
  required-field validation.

Technique: without TypeScript, the content DSL gives agents a smaller,
validated authoring surface. It also prevents catalog/palette/hook drift by
compiling related projections from one definition.

## Import-Time Validation

The project uses runtime validation at module import/registration boundaries.

Evidence:

- `defineItem` throws when `id`, `def`, `name`, or `type` is missing.
- `defineMonster` throws when `id`, `def`, or `name` is missing.
- `src/content/registry.js` throws on duplicate item and monster definitions.
- Tests assert those failures.

Technique: this partially replaces static type safety with fast, deterministic
failure when content is malformed.

## Canonical Paths And Facades

The project repeatedly names canonical paths for complex behavior.

Evidence:

- `AGENTS.md` requires spawn, damage, spell cast, status application, inventory
  transfer, and materialization paths to delegate to canonical implementation.
- `docs/architecture/RUNTIME_TOPOLOGY_DOCTRINE.md` says read/write access for
  inventory is mediated through facades rather than every system inventing
  traversal.
- Common locations in `AGENTS.md` point agents to canonical files such as
  `src/rules/utils/dealDamage.js`, `src/rules/utils/inventoryFacade.js`,
  `src/rules/utils/statusFacade.js`, `src/rules/environment/dungeon/materialize.js`,
  and `src/bridge/schema/worldView.js`.

Technique: agents are steered toward existing authoritative implementations
instead of creating parallel behavior.

## Runtime Topology Doctrine

The project has an explicit rule for modeling runtime multiplicity as child
entities.

Evidence:

- `docs/architecture/RUNTIME_TOPOLOGY_DOCTRINE.md` says runtime things with
  identity, lifecycle, ownership, source, duration, charges, removability,
  targeting, behavior hooks, query relevance, debug relevance, or save/load
  significance should usually be represented as their own entities.
- The same doc discourages array-backed runtime state for active effects,
  sockets, and enchantments.
- The doc defines migration rules: new systems must follow runtime topology,
  touched systems should migrate toward it, and legacy arrays are compatibility
  state rather than precedent.

Technique: agents get a durable modeling rule for complex ECS state. This is
especially important in a large JS ECS codebase because opaque arrays become
hard for agents to inspect, query, remove, serialize, or debug.

## Ratchets For Known Debt

The project does not demand that every architectural problem be fixed at once.
It ratchets known debt.

Evidence:

- `ratchets/worldStateAttachmentRatchet.test.mjs` contains a per-file allowance
  map for existing `world[...]` / `ctx.world[...]` state.
- The test scans `src/rules`, counts world-state attachments, and fails when a
  file exceeds its allowance.
- `docs/architecture/RUNTIME_TOPOLOGY_DOCTRINE.md` similarly allows legacy
  array-backed systems temporarily while requiring new/touched systems to move
  toward runtime topology.

Technique: ratchets make incremental agent work possible. They prevent new debt
without requiring a risky whole-codebase rewrite.

## Negative-History Documentation

The project records mistakes and turns them into operating constraints.

Evidence:

- `docs/architecture/TEN_COMMANDMENTS.md` records prior derailments into
  rendering-engine and geometry-kernel work.
- It explicitly warns against flow-state commit-message degradation, one-session
  scope explosion, graphics-first work, and building a second scheduler.

Technique: agents are not just told "what to do"; they are told what failure
looks like. That helps prevent plausible but harmful "improvements."

## Entire Checkpoint Provenance

Entire is an external/local provenance system used by this repo.

Evidence:

- `.agents/skills/using-entire/SKILL.md` tells agents to read recorded intent
  instead of guessing, check `entire status`, find checkpoint trailers, and use
  `entire explain`.
- `.agents/skills/search/SKILL.md` gives a workflow for searching prior
  checkpoints by topic, repo, branch, author, or time window.
- Recent git commits include `Entire-Checkpoint:` trailers.

Technique: agent sessions become durable project memory. Future agents can
recover the prompts, transcripts, and decisions behind changes instead of
inferring intent only from code shape.

## External Agent Toolchain

The repo is not only developed by one agent interface. It sits inside a broader
agentic toolchain.

Observed external tools:

- **Rust Token Killer (`rtk`)**: a local command wrapper that compresses shell
  tool output before it reaches the agent transcript. This matters because large
  repository scans, test runs, and grep output are otherwise token-expensive.
  RTK makes high-frequency CLI inspection more practical.
- **Entire**: checkpoint and chat-history provenance. It was enabled after the
  project had already matured, so it does not explain the whole history, but it
  changes recent work by making agent sessions searchable, explainable, and
  attachable to commits.
- **Reflect-JS**: local stdin MCP for JavaScript reflection. It gives agents
  structure-oriented inspection tools for a JavaScript codebase that deliberately
  lacks TypeScript compiler metadata.
- **Caveman**: external workflow/tooling used with Claude Code. Like RTK and
  Reflect-JS, it is part of the operating environment rather than a project
  dependency.

Technique: the project uses external tooling to make agents cheaper to run,
easier to orient, and less dependent on raw transcript context. This is part of
the agentic development story even when the tools are not checked into the repo.

## Additional Tool Inventory

The agentic development story also includes a wider tool surface. Some of these
tools are agent-specific; others are project production tools that make the
repository easier for agents to inspect, validate, or extend.

Repository CLIs and Deno tasks:

- `deno task test`, `test:fast`, and `test:slow` split runtime verification by
  cost.
- `deno task check`, `guard:architecture`, `guard:events`, `guard:death`,
  `guard:tools`, and `ratchet:world-state` provide named safety rails.
- `deno task audit:events`, `audit:damaged`, `audit:died`, `audit:systems`, and
  `audit:health` expose project state without modifying code.
- `deno task coverage` and `deno task bench` provide coverage and performance
  hooks.
- `.agents/skills/agent-tools/scripts/agent-health.mjs`, `import-boundary-report.mjs`,
  `event-bus-explorer.mjs`, `system-map.mjs`, `agent-target.mjs`, and
  `content-id-audit.mjs` are the main
  agent-facing inspection tools.

Simulation and performance tools:

- `.agents/skills/runtime-tools/scripts/headless-runner.mjs` runs the real rules scheduler and WorldView path
  without browser display code.
- `docs/headless-runtime.md` documents action schedules, seed/class/depth
  options, and reporting.
- `.agents/skills/runtime-tools/scripts/profile-hot-systems.mjs` profiles scheduler phases and individual
  systems under controlled scenarios.
- `tests/perf/*.bench.mjs` gives Deno benchmark entry points.

Browser-local authoring and inspection tools:

- `tools/test-runner.html` runs visual scenarios from `tests/visual/`.
- `tests/visual/_registry.js` catalogs visual scenarios such as chase, scurry,
  gaze stun, proc package scenarios, and spell/proc VFX cases.
- `tools/fx-builder.html` and `tools/jshack_fx_builder.html` are browser FX
  authoring/preview tools.
- `tools/building-designer.html` authors building/prefab layouts and spawn
  parameters.
- `tools/composite-glyph-editor.html` edits composite glyphs.
- `tools/emitter-test.html` exercises audio/visual emitter behavior.
- `tools/help/index.html` is a browser-readable help/inspection surface for
  game data, settings, saves, and death records.

Audio pipeline tools:

- `tools/download-dropbox-audio.mjs` downloads and extracts shared Dropbox audio
  assets.
- `tools/sync-dropbox-audio.sh` wraps audio sync with locking, `git pull`,
  `deno task download:audio`, per-file commits, and push.
- `tools/audio-trim-silence.mjs` shells out to `/usr/bin/ffmpeg` for silence
  trimming.
- `tools/audio-normalize-compress.mjs` shells out to `/usr/bin/ffmpeg` and
  `/usr/bin/ffprobe` for loudness measurement, normalization, compression, and
  duration metadata.
- `tools/audio-manifest.mjs` uses `ffmpeg`/`ffprobe` to generate audio duration,
  loudness, and bitrate metadata.
- `tools/audio-process.mjs` chains trim and normalize/compress passes.
- `tools/audio-utils.mjs` supports manifest/processed-file tracking.

Distribution and packaging tools:

- `packaging/nwjs/wrap.mjs` stages the browser app for NW.js distribution.
- `packaging/nwjs/README.md` documents the boundary: the browser app remains
  canonical, and NW.js is only a containment/distribution shell around
  `index.html`.
- `deno task wrap:nwjs` stages `dist/nwjs/app/` or an unpacked runtime layout.

AI/gameplay training tools:

- `.agents/skills/monster-ai-training/scripts/trainAI.js` trains a tiny neural policy using a deterministic
  `(1 + lambda)` evolution strategy mini-sim.
- `docs/systems/NEURAL_AI.md` documents the neural AI system and training
  direction.

Local agent skills:

- `.agents/skills/add-item`
- `.agents/skills/add-monster`
- `.agents/skills/add-spell`
- `.agents/skills/explain`
- `.agents/skills/recall`
- `.agents/skills/replay`
- `.agents/skills/review`
- `.agents/skills/search`
- `.agents/skills/session-crosslink`
- `.agents/skills/session-handoff`
- `.agents/skills/session-to-skill`
- `.agents/skills/teach`
- `.agents/skills/using-entire`
- `.agents/skills/what-happened`

External/supporting tools and services observed:

- Deno: test runner, task runner, benchmarks, coverage, scripts.
- Browser runtime: primary execution target and authoring surface for visual
  tools.
- `ffmpeg` and `ffprobe`: audio processing and metadata.
- Dropbox: shared audio asset source.
- Git: source control, checkpoint trailers, audio sync commits.
- NW.js: optional desktop wrapper.
- RTK: token-compressing shell proxy for agent tool output.
- Entire: checkpoint/chat-history provenance.
- Reflect-JS: JavaScript reflection MCP.
- Caveman: Claude Code workflow/tooling.
- Codex, Claude Code, and GitHub Copilot: retail LLM agent/copilot products.

Technique: the project is surrounded by tools that reduce agent friction at
several levels: token cost, provenance, reflection, deterministic simulation,
architecture auditing, visual inspection, audio production, packaging, and
task-specific playbooks.

## Multiple Retail LLM Products

At least three LLM retail products have participated in the development workflow:

- **Codex**
- **Claude Code**
- **GitHub Copilot**

Evidence:

- `entire status` reports active Codex sessions.
- `STORY.md` refers to "CC -- Copilot, the AI" entering the commit history and
  describes both its useful speed and its characteristic wrongness.
- The project-owner workflow references Claude Code and Caveman as part of the
  external agent environment.

Technique: the project is not dependent on one model or one agent product. It
uses a multi-agent, multi-interface workflow, with the repository's own
constraints and guardrails acting as the stable center.

## Local Task Skills

The repo contains local agent skills for repeated workflows.

Evidence:

- `.agents/skills/add-monster/SKILL.md` gives step-by-step instructions,
  required monster fields, optional fields, intelligence tiers, available
  callback imports, hook slots, deterministic salt conventions, balance
  guidelines, palette conventions, and test commands.
- The repo also contains local skills for adding items, adding spells, explaining
  code, searching prior work, reviewing, replaying, teaching, handoff, and
  session-to-skill conversion.

Technique: recurring single-author knowledge is converted into callable agent
procedure. The agent does not need to rediscover balance ranges, callback names,
or file placement every time.

## Reflect-JS Deep Reflection MCP

Reflect-JS is a local stdin MCP/tooling technique observed in the development
environment rather than in this repository's source tree.

Observed role:

- It gives agents JavaScript reflection tools for inspecting the project at a
  deeper level than grep alone.
- It can be used to ask structural questions about modules, exports, symbols,
  runtime-shaped objects, and relationships in JavaScript code where TypeScript
  compiler metadata is unavailable.
- Because JSHack is pure JavaScript and pure ES modules, reflection-oriented
  tooling can compensate for some missing static type graph affordances.
- As a local stdin MCP, it can sit near the agent workflow without becoming a
  project dependency or build step.

Technique: use external reflection to recover structure from a dynamic JS
project. This complements repo CLIs: grep and custom scanners find textual
contracts; reflection can inspect code/module structure more directly.

## Agentic Development Stress Test

JSHack is not merely a project that happened to use agents. It was also
conceived, in part, as an agentic development stress test: can agents sustain a
deep, complex, zero-dependency JavaScript roguelike without TypeScript, without a
framework, without a build step, and without committee architecture?

Observed result:

- The result is reasonable, not perfect.
- Agents made the project possible at its current breadth, but they did not make
  judgment optional.
- The successful pattern is not "let the model decide." It is human-owned
  architecture plus agent-executed implementation inside strong constraints.
- The project exposes real weaknesses of agentic development: plausible wrong
  code, test incentives that can preserve stale behavior, environmental
  brittleness, overfitting to green checks, and the need for repeated human
  correction.

Evidence:

- `docs/architecture/MANIFESTO.md` says the agents made the project possible and
  argues that the conventions survived because they were clear enough to
  transmit.
- `README.md` says JSHack is built through agentic development: a human directs
  architecture, taste, constraints, and iteration while AI agents do
  implementation work.
- `STORY.md` describes Copilot/AI as fast and useful, but also as having "a
  specific flavor of wrongness that requires cleanup."
- `CHANGELOG.md` records fixes for AI-introduced mistakes and repeated attempts
  to correct small constants.

Technique: the project treats agentic development as an engineering system with
known failure modes, not as magic. The agent is a throughput multiplier; the
architecture, constraints, and review judgment remain the controlling mechanism.

## Tests As Witnesses, Not Governors

The test suite is a major part of the agentic development story, but it is not
an unqualified good.

Evidence:

- The repository has thousands of Deno tests across focused behavioral,
  architectural, content, UI, audio, and simulation surfaces.
- `docs/architecture/TEN_COMMANDMENTS.md` says tests are the guardrail that keep
  systems honest.
- `AGENTS.md` explicitly warns that red tests can be stale and says failures
  should be classified as real bug, stale expectation, or ambiguous.

Risk:

- A large green suite creates an incentive gradient: satisfy the harness,
  preserve expected behavior, and avoid semantic judgment.
- Tests can drag the project backward when stale expectations freeze old design
  decisions.
- Agentic development amplifies this risk because agents are very good at making
  failing tests pass even when the better move is to update or delete the test.

Technique: use tests as witnesses, not governors. The strongest pattern here is
not "more tests"; it is tests plus doctrine, ratchets, CLI audits, and human
judgment about when a test encodes current intent versus obsolete behavior.

## Vendored ECS Agent Manual

The vendored ECS library has its own agent-facing manual.

Evidence:

- `src/lib/ecs-js/AGENTS.md` says `ecs-js` is written so autonomous agents,
  copilots, and automated operators can understand and control simulations.
- It calls out deterministic core, caller-driven ticks, phase-agnostic scripts,
  pure logic/zero IO, composable helpers, and a step-and-explain workflow.
- It recommends deterministic playgrounds, explicit phase names, focused tests,
  debug inspection, and documented scheduler orderings.

Technique: the underlying engine is selected and documented for agent
inspectability: no hidden loop, no mandatory rendering stack, no build system,
and no async timing inside core simulation.

## No Build Step

JSHack is pure JavaScript and pure ES modules.

Evidence:

- `AGENTS.md` states no build step, no webpack, no Babel, no JSX, no TypeScript,
  no bundling.
- `README.md` describes the codebase as organized for humans, agents, and
  curiosity rather than bundlers.

Technique: agents patch source files directly and run Deno/browser checks
directly. There is no generated artifact graph to misunderstand or stale build
output to chase.

## Focused Test Surface

The repository has a large suite of narrowly named tests.

Evidence:

- `tests/` contains focused files for combat, spells, inventory, movement,
  event doctrine, architecture guards, content DSL, audio wiring, UI layout,
  dungeon generation, polymorph, quests, materials, loot, and more.
- `deno.json` splits `test`, `test:fast`, and `test:slow`.
- `AGENTS.md` gives focused test commands for common surfaces.

Technique: agents can verify a narrow change with a narrow test, then widen to
guardrails. The test names also act as a behavioral index.

## Headless Runtime

The project supports running simulation without the browser display.

Evidence:

- `deno.json` defines a `headless` task that runs the skill-owned
  `runtime-tools/scripts/headless-runner.mjs`.
- `docs/headless-runtime.md` documents the headless runtime.
- The separation manifest says headless tests run against rules with
  deterministic seeds and intent sequences.

Technique: agents can validate simulation behavior without needing visual
inspection or browser automation for every change.

## Architecture Documents As Operational Handoffs

Architecture documents are written as handoffs for future agents and maintainers,
not just as prose essays.

Evidence:

- `docs/architecture/FINAL_STATS_PROC_ARCHITECTURE.md` explicitly says it is an
  operational handoff for future agents and maintainers.
- `docs/architecture/COMPONENT_PHASE_SYSTEM_EVENT_DOCTRINE_REVIEW.md`,
  `DAMAGE_PIPELINE_TECHNICAL_MEMO.md`, `STAT_PIPELINE_TECHNICAL_MEMO.md`,
  `RUNTIME_TOPOLOGY_DOCTRINE.md`, and related docs record doctrine and migration
  targets.

Technique: the docs preserve architectural decisions at the concept level, while
tests/CLIs preserve enforcement at the operational level.

## Human-Owned Architecture, Agent-Executed Detail

The project explicitly describes its development model.

Evidence:

- `README.md` says JSHack is built through agentic development: a human directs
  architecture, taste, constraints, and iteration; AI agents do implementation
  work.
- `docs/architecture/MANIFESTO.md` says agents made the project possible, and
  that deterministic RNG, event-driven ECS discipline, and three-layer
  separation survived because the conventions were clear enough to transmit.

Technique: the project is structured around a split between stable architectural
judgment and high-throughput implementation. The agent succeeds because the
rules are stable, visible, and executable.
