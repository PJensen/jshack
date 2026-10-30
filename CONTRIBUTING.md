# Contributing to JSHack

JSHack is a solo project, but I'm open to pull requests that move it forward — if
they respect the principles it's built on. If you're unsure whether something fits,
open an issue first and let's talk about it.

---

## Before You Start

Please read these two documents, hard lessons were learned:

- **[TEN_COMMANDMENTS.md](docs/arch/TEN_COMMANDMENTS.md)** — The project constraints. These are hard rules.
- **[SEPARATION_MANIFEST.md](docs/arch/SEPARATION_MANIFEST.md)** — The layer boundaries between rules and display.

If your change violates either of these, it won't be merged.

Specifically, PRs that do any of the following will be declined:

- Add npm, webpack, babel, or any build tooling
- Add TypeScript or a framework
- Mix the rules and display layers
- Break determinism (same seed must produce same results)
- Introduce Node dependencies (Deno only)
- Large refactors without prior discussion

## What I'm Likely to Accept

- A new monster, item, or spell with tests
- A bug fix with a regression test
- A new system that follows the ECS pattern and registers cleanly
- Improvements to mobile/touch controls
- Better dungeon generation

## Architecture

JSHack is built on an **Entity-Component-System** architecture. Entities are IDs,
components are plain data objects, and systems are functions that query and transform
them. The ECS library is [ecs-js](https://github.com/PJensen/ECS-js) (vendored in
`src/lib/ecs-js/`). If you're new to ECS, the [README](README.md#-ecs-architecture-you-can-actually-see)
walks through the basics and the source is designed to be readable.

## Setting Up

```bash
git clone https://github.com/PJensen/JSHack.git
cd JSHack
open index.html
```

No `npm install`. No build step. Edit a file, refresh your browser.

## Running Tests

Tests run on **Deno**, not Node:

```bash
deno test --allow-read tests/
```

If your change touches game logic, it needs a test.

## Commit Messages

Commit messages must be lowercase and use a conventional type prefix, such as
`feat:`, `docs:`, `fix:`, `arch:`, `refactor:`, `test:`, `perf:`, `ci:`, or
`chore:`.

## Submitting a PR

1. Fork the repo and create a branch
2. Make your changes — keep them focused and small
3. Run the tests and play the game to make sure nothing broke
4. Open a PR with a clear description of what and why

No PR template or checklist. Just be clear about what you did and why it matters.

## License

JSHack is licensed under the **Human-Scale Source License (HSSL) v1.2**. This is
**not** an open-source license as defined by the OSI. It's source-available, intended
for individuals, students, researchers, and small organizations. By submitting a PR,
you agree that your contribution falls under the same license terms. Please read
[LICENSE](LICENSE) if you haven't already.

## Expectations

This is a hobby project built for fun. Response times on issues and PRs will vary.
Sometimes good code just doesn't fit the direction of the project, and that's not a
reflection on the contributor. If a PR is declined, I'll explain why.

The goal is to keep JSHack small, hackable, and fun. Contributions that serve that
goal are genuinely appreciated.
