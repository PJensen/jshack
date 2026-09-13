# Playing JSHack through the agent bridge

`agent-player.mjs` exposes one JSON object per line on stdout and accepts one
JSON action per line on stdin. It is intentionally turn-based: a successful
gameplay action returns a fresh observation after the rules scheduler resolves
that turn.

```bash
deno run --allow-read tools/agent-player.mjs --seed 12648430 --class outlaw
```

The first response is a `ready` object. Each later response is either:

- `result`, containing `before`, `after`, and `observation`;
- `observation`, for a read-only observation request; or
- `error`, if the input was not a valid command.

Send an action directly or wrap it in an `action` property:

```json
{"type":"rules.move","payload":{"dx":1,"dy":0}}
{"action":{"type":"rules.attackDirection","payload":{"dx":0,"dy":1}}}
```

The observation is JSON-safe and includes a bounded explored/visible tile map,
visible entities and interactables, player vitals, effects, inventory,
equipment, learned spells, and `suggestedActions`. Entity IDs in the
observation are the IDs expected by pickup, equipment, spell, and interaction
actions. Send `{"type":"observe"}` to refresh without taking a turn, or
`{"type":"quit"}` to stop the bridge.
