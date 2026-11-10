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

Treat the tests and the repository architecture rules as contracts. Diagnose the actual failure and fix the underlying production code or test infrastructure when that is the correct cause. Do not hack around failures: never weaken, delete, skip, quarantine, or rewrite assertions merely to make tests pass; never reduce coverage; never introduce nondeterminism; never regress existing behavior. Only change a test when you can demonstrate that its expectation is objectively stale or incorrect relative to the documented intended behavior, and in that case preserve or strengthen the invariant being tested.

Before editing, inspect the working tree and preserve all unrelated user changes. Do not reset, checkout, clean, or discard changes. Do not commit changes. Run the exact test command before and after the fix, plus focused guardrails for touched behavior. If the failure cannot be fixed safely, leave the code unchanged and explain the evidence. Finish with a concise report of the failing tests, root cause, files changed, verification commands, and any remaining failures." \
  >>"$log_file" 2>&1
