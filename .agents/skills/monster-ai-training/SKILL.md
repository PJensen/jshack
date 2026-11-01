---
name: monster-ai-training
description: Run bounded, seeded mini-simulation training for JSHack tactical and caster monster neural policies.
argument-hint: <tier-and-training-parameters>
---

This skill owns `scripts/trainAI.js`, a seeded `(1+lambda)` evolution-strategy
trainer. It trains a simplified mini-simulation policy, not the real ECS
scheduler, so fitness is a proxy and is not evidence of real-game AI quality.

Tactical policies are for intelligence 7–8 melee-dominant monsters; caster
policies are for intelligence 9–10 spell-dominant monsters. The model consumes
the shared policy feature vector and emits movement, wait, ranged, and spell
actions. Runtime inference is in `src/rules/ai/tinyMLP.js` and
`policyAction.js`; committed policy data is in `src/rules/data/aiWeights.js`.

Run from the repository root. Parameters are `--tier tactical|caster`,
`--gens`, `--lambda`, `--sigma`, `--trials`, `--turns`, and `--seed`; `--out`
optionally patches a weights file. There is no safe early `--help` exit, so do
not use it as a smoke test. Use a bounded, non-mutating invocation:

```bash
deno check .agents/skills/monster-ai-training/scripts/trainAI.js
deno run --allow-read .agents/skills/monster-ai-training/scripts/trainAI.js \
  --gens 1 --lambda 1 --trials 1 --turns 4 --seed 42
```

The bounded output should be reproducible for the same seed and parameters.
Never use `--out` during a smoke test. Weight adoption is an explicitly
approved separate change; do not modify `aiWeights.js` as part of tool work.

For a candidate, record baseline and candidate training/test seeds, use held-out
or comparable seeds, then observe the resulting policy in the real game through
`runtime-tools`. Define regression criteria before adoption: reproducibility,
fitness comparison, action distribution, and real-game behavior all matter.
Training fitness alone does not validate the model.
