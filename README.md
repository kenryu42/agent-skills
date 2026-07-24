# Agents

Personal Codex agent skills and shared references.

## Skill manager

Use the interactive skill manager to install or uninstall skills for one or more coding CLIs.

Requirements:

- Bash 3.2 or newer
- [`fzf`](https://github.com/junegunn/fzf)

Run it from this repository:

```sh
./bin/agent-skills
```

To make `agent-skills` available without changing into this repository, link it into `~/.local/bin`:

```sh
./bin/agent-skills --install-command
```

The manager supports these CLI-specific skill directories:

| CLI | Skills directory |
| --- | --- |
| Codex | `${CODEX_HOME:-$HOME/.codex}/skills` |
| Claude Code | `$HOME/.claude/skills` |
| Pi | `$HOME/.pi/agent/skills` |
| OpenCode | `$HOME/.config/opencode/skills` |
| Amp Code | `$HOME/.config/amp/skills` |

The manager never overwrites an occupied destination. Uninstall only removes symlinks that resolve to a skill in this repository. Because installed skills are symlinks, pulling changes into this repository updates them without a separate update command.

Run the manager tests with:

```sh
./tests/test-agent-skills.sh
```

## Skills

### `atomic-commit`

Creates atomic git commits with clear scope.

### `autoreview`

Runs a second-model code review using Codex (`gpt-5.6-sol`) by default, with optional Claude (`claude-fable-5`) review. Pair with `behavior-validator` for user-visible behavior checks.

### `codex-first`

Delegates substantial implementation, fixing, code exploration, rebasing, and PR landing to Codex CLI while Claude handles design, decisions, review, and verification.

### `codex-security`

Runs Codex Security scan, diff-scan, deep-scan, finding-fix, and phase workflows for repository-wide or scoped-path security reviews.

### `commit-with-context`

Creates coherent Conventional Commits with concise, high-signal context. Scopes the commit from the staged index and avoids splitting one task into artificial micro-commits.

### `frontend-design`

Builds distinctive, production-grade frontend interfaces with high design quality. Generates creative, polished code that avoids generic AI aesthetics.

### `grill-me`

Stress-tests plans and designs through relentless direct questioning until reaching shared understanding across every branch of the decision tree.

### `improve`

Surveys any codebase as a senior advisor and produces prioritized, self-contained implementation plans for other models/agents to execute. Strictly read-only on source code — never implements, fixes, or refactors anything itself.

### `repo-explorer`

Clones and inspects external repositories in a reusable local exploration cache (`~/.explore/repos`) without cluttering the active workspace.

### `runtime-review`

Diagnoses runtime CPU spikes, memory growth, heap leaks, GC pressure, and OOM crashes with code-first triage, guided profiling, and before/after verification.

### `sponsor-miner`

Finds and verifies potential sponsors for a GitHub repository by mining README sponsorship placements. Outputs a `verified-leads.csv` for outreach planning.

### `sqlite-expert`

SQLite database optimization, query writing, indexing, and best practices specialist. Proactively analyzes and optimizes SQLite databases for performance and reliability.

### `test-coverage-improver`

Runs coverage suites, identifies low-coverage files, proposes high-impact tests, and confirms with the user before writing tests.

### `thermo-nuclear-code-quality-review`

Runs an extremely strict maintainability review focused on abstraction quality, complexity, large-file risk, and spaghetti-condition growth.

### `ultra`

Runs a manual multi-agent build workflow: scope and design on Fable, exploration on Sonnet, implementation on Opus, then review via autoreview with Fable judging and applying fixes.
