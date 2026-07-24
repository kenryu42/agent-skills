export const meta = {
  name: "ultra",
  description:
    "Ultra workflow: scope+design (Fable), explore (Sonnet), implement (Opus), review via autoreview with Fable judging and applying fixes. Fan-out is dynamic per task complexity.",
  phases: [
    {
      title: "Scope",
      detail: "assess complexity, choose exploration questions",
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

const PROJECT_PREAMBLE = `Work in the repository at your current working directory. First read the project instruction files if they exist (CLAUDE.md, AGENTS.md, CONTRIBUTING.md, README.md) and follow their conventions exactly. Never commit, never push, never touch generated/build output directories.`;

phase("Scope");
const scope = await agent(
  `${PROJECT_PREAMBLE}

You are scoping this task before design:

${TASK}

Skim the codebase enough to judge its real complexity — do not deep-dive. Return:
- exploreQuestions: the exploration questions parallel read-only explorers should each answer before design. Scale the count to complexity: a small focused change may need 1; a sweeping one may need 6+. Each question must be self-contained and name concrete areas/files/conventions to investigate (always include one covering existing tests and test conventions).
- projectNotes: project facts every later agent needs (instruction files found and their key rules, language/toolchain, layout).
- verifyCommand: the single command that verifies changes (from project instructions or package scripts, e.g. 'bun run check', 'npm test'); empty string if none exists.`,
  {
    label: "scope",
    phase: "Scope",
    model: "fable",
    schema: {
      type: "object",
      properties: {
        exploreQuestions: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
        },
        projectNotes: { type: "string" },
        verifyCommand: { type: "string" },
      },
      required: ["exploreQuestions", "projectNotes", "verifyCommand"],
    },
  },
);

phase("Explore");
log(`Scoped: ${scope.exploreQuestions.length} exploration question(s)`);
const reports = (
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
          { label: `explore:${i + 1}`, phase: "Explore", model: "sonnet" },
        ),
    ),
  )
).filter(Boolean);

phase("Design");
const design = await agent(
  `${PROJECT_PREAMBLE}

You are the design architect. Design the smallest change that satisfies the task — no speculative machinery, no frameworks; honor any scope-discipline rules in the project instructions.

## Task (trust any facts it states as already verified)
${TASK}

## Project notes
${scope.projectNotes}

## Exploration reports
${reports.map((r, i) => `### Report ${i + 1}\n${r}`).join("\n\n")}

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
);

const verifyStep = design.verifyCommand
  ? `Then run '${design.verifyCommand}' and fix failures until it passes; include the verbatim tail of its passing output in your report.`
  : `Then verify your change compiles/passes whatever checks the project provides and report how you verified it.`;

phase("Implement");
log(`Implementing ${design.workItems.length} work item(s)`);
const implReports = [];
for (const [i, item] of design.workItems.entries()) {
  const report = await agent(
    `${PROJECT_PREAMBLE}

You are the implementer for work item ${i + 1}/${design.workItems.length}: "${item.title}". Work directly on the current branch. Follow the project's style conventions strictly and make the smallest change that satisfies the item.

## Task
${TASK}

## Full plan
${design.plan}

## Your work item
${item.instructions}

${implReports.length > 0 ? `## Reports from work items already completed\n${implReports.join("\n\n")}\n\n` : ""}Apply the edits and their planned tests. ${verifyStep} Return: files changed with a one-line rationale each, and any deviations from the plan with reasons.`,
    {
      label: `implement:${i + 1}:${item.title.slice(0, 30)}`,
      phase: "Implement",
      model: "opus",
    },
  );
  implReports.push(`### Work item ${i + 1}: ${item.title}\n${report}`);
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

const reviewPrompt = (extra) => `${PROJECT_PREAMBLE}

You are the reviewer and judge for the uncommitted changes on the current branch. Apply any review criteria files the project defines (e.g. REVIEW.md).

## What the change must accomplish
${TASK}

## The plan
${design.plan}

${extra}

Review procedure:
1. Invoke the 'autoreview' skill via the Skill tool to review the uncommitted changes. If the Skill tool or the autoreview skill is unavailable in your environment, perform an equivalent review yourself: run 'git diff' and 'git status', read every changed file with surrounding context, and hunt for correctness bugs, scope creep beyond the plan, style violations, and tests that would not fail if the mistake they guard were made.
2. Acting as judge, verify each candidate finding against the actual code — no speculative findings — and decide which genuinely must be fixed (real defects or clear scope violations only).
${design.verifyCommand ? `3. Run '${design.verifyCommand}' yourself and treat any failure as a must-fix finding.` : ""}
Return every verified finding with must_fix set per your judgment, and verdict 'approve' only if nothing must be fixed.`;

phase("Review");
let review = await agent(
  reviewPrompt(`## Implementer reports\n${implReports.join("\n\n")}`),
  {
    label: "review+judge",
    phase: "Review",
    model: "fable",
    schema: REVIEW_SCHEMA,
  },
);

let round = 0;
while (review.verdict === "needs-fixes" && round < 3) {
  round += 1;
  const mustFix = review.findings.filter((f) => f.must_fix);
  if (mustFix.length === 0) break;
  log(`Review round ${round}: ${mustFix.length} finding(s) to fix`);
  const fixReport = await agent(
    `${PROJECT_PREAMBLE}

You are fixing confirmed review findings on the current branch. Apply the smallest fix per finding — a finding is never a mandate to build a framework.

## Findings to fix
${JSON.stringify(mustFix, null, 2)}

## Original plan for context
${design.plan}

Apply the fixes. ${verifyStep} Return what you changed per finding.`,
    { label: `fix:round${round}`, phase: "Fix", model: "fable" },
  );

  review = await agent(
    reviewPrompt(
      `## Findings that were supposed to be fixed\n${JSON.stringify(mustFix, null, 2)}\n\n## Fixer's report\n${fixReport}\n\nConfirm each finding is actually resolved and no regression or new scope creep was introduced — verify against real code, not the fixer's claims.`,
    ),
    {
      label: `re-review:round${round}`,
      phase: "Review",
      model: "fable",
      schema: REVIEW_SCHEMA,
    },
  );
}

return {
  plan: design.plan,
  workItems: design.workItems.map((w) => w.title),
  implReports,
  review,
};
