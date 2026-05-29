# Final Report

Use this for user-facing runtime-review output and before/after verification.

## Required Sections

Produce a concise report with:

1. Summary: symptom, runtime, evidence reviewed, and likely root cause.
2. Metrics table: before/after when available.
3. Ranked issues: impact, confidence, evidence, proposed fix, effort.
4. Profiling notes: commands, durations, artifacts, and caveats.
5. Next steps: smallest remaining evidence or implementation task.

## Metrics Table

Use this shape when data is available:

| Metric | Before | After | Delta | Source |
| --- | ---: | ---: | ---: | --- |
| CPU samples in hot path |  |  |  |  |
| p95 latency |  |  |  |  |
| Heap used |  |  |  |  |
| RSS |  |  |  |  |
| GC time or frequency |  |  |  |  |

Use `not measured` rather than inventing numbers.

## Ranked Issue Shape

For each issue:

- Title
- Impact: high / medium / low
- Confidence: high / medium / low
- Evidence: profile stack, heap retainer, metric, or file/line source proof
- Root cause
- Proposed fix
- Effort: small / medium / large
- Verification: exact re-profile or metric comparison required

## Before/After Rules

- Compare the same workload, runtime flags, host/container limits, and profile duration whenever possible.
- Prefer normalized metrics: samples percentage, retained-growth bytes, p95/p99 latency, throughput, GC pause time.
- If the fix changes workload shape or observability, state that the delta is not apples-to-apples.
- If no fix was applied, report diagnosis and the proposed verification plan instead of a success claim.
