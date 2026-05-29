# Intake And Routing

Use this when the symptom is unclear or the first response needs a diagnosis plan.

## Collect

Gather only missing details that materially affect profiling:

- Runtime and version: Node.js, Bun, Deno, or other runtime.
- OS and deployment surface: local, container, VM, serverless, Kubernetes, CI, desktop app.
- Symptom: sustained CPU, periodic spike, event-loop stall, slow memory growth, GC pressure, OOM crash, RSS growth without heap growth, or unknown.
- Reproduction: command, traffic shape, job schedule, input size, and time until failure.
- Observability already available: logs, metrics, traces, profiler files, heap snapshots, crash reports.
- Constraints: production access, allowed restarts, profiling overhead tolerance, maximum capture duration.

If a fact is discoverable from the repository or command output, inspect it before asking.

## Classify

- Sustained near-100% single-core CPU: start with `cpu-profiler.md`.
- Multi-core CPU saturation: inspect worker pools, native extensions, subprocesses, and runtime flags before choosing CPU capture.
- Periodic CPU spikes: align profiles with timers, cron jobs, polling, batch work, GC, and request bursts.
- Event-loop latency without high CPU: inspect blocking I/O, sync filesystem/crypto/zlib, huge JSON parsing, and lock contention.
- Slow heap growth: start with `memory-profiler.md` and require at least two comparable snapshots or sampling profiles.
- RSS growth without heap growth: inspect native buffers, ArrayBuffer/external memory, image/video/native libraries, subprocesses, allocator behavior, and container limits.
- OOM crash: collect crash timestamp, heap limit, GC logs if available, and last known memory metrics.

## Output

Write or return a short triage plan:

| Field | Value |
| --- | --- |
| Symptom class | CPU / memory / mixed / unknown |
| Runtime | Runtime and version |
| Evidence already available | Files, logs, metrics |
| Next evidence | Smallest capture needed |
| Risk | Profiling overhead and production impact |
| Route | CPU profiler, memory profiler, or code-first review |

Then load the selected profiler reference.
