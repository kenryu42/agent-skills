---
name: atomic-commit
description: Create atomic git commits
disable-model-invocation: true
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

Based on the above changes, create atomic git commits.

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/) format:

- `feat:` - new feature
- `fix:` - bug fix
- `chore:` - maintenance tasks
- `docs:` - documentation changes
- `refactor:` - code refactoring
- `test:` - adding or updating tests

**Rule: Enforce Atomic Git Commits**

- **Single Responsibility:** Each commit must document a single, complete unit of work. Do not combine unrelated changes (e.g., feature implementation mixed with whitespace fixes or refactoring) into a single commit.
- **Revertibility:** A commit is considered atomic only if it can be reverted without causing regressions or removing unrelated legitimate work.
- **Granularity:** Break large tasks into smaller, manageable chunks. There is no "too many commits" limit; prioritize isolation of changes over history brevity.
- **Message Format:** Write meaningful, descriptive commit messages using the present tense (e.g., "Fix login bug" rather than "Fixed login bug"). Mention the specific component changed and reference issue numbers where applicable.

Stage and create the commit using a single message. Do not use any other tools or do anything else.
Do not send any other text or messages besides these tool calls.
