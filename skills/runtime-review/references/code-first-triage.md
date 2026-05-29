# Code-First Triage

Use this before asking for traces, and again after profiles identify hot paths.

## CPU Anti-Patterns

Look for:

- Unbounded loops over request data, queues, directory trees, or graph structures.
- Repeated JSON parse/stringify, regex, sort, serialization, compression, crypto, or hashing in hot request paths.
- Polling loops, timers without backoff, recursive retries, and promise loops that do not yield.
- Synchronous filesystem, child process, crypto, zlib, or database calls on the main thread.
- N+1 calls, repeated scans, cache misses, and accidental O(n^2) joins.
- Regex backtracking on user-controlled or large input.
- Worker pool saturation or excessive worker creation.

## Memory Anti-Patterns

Look for:

- Unbounded maps, arrays, LRU caches without caps, memoization keyed by request/user/object.
- Timers, intervals, event listeners, subscriptions, observers, and sockets not removed.
- Closures retaining request, response, context, large buffers, or ORM entities.
- Global queues, retry buffers, batch accumulators, and pending promises that grow under failure.
- Stream buffering instead of backpressure, `Buffer.concat` growth, and full-file reads.
- Duplicate object graphs from cloning, serialization, or hydration.
- Native or external memory use: buffers, WASM, image/video libraries, database drivers.

## Review Method

- Start from entrypoints and scheduled jobs related to the symptom.
- Follow allocation or CPU-heavy data from source to sink.
- Prefer exact file/line suspects over generic advice.
- When profiles are available, map top frames back to source and inspect callers, input bounds, and lifetime controls.
- If the source review finds a high-confidence bug, still define a narrow before/after measurement before fixing.

## Subagent Fit

Use `subagent-orchestration.md` when independent reviewers can own separate routes, jobs, packages, or profile artifacts without overlapping edits.
