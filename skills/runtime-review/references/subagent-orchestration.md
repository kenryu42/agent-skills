# Subagent Orchestration

Use this when runtime review work can be split into independent, auditable passes. This borrows the `codex-security` pattern: the parent owns routing, artifacts, reconciliation, and final judgment; workers own bounded evidence collection or analysis.

## Preconditions

- Use subagents only when the user has explicitly authorized delegated or parallel agent work, or the current request already asks for subagent orchestration.
- If subagents are unavailable, do not claim the orchestrated workflow ran. Continue locally and note the limitation.
- Give every worker explicit ownership and output expectations.
- Do not let workers edit source unless the parent has assigned a disjoint fix scope.

## Worker Types

- Code-surface reviewer: owns one route, job, package, or small file shard; returns exact CPU/memory anti-pattern suspects with file/line evidence.
- CPU profile analyst: owns one CPU profile or OS sample; returns ranked stacks, source mapping, likely root cause, and counterevidence.
- Memory profile analyst: owns one heap snapshot/profile pair or leak family; returns retained-growth evidence, retaining paths, and likely lifetime bug.
- Fix verifier: owns before/after evidence for one candidate fix; returns metric deltas and residual risks.

## Parent Responsibilities

- Resolve the runtime, symptom class, artifacts directory, and capture plan.
- Dispatch workers with the minimum context needed: symptom, runtime, relevant files/artifacts, and exact output path or return format.
- Reconcile workers semantically, not by title similarity.
- Rank issues by measured impact first, then confidence, blast radius, and fix effort.
- Preserve disagreement or weak evidence in the final report instead of smoothing it away.

## Handoff Template

```text
Run a runtime-review worker pass for this assigned scope only.

Symptom:
Runtime and version:
Assigned files or profile artifact:
Relevant commands or reproduction notes:
Artifact/output path:

Return:
- exact evidence reviewed
- top suspected issue(s), with file/line or stack evidence
- confidence and counterevidence
- proposed next evidence or fix

Do not edit source files unless explicitly assigned a fix scope.
```

## Reconciliation Rules

- Keep CPU and memory findings separate unless one directly explains the other.
- Merge duplicate worker findings only when they identify the same root cause and same remediation.
- If one worker finds a sink and another finds the upstream bound/lifetime bug, preserve both locations in the same issue.
- Do not finalize while a high-impact worker claim lacks a reviewed artifact, source line, or explicit proof gap.
