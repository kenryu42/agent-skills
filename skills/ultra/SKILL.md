---
name: ultra
description: Manual multi-agent build workflow — Fable owns judgment (plan, investigate, design, review, decide), Opus owns execution (implement, fix, validate); a Fable planner designs a task-specific stage plan, then a Fable review + Opus fix loop closes it out.
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

3. When the workflow completes, read its result and report: the plan summary, the acceptance criteria, work items implemented, the final review verdict, and any findings that remain unfixed. If the workflow ends with verdict `needs-fixes` after its fix rounds, say so plainly and list the outstanding findings — do not soften the outcome.

## Notes

- The workflow's phases are dynamic: a Fable planner designs the stage plan per task (which stages exist, how many agents each fans out), so do not pre-decide stage structure or counts in the task text. A review+fix loop always runs at the end regardless of the plan.
- Model assignment is fixed inside the script's role table and splits by responsibility: Fable owns judgment (planner, investigate, design, review, decisions on escalations), Opus owns execution (implement, fix). The planner picks roles, never models. Do not override them.
- An implementer that hits a decision the plan does not cover escalates it: a Fable decision agent resolves the question and the implementer continues. This is not a failure.
- The workflow fails fast: it throws if a critical agent dies, an implementer reports a genuine block (missing tooling or credentials), or an item still needs a decision after two escalations. Report the error and what completed; once the blocker is resolved, resume with `Workflow({scriptPath, resumeFromRunId})` so finished agents replay from cache.
