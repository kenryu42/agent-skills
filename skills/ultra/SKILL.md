---
name: ultra
description: Manual multi-agent build workflow — scope & design (Fable), explore (Sonnet), implement (Opus), review via autoreview with Fable judging and writing fixes.
disable-model-invocation: true
---

# /ultra — plan, build, and review with role-assigned models

Run the user's multi-agent build workflow on the task given in the arguments. This command is the user's explicit opt-in to multi-agent orchestration.

## Steps

1. Assemble the task description. Start from `$ARGUMENTS`. If this conversation already established relevant verified facts (investigation findings, reproduced behavior, confirmed commands, design decisions), append them verbatim to the task — later agents cannot see this conversation, so anything not in the task text is lost. If `$ARGUMENTS` is empty and no task is evident from the conversation, ask the user what to build instead of guessing.

2. Invoke the workflow:

   ```
   Workflow({
     scriptPath: "/Users/kenryu/.claude/skills/ultra/workflow.js",
     args: { task: "<assembled task text>" }
   })
   ```

   Do not rewrite or inline the script; always use `scriptPath` so the user's single canonical copy runs.

3. When the workflow completes, read its result and report: the plan summary, work items implemented, the final review verdict, and any findings that remain unfixed. If the workflow ends with verdict `needs-fixes` after its fix rounds, say so plainly and list the outstanding findings — do not soften the outcome.

## Notes

- The workflow itself decides how many explorers and implementers to spawn based on task complexity; do not pre-decide counts in the task text.
- Model roles are fixed inside the script (Scope/Design/Review-judge/Fix: Fable; Explore: Sonnet; Implement: Opus). Do not override them.
