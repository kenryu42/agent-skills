---
name: runtime-review
description: "Use when diagnosing or fixing runtime CPU spikes, high event-loop latency, memory growth, heap leaks, garbage-collection pressure, or OOM crashes in Node.js, Bun, Deno, JavaScript/TypeScript services, or comparable long-running runtimes. Includes code-first triage, guided CPU and memory profiling, subagent-orchestrated review, before/after profile comparison, and structured remediation reports."
---

# Runtime Review

Use this as the single local entrypoint for runtime performance incidents. Keep the public invocation as `$runtime-review`; CPU, memory, and intake workflows are internal references.

## Route The Request

Choose exactly one starting reference:

- Unknown symptom, missing environment details, or first pass triage: `references/intake-and-routing.md`
- CPU spike, event-loop stall, hot function, or high wall-clock latency: `references/cpu-profiler.md`
- Memory growth, heap leak, GC pressure, or OOM crash: `references/memory-profiler.md`
- Fix verification, regression comparison, or "did it improve?": `references/final-report.md`

After the starting reference is loaded, use these supporting references only when needed:

- Source-first anti-pattern review: `references/code-first-triage.md`
- Subagent fanout and reconciliation: `references/subagent-orchestration.md`
- Artifact paths and evidence retention: `references/artifacts.md`

Do not read every reference up front. Load the selected mode, then load supporting references only when that mode asks for them.

## Shared Resources

Use these local resources when the selected mode asks for them:

- Artifact paths: `references/artifacts.md`
- CPU profile parser: `scripts/analyze_v8_cpu_profile.py`
- Heap sampling parser and comparison helper: `scripts/analyze_v8_heap_profile.py`

Treat `<skill_dir>` in references as this skill directory, `skills/runtime-review`.

## Hard Rules

- Inspect source for likely runtime anti-patterns before asking the user to capture traces, unless the user already supplied a relevant profile, heap snapshot, crash log, or metrics excerpt.
- Ask for the smallest evidence that can decide the next step. Do not default to broad "record everything for 10 minutes" guidance.
- For long-running incidents, design staged capture: baseline, trigger window, and delayed sample/snapshot checkpoints.
- Keep CPU and memory diagnoses separate until evidence shows one causes the other, such as GC-driven CPU.
- When applying or proposing a fix, define the before/after metric and re-profile method before claiming success.
- If subagents are available and the user has authorized delegated work, use them for independent code-surface review, profile interpretation, and fix verification when those tasks can run in parallel.
- Do not claim a profile was captured, parsed, or compared unless the artifact or command output was actually produced.
