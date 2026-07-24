export const meta = {
  name: "ultra",
  description:
    "Ultra workflow: scope+design (Fable), explore (Sonnet), implement (Opus), review via autoreview with Fable judging and applying fixes. Fan-out is dynamic per task complexity.",
  phases: [
    {
      title: "Scope",
      detail: "assess complexity, capture baseline, choose exploration questions",
      model: "fable",
    },
    {
      title: "Explore",
      detail: "one sonnet explorer per question",
      model: "sonnet",
    },
    {
      title: "Design",
      detail: "implementation plan + work breakdown",
      model: "fable",
    },
    {
      title: "Implement",
      detail: "one opus implementer per work item, sequential",
      model: "opus",
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

phase("Scope");
const scope = ensure(
  await agent(
    `${PROJECT_PREAMBLE}

You are scoping this task before design:

${TASK}

Skim the codebase enough to judge its real complexity — do not deep-dive. Return:
- exploreQuestions: the exploration questions parallel read-only explorers should each answer before design. Scale the count to complexity: an empty list when the task text already contains everything design needs; a small focused change may need 1; a sweeping one may need 6+. Each question must be self-contained and name concrete areas/files/conventions to investigate (when exploring at all, include one question covering existing tests and test conventions).
- projectNotes: project facts every later agent needs (instruction files found and their key rules, language/toolchain, layout).
- verifyCommand: the single command that verifies changes (from project instructions or package scripts, e.g. 'bun run check', 'npm test'); empty string if none exists.
- baselineDirty: the verbatim output of 'git status --porcelain' right now (empty string if the tree is clean), so later agents can tell pre-existing uncommitted changes from their own.
- baselineVerify: run the verify command once, before anything changes: 'pass' if it succeeds, 'fail' if it does not, 'not-run' if there is no verify command or running it here is impractical.
- baselineVerifyDetail: when 'fail', the failing test names or error tail; otherwise empty string.`,
    {
      label: "scope",
      phase: "Scope",
      model: "fable",
      effort: "medium",
      schema: {
        type: "object",
        properties: {
          exploreQuestions: {
            type: "array",
            items: { type: "string" },
          },
          projectNotes: { type: "string" },
          verifyCommand: { type: "string" },
          baselineDirty: { type: "string" },
          baselineVerify: { type: "string", enum: ["pass", "fail", "not-run"] },
          baselineVerifyDetail: { type: "string" },
        },
        required: [
          "exploreQuestions",
          "projectNotes",
          "verifyCommand",
          "baselineDirty",
          "baselineVerify",
          "baselineVerifyDetail",
        ],
      },
    },
  ),
  "Scope",
);

const baselineSections = [];
if (scope.baselineDirty)
  baselineSections.push(
    `The tree already had uncommitted changes BEFORE this workflow started (git status --porcelain):\n${scope.baselineDirty}\nThose changes are not part of this task — do not revert, absorb, extend, or review them.`,
  );
if (scope.baselineVerify === "fail")
  baselineSections.push(
    `The verify command was already failing BEFORE this workflow started:\n${scope.baselineVerifyDetail}\nPre-existing failures are not yours to fix — only make sure no NEW failures appear.`,
  );
const BASELINE = baselineSections.length
  ? `## Baseline state (before this workflow)\n${baselineSections.join("\n\n")}\n\n`
  : "";

phase("Explore");
log(`Scoped: ${scope.exploreQuestions.length} exploration question(s)`);
let reports = [];
if (scope.exploreQuestions.length > 0) {
  reports = (
    await parallel(
      scope.exploreQuestions.map(
        (q, i) => () =>
          agent(
            `${PROJECT_PREAMBLE}

Read-only exploration — do not modify anything. The overall task is:

${TASK}

Project notes: ${scope.projectNotes}

Answer this exploration question precisely, with file:line references and verbatim code excerpts: ${q}

Return raw structured notes for another agent, not prose for a human.`,
            {
              label: `explore:${i + 1}`,
              phase: "Explore",
              model: "sonnet",
              effort: "medium",
            },
          ),
      ),
    )
  ).filter(Boolean);
  if (reports.length < scope.exploreQuestions.length)
    log(
      `${scope.exploreQuestions.length - reports.length} explorer(s) failed or were skipped; designing from ${reports.length} report(s)`,
    );
}

phase("Design");
const design = ensure(
  await agent(
    `${PROJECT_PREAMBLE}

You are the design architect. Design the smallest change that satisfies the task — no speculative machinery, no frameworks; honor any scope-discipline rules in the project instructions.

## Task (trust any facts it states as already verified)
${TASK}

## Project notes
${scope.projectNotes}

${BASELINE}## Exploration reports
${reports.length ? reports.map((r, i) => `### Report ${i + 1}\n${r}`).join("\n\n") : "(none — scoping judged the task text sufficient)"}

Return:
- plan: the full implementation plan — ordered edits (file, location, exact intended code shape), the test plan (which test files get which cases and what realistic mistake each catches), and one-sentence justifications for any open design decisions you settled.
- workItems: the plan split into independent work items to be implemented ONE AT A TIME IN ORDER by separate implementers. Scale the count to complexity — one item for a cohesive change; more only when the task genuinely decomposes. Each item's instructions must be self-contained given the plan.
- verifyCommand: confirm or correct '${scope.verifyCommand}'.`,
    {
      label: "design:plan",
      phase: "Design",
      model: "fable",
      schema: {
        type: "object",
        properties: {
          plan: { type: "string" },
          workItems: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                instructions: { type: "string" },
              },
              required: ["title", "instructions"],
            },
          },
          verifyCommand: { type: "string" },
        },
        required: ["plan", "workItems", "verifyCommand"],
      },
    },
  ),
  "Design",
);

let verifyStep;
if (!design.verifyCommand) {
  verifyStep = `Then verify your change compiles/passes whatever checks the project provides and report how you verified it.`;
} else if (scope.baselineVerify === "fail") {
  verifyStep = `Then run '${design.verifyCommand}'. Failures already present at baseline are not yours to fix — make sure no NEW failures appear, and include the verbatim tail of the output in your report.`;
} else {
  verifyStep = `Then run '${design.verifyCommand}' and fix failures until it passes; include the verbatim tail of its passing output in your report.`;
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

phase("Implement");
log(`Implementing ${design.workItems.length} work item(s)`);
const implReports = [];
for (const [i, item] of design.workItems.entries()) {
  const report = ensure(
    await agent(
      `${PROJECT_PREAMBLE}

You are the implementer for work item ${i + 1}/${design.workItems.length}: "${item.title}". Work directly on the current branch. Follow the project's style conventions strictly and make the smallest change that satisfies the item.

## Task
${TASK}

${BASELINE}## Full plan
${design.plan}

## Your work item
${item.instructions}

${implReports.length > 0 ? `## Reports from work items already completed\n${implReports.join("\n\n")}\n\n` : ""}Apply the edits and their planned tests. ${verifyStep} Return structured output: status 'done' when the item is fully applied and verified; 'blocked' (with blockedReason) ONLY when the item genuinely cannot be completed — a contradictory plan, missing tooling or credentials — never for difficulty you can work through. filesChanged: each changed file followed by ' — ' and a one-line rationale. deviations: departures from the plan with reasons, empty string if none. verification: how the item was verified, quoting the output tail when a verify command was run.`,
      {
        label: `implement:${i + 1}:${item.title.slice(0, 30)}`,
        phase: "Implement",
        model: "opus",
        schema: IMPL_SCHEMA,
      },
    ),
    `Implement (work item ${i + 1})`,
  );
  if (report.status === "blocked")
    throw new Error(
      `Work item ${i + 1} "${item.title}" blocked: ${report.blockedReason}`,
    );
  implReports.push(
    `### Work item ${i + 1}: ${item.title}\nFiles changed:\n${report.filesChanged.map((f) => `- ${f}`).join("\n") || "- (none)"}\nDeviations: ${report.deviations || "none"}\nVerification: ${report.verification}`,
  );
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
if (design.verifyCommand) {
  reviewVerifyStep =
    scope.baselineVerify === "fail"
      ? `4. Run '${design.verifyCommand}' yourself and treat any NEW failure beyond the pre-existing baseline failures as a must-fix finding.`
      : `4. Run '${design.verifyCommand}' yourself and treat any failure as a must-fix finding.`;
}

const reviewPrompt = (extra) => `${PROJECT_PREAMBLE}

You are the reviewer and judge for the uncommitted changes on the current branch. Apply any review criteria files the project defines (e.g. REVIEW.md).

## What the change must accomplish
${TASK}

${BASELINE}## The plan
${design.plan}

${extra}

Review procedure:
1. Invoke the 'autoreview' skill via the Skill tool to review the uncommitted changes. If the Skill tool or the autoreview skill is unavailable in your environment, review them yourself instead: run 'git diff' and 'git status' and read every changed file with surrounding context.
2. Whichever path step 1 took, also hunt yourself for: correctness bugs, scope creep beyond the plan, style violations, and tests that would not fail if the mistake they guard were made.
3. Acting as judge, verify each candidate finding against the actual code — no speculative findings — and decide which genuinely must be fixed (real defects or clear scope violations only).
${reviewVerifyStep}
Return every verified finding with must_fix set per your judgment, and verdict 'approve' only if nothing must be fixed.`;

phase("Review");
let review = ensure(
  await agent(
    reviewPrompt(`## Implementer reports\n${implReports.join("\n\n")}`),
    {
      label: "review+judge",
      phase: "Review",
      model: "fable",
      schema: REVIEW_SCHEMA,
    },
  ),
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

## Original plan for context
${design.plan}

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
  plan: design.plan,
  workItems: design.workItems.map((w) => w.title),
  implReports,
  review,
  fixRounds: round,
};
