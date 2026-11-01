---
name: runtime-tools
description: Use JSHack's deterministic headless runtime, agent bridge, profiling, and benchmark tools to prove gameplay behavior and measure runtime performance.
argument-hint: <scenario-or-measurement>
---

Use this skill when static inspection is not enough and a task needs a seeded
simulation, agent-observable gameplay, scheduler profiling, or a performance
regression check.

## Choose the runtime surface

| Need | Tool or task | Command |
| --- | --- | --- |
| Simulate the real scheduler and WorldView | `headless-runner` | `deno task headless --seed 12648430 --turns 100 --report-every 25` |
| Replay a deterministic action schedule | `headless-runner` | `deno task headless --actions-file path/to/actions.json` |
| Play through the JSONL agent contract | `agent-player` | `deno task agent:play --seed 12648430 --class outlaw` |
| Resume or inspect an agent trace | `agent-player` | `deno task agent:play --resume traces/agent-last-run.json` |
| Find hot scheduler phases/systems | `profile-hot-systems` | `deno run --no-check --allow-read tools/profile-hot-systems.mjs --scenario live_wait --ticks 120` |
| Measure deferred-command growth | `tick-lifetime-benchmark` | `deno run --allow-read tools/tick-lifetime-benchmark.mjs --ticks 3000` |
| Run stable performance baselines | Deno benchmarks | `deno task bench` |

## Evidence workflow

1. Start with a fixed seed and a short run that isolates the behavior.
2. Prefer an action schedule or recorded JSONL trace over undocumented manual
   input so the scenario can be replayed.
3. Confirm the result through the rules/runtime observation, not only logs or
   display output.
4. Extend the smallest focused test or fixture when a behavior is proven.
5. For performance work, compare the same seed, scenario, tick count, and
   warmup settings before and after the change; report averages and tail values.

## Contracts and constraints

- `headless-runner` uses the real scheduler and `buildWorldView` path without
  browser display code; actions go through `makeRulesDispatcher`.
- `agent-player` is turn-based and returns bounded JSON-safe observations. Use
  entity IDs from the current observation and preserve traces when debugging.
- Keep simulation inputs deterministic: explicit seeds, fixed action order, and
  no wall-clock or random external dependencies in rules code.
- Do not treat a successful process exit as gameplay proof. Record the observed
  state transition, reachable action, or invariant that matters.
- Profilers and benchmarks are diagnostic tools; do not “fix” a number by
  changing the scenario or weakening the measurement.

## Related references

- `docs/headless-runtime.md` — headless options and action schedules.
- `tools/AGENT_PLAY.md` — JSONL bridge protocol and trace replay.
- `tests/perf/` — benchmark scenarios.
- `deno task test:fast` — focused broad runtime coverage.

