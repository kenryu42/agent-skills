#!/usr/bin/env bash

set -eu

TEST_DIR=$(cd -P "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)
REPO_ROOT=$(cd -P "$TEST_DIR/.." >/dev/null 2>&1 && pwd)
SKILL="$REPO_ROOT/skills/test-coverage-improver/SKILL.md"
INTERFACE="$REPO_ROOT/skills/test-coverage-improver/agents/openai.yaml"
README="$REPO_ROOT/README.md"

assert_contains() {
	local file="$1"
	local text="$2"

	grep -Fq -- "$text" "$file" || {
		printf 'FAIL: %s does not contain: %s\n' "$file" "$text" >&2
		exit 1
	}
}

assert_not_contains() {
	local file="$1"
	local text="$2"

	if grep -Fq -- "$text" "$file"; then
		printf 'FAIL: %s still contains: %s\n' "$file" "$text" >&2
		exit 1
	fi
}

assert_contains "$SKILL" 'Create or continue a goal'
assert_contains "$SKILL" '`create_goal`'
assert_contains "$SKILL" '`update_goal`'
assert_contains "$SKILL" 'no quick wins remain'
assert_contains "$SKILL" 'Do not add or expand mocks, stubs, or fakes.'
assert_contains "$SKILL" 'Added tests'
assert_contains "$SKILL" 'Deferred opportunities'
assert_not_contains "$SKILL" 'Ask the user for approval to implement the proposed tests'
assert_not_contains "$SKILL" 'confirming with the user before changing code'
assert_not_contains "$INTERFACE" 'after approval'
assert_not_contains "$README" 'confirms with the user before writing tests'

printf 'Test coverage improver contract passed.\n'
