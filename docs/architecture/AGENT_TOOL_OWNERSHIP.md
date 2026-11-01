# Agent tool ownership

This is the checked-in inventory for every entry under `tools/`. It records
the canonical implementation, active consumers, and the smallest verification
recipe. Paths in the disposition column are authoritative; no executable
copies remain at the old locations.

| Entry | Owner / disposition | Active consumers | Risk / verification |
| --- | --- | --- | --- |
| `agent-health.mjs` | `agent-tools/scripts/` moved | `guard:architecture`, `audit:health`, AGENTS | read-only scan; `deno task check` |
| `agent-target.mjs` | `agent-tools/scripts/` moved | agent-tools, tests | read-only search; `tests/agentTools.test.mjs` |
| `content-id-audit.mjs` | `agent-tools/scripts/` moved | agent-tools, AGENTS | read-only content trace; agent-tools tests |
| `event-bus-explorer.mjs` | `agent-tools/scripts/` moved | guard/audit tasks, docs, AGENTS | report output only with `--out`; guard:events |
| `import-boundary-report.mjs` | `agent-tools/scripts/` moved | `guard:architecture`, agent-tools | read-only import scan; `deno task check` |
| `system-map.mjs` | `agent-tools/scripts/` moved | guard/audit tasks, AGENTS | read-only scheduler scan; `guard:tools` |
| `headless-runner.mjs` | `runtime-tools/scripts/` moved | `headless` task, runtime-tools | real scheduler/content imports; bounded seeded run |
| `agent-player.mjs` | `runtime-tools/scripts/` moved | `agent:play` task, `AGENT_PLAY.md` | JSONL and trace contract; bounded bridge smoke |
| `profile-hot-systems.mjs` | `runtime-tools/scripts/` moved | runtime-tools | diagnostic timings; bounded profile |
| `tick-lifetime-benchmark.mjs` | `runtime-tools/scripts/` moved | runtime-tools | diagnostic benchmark; bounded ticks |
| `AGENT_PLAY.md` | `runtime-tools/` moved | runtime-tools, agent users | protocol documentation; agent-player smoke |
| `trainAI.js` | `monster-ai-training/scripts/` moved | neural-AI docs, skill users | can mutate only with `--out`; `deno check` plus bounded seeded smoke |
| `audio-manifest.mjs` | retained general audio tooling | audio tasks/process docs | ffmpeg/asset lifecycle; not agent-facing |
| `audio-normalize-compress.mjs` | retained general audio tooling | audio processing | ffmpeg asset transformation; not agent-facing |
| `audio-process.mjs` | retained general audio tooling | audio workflow | composes audio transforms; not agent-facing |
| `audio-trim-silence.mjs` | retained general audio tooling | `audio:trim-silence` | ffmpeg asset transformation; not agent-facing |
| `audio-utils.mjs` | retained shared audio library | retained audio scripts | shared implementation for audio lifecycle |
| `download-dropbox-audio.mjs` | retained external asset tooling | `download:audio`, sync script | network/Dropbox asset lifecycle; not agent-facing |
| `sync-dropbox-audio.sh` | retained external asset tooling | maintainers | git/network/audio lifecycle; not agent-facing |
| `building-designer.html` | retained browser authoring tool | manual browser users | standalone UI; not deterministic agent utility |
| `composite-glyph-editor.html` | retained browser authoring tool | manual browser users | standalone UI; not deterministic agent utility |
| `emitter-test.html` | retained browser diagnostics | manual browser users | browser/audio-visual harness; not agent-facing |
| `fx-builder.html` | retained browser authoring tool | manual browser users | standalone UI; not deterministic agent utility |
| `jshack_fx_builder.html` | retained browser authoring tool | manual browser users | standalone UI; not deterministic agent utility |
| `lighting-engine-work.html` | retained browser diagnostics | manual browser users | standalone UI; not deterministic agent utility |
| `test-runner.html` | retained browser test harness | visual test users | browser visual scenarios; not agent-facing |
| `FX_INTERFACE.md` | retained browser-tool reference | FX tools | documentation for browser tooling; no skill owner |
| `help/index.html` | retained browser help surface | manual browser users | browser-readable help; no skill owner |
| `greenlight/README.md` | retained developer/app tooling | greenlight workflow | independent developer lifecycle |
| `greenlight/launch.sh` | retained developer/app tooling | greenlight workflow | independent developer lifecycle |

The only compatibility surface preserved is the stable `deno task` name and
arguments. Tests and active documentation import or invoke the new canonical
paths; no forwarding shim was needed because the old paths had no independent
runtime consumer.

## Capability hand-offs

Use `agent-tools` to establish canonical IDs, events, scheduler placement, and
architecture boundaries. Use `runtime-tools` to prove an observable seeded
state transition through the real runtime. Use `monster-ai-training` only for
bounded, reproducible proxy training; adopting generated weights is a separate
approved change. General audio, browser, packaging, and developer tools stay
outside `.agents/` because they have independent lifecycles and audiences.
