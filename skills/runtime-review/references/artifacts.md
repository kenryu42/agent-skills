# Runtime Review Artifacts

Use these paths unless the user provides a different output directory.

## Base Paths

- `review_root=./runtime-review/`
- `run_id=<runtime>-<symptom>-<timestamp>`
- `run_dir=<review_root>/<run_id>`
- `context_dir=<run_dir>/01_context`
- `code_dir=<run_dir>/02_code_triage`
- `profiles_dir=<run_dir>/03_profiles`
- `analysis_dir=<run_dir>/04_analysis`
- `fix_dir=<run_dir>/05_fix_verification`

## Files

- Intake notes: `<context_dir>/intake.md`
- Environment snapshot: `<context_dir>/environment.md`
- Code triage notes: `<code_dir>/code_triage.md`
- CPU profile artifacts: `<profiles_dir>/cpu/`
- Memory profile artifacts: `<profiles_dir>/memory/`
- CPU analysis: `<analysis_dir>/cpu_analysis.md`
- Memory analysis: `<analysis_dir>/memory_analysis.md`
- Subagent reconciliation notes: `<analysis_dir>/subagent_reconciliation.md`
- Before/after deltas: `<fix_dir>/before_after.md`
- Final report: `<run_dir>/report.md`

## Evidence Rules

- Keep raw profiler output unchanged.
- Put derived summaries beside raw artifacts, not in place of them.
- Record exact commands, process ids, runtime versions, flags, and capture duration.
- For long-running incidents, record timestamps relative to process start and symptom onset.
- If a requested artifact cannot be captured, record the reason and the next-best evidence.
