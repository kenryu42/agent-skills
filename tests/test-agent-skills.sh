#!/usr/bin/env bash

set -u
set -o pipefail

TEST_DIR=$(cd -P "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd) || exit 1
REPO_ROOT=$(cd -P "$TEST_DIR/.." >/dev/null 2>&1 && pwd) || exit 1
SCRIPT="$REPO_ROOT/bin/agent-skills"
FIXTURES="$TEST_DIR/fixtures"
TEST_TMP_PARENT=${TMPDIR:-/tmp}
TEST_TMP_PARENT=${TEST_TMP_PARENT%/}
TEST_TMP=$(mktemp -d "$TEST_TMP_PARENT/agent-skills-test.XXXXXX") || exit 1
TEST_HOME="$TEST_TMP/home"
TEST_CODEX_HOME="$TEST_TMP/codex-home"
TEST_PATH="$FIXTURES:$PATH"

cleanup() {
	case "$TEST_TMP" in
	"$TEST_TMP_PARENT"/agent-skills-test.*) rm -rf -- "$TEST_TMP" ;;
	esac
}
trap cleanup EXIT

fail() {
	printf 'FAIL: %s\n' "$1" >&2
	exit 1
}

assert_not_exists() {
	if [ -e "$1" ] || [ -L "$1" ]; then
		fail "expected path to be absent: $1"
	fi
}

assert_directory() {
	[ -d "$1" ] && [ ! -L "$1" ] || fail "expected a real directory: $1"
}

assert_managed_link() {
	local destination="$1"
	local source="$2"
	local resolved_destination
	local resolved_source

	[ -L "$destination" ] || fail "expected a symlink: $destination"
	resolved_destination=$(cd -P "$destination" >/dev/null 2>&1 && pwd) || fail "unable to resolve $destination"
	resolved_source=$(cd -P "$source" >/dev/null 2>&1 && pwd) || fail "unable to resolve $source"
	[ "$resolved_destination" = "$resolved_source" ] || fail "unexpected target for $destination"
}

assert_link_target() {
	local destination="$1"
	local source="$2"

	[ -L "$destination" ] || fail "expected a symlink: $destination"
	[ "$(readlink "$destination")" = "$source" ] || fail "unexpected target for $destination"
}

run_interactive() {
	local action="$1"
	local clis="$2"
	local skills="$3"

	printf 'y\n' |
		env \
			HOME="$TEST_HOME" \
			CODEX_HOME="$TEST_CODEX_HOME" \
			PATH="$TEST_PATH" \
			FZF_TEST_ACTION="$action" \
			FZF_TEST_CLIS="$clis" \
			FZF_TEST_SKILLS="$skills" \
			"$SCRIPT"
}

mkdir -p "$TEST_HOME"

help_output=$(HOME="$TEST_HOME" "$SCRIPT" --help) || fail "--help failed"
case "$help_output" in
*"--install-command"*) ;;
*) fail "--help did not document --install-command" ;;
esac

HOME="$TEST_HOME" "$SCRIPT" --install-command >/dev/null || fail "command installation failed"
assert_link_target "$TEST_HOME/.local/bin/agent-skills" "$SCRIPT"
HOME="$TEST_HOME" "$SCRIPT" --install-command >/dev/null || fail "idempotent command installation failed"

install_output=$(run_interactive install 'codex,claude,pi,opencode,amp' atomic-commit) ||
	fail "skill installation failed"
case "$install_output" in
*"Created 5 symlink(s)."*) ;;
*) fail "unexpected install summary" ;;
esac

assert_managed_link "$TEST_CODEX_HOME/skills/atomic-commit" "$REPO_ROOT/skills/atomic-commit"
assert_managed_link "$TEST_HOME/.claude/skills/atomic-commit" "$REPO_ROOT/skills/atomic-commit"
assert_managed_link "$TEST_HOME/.pi/agent/skills/atomic-commit" "$REPO_ROOT/skills/atomic-commit"
assert_managed_link "$TEST_HOME/.config/opencode/skills/atomic-commit" "$REPO_ROOT/skills/atomic-commit"
assert_managed_link "$TEST_HOME/.config/amp/skills/atomic-commit" "$REPO_ROOT/skills/atomic-commit"

installed_output=$(run_interactive install 'codex,claude,pi,opencode,amp' atomic-commit) ||
	fail "installed-skill filtering failed"
case "$installed_output" in
"") ;;
*) fail "an installed skill remained selectable or cancellation produced output" ;;
esac

uninstall_output=$(run_interactive uninstall 'claude,pi' atomic-commit) ||
	fail "skill uninstall failed"
case "$uninstall_output" in
*"Removed 2 symlink(s)."*) ;;
*) fail "unexpected uninstall summary" ;;
esac

assert_not_exists "$TEST_HOME/.claude/skills/atomic-commit"
assert_not_exists "$TEST_HOME/.pi/agent/skills/atomic-commit"
assert_managed_link "$TEST_CODEX_HOME/skills/atomic-commit" "$REPO_ROOT/skills/atomic-commit"
assert_managed_link "$TEST_HOME/.config/opencode/skills/atomic-commit" "$REPO_ROOT/skills/atomic-commit"
assert_managed_link "$TEST_HOME/.config/amp/skills/atomic-commit" "$REPO_ROOT/skills/atomic-commit"

mkdir -p "$TEST_HOME/.pi/agent/skills/autoreview"
conflict_output=$(run_interactive install 'codex,pi' autoreview) ||
	fail "partial conflict installation failed"
case "$conflict_output" in
*"Created 1 symlink(s)."*) ;;
*) fail "unexpected partial conflict summary" ;;
esac

assert_managed_link "$TEST_CODEX_HOME/skills/autoreview" "$REPO_ROOT/skills/autoreview"
assert_directory "$TEST_HOME/.pi/agent/skills/autoreview"

run_interactive uninstall 'codex,pi' autoreview >/dev/null ||
	fail "partial conflict uninstall failed"
assert_not_exists "$TEST_CODEX_HOME/skills/autoreview"
assert_directory "$TEST_HOME/.pi/agent/skills/autoreview"

mkdir -p "$TEST_TMP/foreign-skill"
mkdir -p "$TEST_HOME/.config/amp/skills"
ln -s "$TEST_TMP/foreign-skill" "$TEST_HOME/.config/amp/skills/frontend-design"
run_interactive uninstall amp frontend-design >/dev/null ||
	fail "foreign-link uninstall check failed"
assert_managed_link "$TEST_HOME/.config/amp/skills/frontend-design" "$TEST_TMP/foreign-skill"

printf 'All agent-skills tests passed.\n'
