#!/usr/bin/env bash

set -u

repo_dir="/home/pjensen/Repos/JSHack"
log_file="/tmp/jshack-nightly-fix-tests.log"
lock_file="/tmp/jshack-codex-daily.lock"

exec 9>"$lock_file"
if ! flock -n 9; then
  printf '%s\n' "nightly test fixer is already running; skipping this invocation" >&2
  exit 0
fi

cd "$repo_dir" || exit 1

exec /home/pjensen/.local/bin/codex exec \
  --cd "$repo_dir" \
  --sandbox workspace-write \
  --approve-for-me \
  "Work on JSHack's failing tests using exactly: deno test --allow-read --allow-write --no-check

The default bias is to repair the tests, fixtures, or test setup because fast-moving features can create natural test drift. Diagnose the actual failure and prefer correcting stale, brittle, or incorrect test code over changing application code. Before changing a test, inspect recent commits, blame, and the relevant implementation history to establish that a recent behavior change plausibly introduced the drift; do not assume a failing test is stale without evidence. However, production code may and should be fixed when the failing test, recent history, and surrounding evidence establish a genuine implementation defect; do not leave a real product bug in place merely to preserve the current code. For every production change, explain the supporting fact pattern and why a test-only change would be wrong. Do not hack around failures: never weaken, delete, skip, quarantine, or rewrite assertions merely to make tests pass; never reduce coverage; never introduce nondeterminism; never regress the game code. Only change an assertion when the documented/current intended behavior and recent repository history prove the expectation is stale or incorrect, and preserve or strengthen the invariant being tested.

Before editing, inspect the working tree and preserve all unrelated user changes. Do not reset, checkout, clean, or discard changes. Do not commit changes. Run the exact test command before and after the fix, plus focused guardrails for touched behavior. If the failure cannot be fixed safely, leave the code unchanged and explain the evidence. Finish with a concise report of the failing tests, root cause, files changed, verification commands, and any remaining failures." \
  >>"$log_file" 2>&1
