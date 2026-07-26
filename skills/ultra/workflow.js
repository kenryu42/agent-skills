export const meta = {
  name: "ultra",
  description:
    "Ultra workflow: a Fable planner designs a task-specific stage plan (search/explore: Sonnet, design/review: Fable, implement: Opus), an interpreter executes it, then a Fable review+fix loop closes it out.",
  phases: [
    {
      title: "Plan",
      detail: "fable planner scopes the task, captures baseline, emits the stage plan",
      model: "fable",
    },
    {
      title: "Review",
      detail: "autoreview skill + fable judge",
      model: "fable",
    },
    { title: "Fix", detail: "fable applies accepted findings", model: "fable" },
  ],
};

const TASK = typeof args === "string" ? args : args?.task;
if (!TASK)
  throw new Error(
    "Pass the task as args.task — include any already-verified findings/context verbatim",
  );

const ensure = (result, what) => {
  if (!result) throw new Error(`${what} agent failed or was skipped`);
  return result;
};

const PROJECT_PREAMBLE = `Work in the repository at your current working directory. First read the project instruction files if they exist (CLAUDE.md, AGENTS.md, CONTRIBUTING.md, README.md) and follow their conventions exactly. Never commit, never push, never touch generated/build output directories.`;

// The planner picks roles; this table — not the planner — picks models.
const ROLE_MODEL = {
  search: { model: "sonnet" },
  explore: { model: "sonnet" },
  design: { model: "fable" },
  implement: { model: "opus" },
  review: { model: "fable" },
};

phase("Plan");
const plan = ensure(
  await agent(
    `${PROJECT_PREAMBLE}

You are the workflow planner. Design a stage plan tailored to this task; separate agents who cannot see this conversation will execute it.

## Task
${TASK}

Skim the codebase enough to judge its real complexity — do not deep-dive.

## How the plan is executed
- Stages run strictly in order. Prompts within a stage run in parallel — except in 'implement' stages, whose prompts run one at a time in order.
- Roles and who executes them:
  - 'search' — locate files, map layout, inventory usages (fast read-only lookups)
  - 'explore' — read code and answer a question precisely with file:line references and verbatim excerpts
  - 'design' — architect the implementation plan from the task and all earlier stage results (strongest model; use when the change needs real design work)
  - 'implement' — apply edits and their tests for one self-contained work item
  - 'review' — mid-flow verification of intermediate results (only when a later stage depends on an earlier one being right)
- Every executing agent automatically receives the task, your project notes, the baseline state, and the full results of all earlier stages. Each prompt therefore only needs to state that agent's specific job — but must be self-contained in stating it (name concrete files/areas/conventions where you know them).
- If you include a 'design' stage, later 'implement' prompts may defer their edit details to the design stage's output ("implement work item N from the design").
- Scale the plan to complexity: a small cohesive change may be a single 'implement' stage with one prompt; a sweeping task may need search/explore fan-outs, a design stage, and several implement items. Do not pad the plan with stages the task does not need.
- Do NOT add a final review stage — a review-and-fix loop always runs automatically after your stages.

Also capture the scope facts:
- projectNotes: project facts every later agent needs (instruction files found and their key rules, language/toolchain, layout).
- verifyCommand: the single command that verifies changes (from project instructions or package scripts, e.g. 'bun run check', 'npm test'); empty string if none exists.
- baselineDirty: the verbatim output of 'git status --porcelain' right now (empty string if the tree is clean), so later agents can tell pre-existing uncommitted changes from their own.
- baselineVerify: run the verify command once, before anything changes: 'pass' if it succeeds, 'fail' if it does not, 'not-run' if there is no verify command or running it here is impractical.
- baselineVerifyDetail: when 'fail', the failing test names or error tail; otherwise empty string.`,
    {
      label: "plan",
      phase: "Plan",
      model: "fable",
      schema: {
        type: "object",
        properties: {
          stages: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                role: {
                  type: "string",
                  enum: ["search", "explore", "design", "implement", "review"],
                },
                prompts: {
                  type: "array",
                  minItems: 1,
                  items: { type: "string" },
                },
              },
              required: ["title", "role", "prompts"],
            },
          },
          projectNotes: { type: "string" },
          verifyCommand: { type: "string" },
          baselineDirty: { type: "string" },
          baselineVerify: { type: "string", enum: ["pass", "fail", "not-run"] },
          baselineVerifyDetail: { type: "string" },
        },
        required: [
          "stages",
          "projectNotes",
          "verifyCommand",
          "baselineDirty",
          "baselineVerify",
          "baselineVerifyDetail",
        ],
      },
    },
  ),
  "Plan",
);

const baselineSections = [];
if (plan.baselineDirty)
  baselineSections.push(
    `The tree already had uncommitted changes BEFORE this workflow started (git status --porcelain):\n${plan.baselineDirty}\nThose changes are not part of this task — do not revert, absorb, extend, or review them.`,
  );
if (plan.baselineVerify === "fail")
  baselineSections.push(
    `The verify command was already failing BEFORE this workflow started:\n${plan.baselineVerifyDetail}\nPre-existing failures are not yours to fix — only make sure no NEW failures appear.`,
  );
const BASELINE = baselineSections.length
  ? `## Baseline state (before this workflow)\n${baselineSections.join("\n\n")}\n\n`
  : "";

let verifyStep;
if (!plan.verifyCommand) {
  verifyStep = `Then verify your change compiles/passes whatever checks the project provides and report how you verified it.`;
} else if (plan.baselineVerify === "fail") {
  verifyStep = `Then run '${plan.verifyCommand}'. Failures already present at baseline are not yours to fix — make sure no NEW failures appear, and include the verbatim tail of the output in your report.`;
} else {
  verifyStep = `Then run '${plan.verifyCommand}' and fix failures until it passes; include the verbatim tail of its passing output in your report.`;
}

const IMPL_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["done", "blocked"] },
    blockedReason: { type: "string" },
    filesChanged: { type: "array", items: { type: "string" } },
    deviations: { type: "string" },
    verification: { type: "string" },
  },
  required: [
    "status",
    "blockedReason",
    "filesChanged",
    "deviations",
    "verification",
  ],
};

log(
  `Plan: ${plan.stages.map((s) => `${s.title} (${s.role}×${s.prompts.length})`).join(" → ")}`,
);

const stageContext = (record) => `${PROJECT_PREAMBLE}

## Task
${TASK}

## Project notes
${plan.projectNotes}

${BASELINE}${record ? `## Results from earlier stages\n${record}\n\n` : ""}`;

let record = "";
const implReports = [];
for (const [si, stage] of plan.stages.entries()) {
  const opts = ROLE_MODEL[stage.role];
  const stageLabel = `${si + 1}:${stage.title}`;

  if (stage.role === "implement") {
    const itemReports = [];
    for (const [i, prompt] of stage.prompts.entries()) {
      const report = ensure(
        await agent(
          `${stageContext(record)}You are the implementer for item ${i + 1}/${stage.prompts.length} of stage "${stage.title}". Work directly on the current branch. Follow the project's style conventions strictly and make the smallest change that satisfies the item.

## Your work item
${prompt}

${itemReports.length > 0 ? `## Reports from items already completed in this stage\n${itemReports.join("\n\n")}\n\n` : ""}Apply the edits and their planned tests. ${verifyStep} Return structured output: status 'done' when the item is fully applied and verified; 'blocked' (with blockedReason) ONLY when the item genuinely cannot be completed — a contradictory plan, missing tooling or credentials — never for difficulty you can work through. filesChanged: each changed file followed by ' — ' and a one-line rationale. deviations: departures from the item's instructions with reasons, empty string if none. verification: how the item was verified, quoting the output tail when a verify command was run.`,
          {
            label: `implement:${stageLabel}:${i + 1}`,
            phase: stage.title,
            ...opts,
            schema: IMPL_SCHEMA,
          },
        ),
        `Implement (stage ${si + 1}, item ${i + 1})`,
      );
      if (report.status === "blocked")
        throw new Error(
          `Stage ${si + 1} "${stage.title}" item ${i + 1} blocked: ${report.blockedReason}`,
        );
      const itemReport = `### Item ${i + 1}\nFiles changed:\n${report.filesChanged.map((f) => `- ${f}`).join("\n") || "- (none)"}\nDeviations: ${report.deviations || "none"}\nVerification: ${report.verification}`;
      itemReports.push(itemReport);
      implReports.push(`Stage "${stage.title}" ${itemReport}`);
    }
    record += `\n\n## Stage ${si + 1}: ${stage.title} (implement)\n${itemReports.join("\n\n")}`;
  } else {
    const results = (
      await parallel(
        stage.prompts.map(
          (prompt, i) => () =>
            agent(
              `${stageContext(record)}${stage.role === "search" || stage.role === "explore" ? "Read-only — do not modify anything. " : ""}Your job in stage "${stage.title}":

${prompt}

Return raw structured notes for another agent, not prose for a human. When reporting on code, cite file:line.`,
              {
                label: `${stage.role}:${stageLabel}:${i + 1}`,
                phase: stage.title,
                ...opts,
              },
            ),
        ),
      )
    ).filter(Boolean);
    if (results.length < stage.prompts.length)
      log(
        `Stage ${si + 1} "${stage.title}": ${stage.prompts.length - results.length} agent(s) failed or were skipped`,
      );
    if (results.length === 0)
      throw new Error(`Stage ${si + 1} "${stage.title}": every agent failed`);
    record += `\n\n## Stage ${si + 1}: ${stage.title} (${stage.role})\n${results.map((r, i) => `### Result ${i + 1}\n${r}`).join("\n\n")}`;
  }
}

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          summary: { type: "string" },
          failure_scenario: { type: "string" },
          must_fix: { type: "boolean" },
        },
        required: ["file", "summary", "failure_scenario", "must_fix"],
      },
    },
    verdict: { type: "string", enum: ["approve", "needs-fixes"] },
  },
  required: ["findings", "verdict"],
};

let reviewVerifyStep = "";
if (plan.verifyCommand) {
  reviewVerifyStep =
    plan.baselineVerify === "fail"
      ? `4. Run '${plan.verifyCommand}' yourself and treat any NEW failure beyond the pre-existing baseline failures as a must-fix finding.`
      : `4. Run '${plan.verifyCommand}' yourself and treat any failure as a must-fix finding.`;
}

const reviewPrompt = (extra) => `${PROJECT_PREAMBLE}

You are the reviewer and judge for the uncommitted changes on the current branch. Apply any review criteria files the project defines (e.g. REVIEW.md).

## What the change must accomplish
${TASK}

${BASELINE}## Work record (all stages that produced the changes)
${record}

${extra}

Review procedure:
1. Invoke the 'autoreview' skill via the Skill tool to review the uncommitted changes. If the Skill tool or the autoreview skill is unavailable in your environment, review them yourself instead: run 'git diff' and 'git status' and read every changed file with surrounding context.
2. Whichever path step 1 took, also hunt yourself for: correctness bugs, scope creep beyond the task, style violations, and tests that would not fail if the mistake they guard were made.
3. Acting as judge, verify each candidate finding against the actual code — no speculative findings — and decide which genuinely must be fixed (real defects or clear scope violations only).
${reviewVerifyStep}
Return every verified finding with must_fix set per your judgment, and verdict 'approve' only if nothing must be fixed.`;

phase("Review");
let review = ensure(
  await agent(reviewPrompt(""), {
    label: "review+judge",
    phase: "Review",
    model: "fable",
    schema: REVIEW_SCHEMA,
  }),
  "Review",
);

let round = 0;
while (
  review.verdict === "needs-fixes" &&
  review.findings.some((f) => f.must_fix) &&
  round < 3
) {
  round += 1;
  const mustFix = review.findings.filter((f) => f.must_fix);
  log(`Review round ${round}: ${mustFix.length} finding(s) to fix`);
  const fixReport = ensure(
    await agent(
      `${PROJECT_PREAMBLE}

You are fixing confirmed review findings on the current branch. Apply the smallest fix per finding — a finding is never a mandate to build a framework.

${BASELINE}## Findings to fix
${JSON.stringify(mustFix, null, 2)}

## Work record for context
${record}

Apply the fixes. ${verifyStep} Return what you changed per finding.`,
      { label: `fix:round${round}`, phase: "Fix", model: "fable" },
    ),
    `Fix (round ${round})`,
  );

  review = ensure(
    await agent(
      reviewPrompt(
        `## Findings that were supposed to be fixed\n${JSON.stringify(mustFix, null, 2)}\n\n## Fixer's report\n${fixReport}\n\nConfirm each finding is actually resolved and no regression or new scope creep was introduced — verify against real code, not the fixer's claims.`,
      ),
      {
        label: `re-review:round${round}`,
        phase: "Review",
        model: "fable",
        schema: REVIEW_SCHEMA,
      },
    ),
    `Re-review (round ${round})`,
  );
}

if (
  review.verdict === "needs-fixes" &&
  !review.findings.some((f) => f.must_fix)
) {
  log(
    "Normalizing verdict to approve: review said needs-fixes but marked nothing must-fix",
  );
  review = { ...review, verdict: "approve" };
}

return {
  stages: plan.stages.map((s) => `${s.title} (${s.role}×${s.prompts.length})`),
  implReports,
  review,
  fixRounds: round,
};
