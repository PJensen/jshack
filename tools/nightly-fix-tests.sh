#!/usr/bin/env bash

set -Eeuo pipefail

repo_dir="/home/pjensen/Repos/JSHack"
log_file="/tmp/jshack-nightly-fix-tests.log"
lock_file="/tmp/jshack-codex-daily.lock"

exec 9>"$lock_file"
if ! flock -n 9; then
  printf '%s\n' "nightly test fixer is already running; skipping this invocation" >&2
  exit 0
fi

cd "$repo_dir" || exit 1

exec >>"$log_file" 2>&1

remote="origin"
base_branch="master"
test_command="deno test --allow-read --allow-write --no-check"

if [[ -n "$(git status --porcelain)" ]]; then
  printf '%s\n' "refusing to run with a dirty worktree" >&2
  exit 1
fi

git fetch "$remote" "$base_branch"
git switch "$base_branch"
git merge --ff-only "$remote/$base_branch"

printf '%s\n' "running baseline: $test_command"
baseline_status=0
if deno test --allow-read --allow-write --no-check; then
  baseline_status=0
else
  baseline_status=$?
fi
if (( baseline_status == 0 )); then
  printf '%s\n' "baseline tests already pass; nothing to fix"
  exit 0
fi

/home/pjensen/.local/bin/codex exec \
  --cd "$repo_dir" \
  --approve-for-me \
  "Work on JSHack's failing tests using exactly: deno test --allow-read --allow-write --no-check

The default bias is to repair the tests, fixtures, or test setup because fast-moving features can create natural test drift. Treat all game code under src/ as protected: do not change it merely to make a test pass. Diagnose the actual failure and prefer correcting stale, brittle, or incorrect test code over changing application code. Before changing a test, inspect recent commits, blame, and the relevant implementation history to establish that a recent behavior change plausibly introduced the drift; do not assume a failing test is stale without evidence. A production change is permitted only when the failing test, recent history, and surrounding evidence establish a genuine implementation defect, and only when you add or strengthen a focused regression test for that defect. For every production change, explain the exact failing behavior, the evidence that the implementation is wrong, and why a test-only change would be incorrect. If that evidence is not conclusive, leave production code unchanged and report the failure. Do not hack around failures: never weaken, delete, skip, quarantine, or rewrite assertions merely to make tests pass; never reduce coverage; never introduce nondeterminism; never regress the game code. Only change an assertion when the documented/current intended behavior and recent repository history prove the expectation is stale or incorrect, and preserve or strengthen the invariant being tested.

Before editing, inspect the working tree and preserve all unrelated user changes. Do not reset, checkout, clean, or discard changes. Do not commit or push changes; the outer launcher owns publication. Run the exact test command before and after the fix, plus focused guardrails for touched behavior. If the failure cannot be fixed safely, leave the code unchanged and explain the evidence. Finish with a concise report of the failing tests, root cause, files changed, verification commands, and any remaining failures."

if [[ -z "$(git status --porcelain)" ]]; then
  printf '%s\n' "Codex made no changes; refusing to publish" >&2
  exit 1
fi

git diff --check
printf '%s\n' "running verification: $test_command"
deno test --allow-read --allow-write --no-check

changed_files="$(git diff --name-only)"
if grep -q '^src/' <<<"$changed_files" && ! grep -q '^tests/' <<<"$changed_files"; then
  printf '%s\n' "production code changed without a regression test; refusing to publish" >&2
  exit 1
fi

git add -A
commit_message="test: repair nightly test drift"
if grep -q '^src/' <<<"$changed_files"; then
  commit_message="fix: repair nightly test drift"
fi
git commit -m "$commit_message"
git push "$remote" "$base_branch"
git pull --ff-only "$remote" "$base_branch"
