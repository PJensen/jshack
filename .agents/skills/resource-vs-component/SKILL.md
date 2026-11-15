---
name: resource-vs-component
description: Choose between an ecs-js resource and component for JSHack runtime or simulation state, especially when migrating ephemeral per-world state.
---

# Resource versus component

Use this guide when deciding where ECS state belongs or when moving state out
of an entity component.

## Decision boundary

Use a component when the value is an entity-owned simulation fact:

- systems need to query it by entity;
- it describes the entity's current durable state, identity, capability, or
  inspectable condition;
- it should participate in entity snapshots, save/load, replay, or agent
  inspection;
- its lifetime should follow the entity automatically.

Use an `ecs-js` world resource when the value is world-local runtime machinery:

- queues, caches, bridges, registries, or other infrastructure;
- transient history or bookkeeping that is not part of the character/world
  model;
- state that should reset with the world and not be serialized by default;
- data that is naturally keyed inside one world-local value rather than
  queried as entity composition.

Do not replace either with `world[...]` properties. Resources provide the
named, lifecycle-aware alternative for world-scoped runtime state.

## JSHack example: crit bags

Crit-bag history belongs in a resource, not on `Equipment`, a stats component,
or a dedicated actor component. It records previous physical/spell draws; it
does not describe the actor's stats or an enduring character fact.

The established shape is:

```js
export const CritRandomizerResource = defineWorldResource(
  "jshack:critRandomizer",
  {
    create: () => new Map(),
    reset: (state) => state.clear(),
  },
);
```

The map may be keyed by actor ID while the resource remains world-local. Keep
the physical and spell channels separate inside each actor's runtime state.
Use `world.resource(CritRandomizerResource)` to access it; do not attach a
component as a convenience fallback.

## Migration checklist

When moving ephemeral state from a component:

1. Define a named resource under `src/rules/resources/` with lazy creation and
   an explicit reset policy.
2. Replace all `world.get/add/set` access with resource access while preserving
   behavior and deterministic RNG inputs.
3. Remove the component definition and its barrel export once compatibility
   retention is not required.
4. Verify the resource is non-serializable unless persistence is explicitly
   intended.
5. Test the behavior, resource contents, reset/lifecycle semantics, and that
   no entity receives the former component.
6. Run focused gameplay tests, `deno check`, and `deno task guard:architecture`.

If the state must survive save/load, be queried as entity composition, or be
meaningfully inspected as part of the simulation model, stop and use a
component (or an explicit singleton component for durable world-scoped state)
instead.
