# CPU Profiler

Use this for sustained CPU, periodic CPU spikes, hot-path latency, and event-loop stalls.

## Start Code-First

Read `code-first-triage.md` unless the user already supplied a CPU profile or an exact hot stack. Inspect likely routes, jobs, timers, and profile-adjacent files before asking for new evidence.

## Capture Guidance

Choose the narrowest capture that can include the symptom:

- Node.js restartable process: `node --cpu-prof --cpu-prof-dir <profiles_dir>/cpu <app command>`
- Node.js already running: use the inspector protocol or `node --inspect` only if attaching is allowed; otherwise use OS sampling.
- Bun restartable process: `bun --cpu-prof <app command>` and store the generated profile under `<profiles_dir>/cpu`.
- Deno restartable process: `deno run --cpu-prof --cpu-prof-dir=<profiles_dir>/cpu <script.ts>`. Add `--cpu-prof-md` for a markdown summary or `--cpu-prof-flamegraph` when flamegraph output is useful.
- macOS running process: `sample <pid> <seconds> -file <profiles_dir>/cpu/sample.txt`
- Linux running process: `perf record -F 99 -p <pid> -g -- sleep <seconds>` followed by `perf report` or flamegraph tooling.

For long-running issues:

- Capture a baseline sample before the expected failure window.
- Schedule short repeated samples around the expected onset, such as 30-60 seconds every 15 minutes.
- Record process uptime, traffic/job context, and host metrics for each sample.
- Avoid one huge profile when a staged capture will answer when the hot path appears.

## Analyze

For V8 `.cpuprofile` files, run:

```bash
python3 <skill_dir>/scripts/analyze_v8_cpu_profile.py <profile.cpuprofile> --limit 25
```

Use the output to identify:

- Top self-sampled functions and their stacks.
- Whether the hotspot is application code, dependency code, GC/runtime, native work, or idle/wait.
- Whether samples cluster under one route/job or many callers.
- Whether the top frame is the real root cause or only a sink reached by bad input bounds.

For `sample`, `perf`, or flamegraph output, rank stacks by sample weight and map top frames to source manually.
For Deno TypeScript profiles, verify line mapping against the source because profiler locations may refer to transpiled JavaScript rather than original TypeScript lines.

## Fix Direction

Suggest fixes by impact and effort:

- Bound input size, loop iterations, recursion depth, or queue draining.
- Replace repeated scans with indexes/maps.
- Batch or cache with explicit size/TTL limits.
- Move CPU-heavy work to workers only when the underlying work is legitimate and bounded.
- Add backoff and cancellation to polling/retry loops.
- Replace vulnerable regex or parser behavior with linear-time alternatives.

Do not claim success until `final-report.md` has a before/after CPU or latency delta.
