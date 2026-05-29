# Memory Profiler

Use this for heap growth, suspected leaks, GC pressure, RSS growth, and OOM crashes.

## Start Code-First

Read `code-first-triage.md` unless the user already supplied heap artifacts. Inspect caches, listener lifecycles, timers, queues, pending promises, stream buffering, and large object ownership before asking for snapshots.

## Capture Guidance

Choose the evidence that matches the symptom:

- Node.js heap sampling: `node --heap-prof --heap-prof-dir <profiles_dir>/memory <app command>`
- Node.js heap snapshot on signal, when restart flags are allowed: `node --heapsnapshot-signal=SIGUSR2 <app command>`, then send the configured signal at baseline and after growth.
- Node.js inspector/Chrome DevTools: take comparable heap snapshots at baseline, after warmup, and after symptom growth.
- Bun heap snapshot/profile output: `bun --heap-prof --heap-prof-dir <profiles_dir>/memory <app command>`. Add `--heap-prof-md` when a markdown heap report is useful.
- Deno heap snapshots: use inspector snapshots or `node:v8.getHeapSnapshot()` when the deployed Deno version supports it.
- RSS-only growth: collect runtime heap stats, external/ArrayBuffer memory, native library activity, and container cgroup metrics.

For long-running leaks:

- Capture baseline after warmup, not immediately at process start.
- Capture at least one midpoint and one symptom snapshot.
- Keep traffic/input shape as similar as possible between captures.
- Record GC settings, heap limit, process uptime, and request/job counts.
- Treat full heap snapshots as intrusive: they can require large extra memory and can block the event loop while captured. Avoid taking them in production unless the user accepts that risk.

## Analyze

For V8 heap sampling profiles (`.heapprofile`), run:

```bash
python3 <skill_dir>/scripts/analyze_v8_heap_profile.py <profile.heapprofile> --limit 25
python3 <skill_dir>/scripts/analyze_v8_heap_profile.py <before.heapprofile> <after.heapprofile> --limit 25
```

The bundled analyzer is for heap sampling profiles, not full heap snapshots. For heap snapshots (`.heapsnapshot`), inspect retained size and retaining paths in DevTools or compatible tooling. Focus on growing retainers rather than the largest one-time allocation.

Classify the evidence:

- JS heap growth: retained objects, maps, arrays, closures, listeners, promises, or framework state.
- External/native growth: buffers, ArrayBuffer, native modules, image/video/database libraries, or allocator fragmentation.
- GC pressure: high allocation rate with low retained growth.
- OOM from burst: peak live set exceeds limits even if no leak exists.

## Leak Pattern Checks

- Timers or intervals retaining closures.
- EventEmitter/listener growth; compare listener counts over time.
- Unbounded caches and memoization without eviction.
- Request-scoped objects retained by global state.
- Queues, retries, pending promises, and stream buffers that grow under backpressure.
- WebSocket/subscription/session objects not disposed.

Do not claim a leak without retained-growth evidence, a retaining path, or source-level lifetime proof.
