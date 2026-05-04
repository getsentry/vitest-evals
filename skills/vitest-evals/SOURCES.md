# vitest-evals Skill Sources

## Synthesis Summary

| Field | Decision |
|-------|----------|
| Operation | create new installable repo skill |
| Skill class | integration-documentation |
| Primary shape | reference-backed-expert |
| Secondary shape | none |
| Simplicity rationale | One inline file would bury harness-specific details; scripts are unnecessary because the work is authoring and review guidance. |
| Portability | Uses only relative bundled references and repo commands; no provider-specific skill mechanics. |

## Source Inventory

| Source | Trust | Confidence | Contribution | Usage constraints |
|--------|-------|------------|--------------|-------------------|
| `docs/architecture.md` | high | high | core harness lifecycle, normalized run/session model, package boundaries | Use only current harness-backed guidance. |
| `docs/development-guide.md` | high | high | package ownership, workflow, documentation expectations | Keep repo-specific commands aligned with `AGENTS.md`. |
| `docs/testing.md` | high | high | targeted test expectations for root, reporter, harness, and demo changes | Use narrow verification first. |
| `packages/vitest-evals/README.md` | high | high | install, core model, custom harnesses, judge matcher behavior | Use the core, custom harness, and matcher sections only. |
| `packages/vitest-evals/src/index.ts` | high | high | `describeEval`, `run(...)`, automatic judges, matcher context behavior | Runtime API source of truth. |
| `packages/vitest-evals/src/harness.ts` | high | high | `Harness`, `HarnessRun`, normalization helpers, session helpers | Runtime type source of truth. |
| `packages/vitest-evals/src/judges/*` | high | high | judge context, built-in judge options, metadata behavior | Keep examples judge-first. |
| `packages/vitest-evals/src/replay.ts` | high | high | replay modes, env vars, recording shape, cache key behavior | Use for shared replay guidance. |
| `packages/harness-ai-sdk/README.md` and `src/index.ts` | high | high | AI SDK harness options, normalization, replay constraints | Keep option names exact. |
| `packages/harness-ai-sdk/src/index.test.ts` | high | high | edge cases for agent/task entrypoints, partial runs, output and tool normalization, replay errors | Use as failure/workaround evidence. |
| `packages/harness-pi-ai/README.md` and `src/index.ts` | high | high | Pi harness options, tool inference, event sink, normalization, replay | Keep option names exact. |
| `packages/harness-pi-ai/src/index.test.ts` | high | high | edge cases for native tools, reset, inferred tools, normalize overrides, partial runs, replay | Use as failure/workaround evidence. |
| `apps/demo-ai-sdk/evals/*` and `apps/demo-ai-sdk/evals/shared.ts` | medium | high | realistic AI SDK suite shape and output parsing | Treat provider keys as app-local setup. |
| `apps/demo-pi/evals/*` and `apps/demo-pi/src/refundAgent.ts` | medium | high | realistic Pi suite shape, runtime seam, event use, tool assertions | Treat provider keys as app-local setup. |
| package manifests | high | high | package names, peer dependency ranges, workspace commands | Refresh when releases change. |

## Decisions

| Decision | Status | Evidence |
|----------|--------|----------|
| Put skill under `skills/vitest-evals` | adopted | User requested this path; no existing repo skill tree conflicted. |
| Use reference-backed layout | adopted | First-party harnesses have distinct options and failure modes. |
| Add one reference per supported harness path | adopted | Supported paths are custom `Harness`, AI SDK harness, and Pi AI harness. |
| Add shared judge and replay references | adopted | Both first-party harnesses feed the same judge and reporter APIs; replay is implemented centrally. |
| Omit install scripts | deferred | A self-contained skill directory is enough now; no repo skill catalog or installer exists. |
| Avoid alternate suite API guidance | adopted | User asked for the skill to stay purely harness-backed. |

## Coverage Matrix

| Dimension | Status | Coverage |
|-----------|--------|----------|
| API surface and behavior contracts | covered | `describeEval`, `run`, `Harness`, `HarnessRun`, `JudgeContext`, first-party harness options, replay. |
| Config/runtime options | covered | suite options, harness options, replay env vars, package peer ranges. |
| Downstream use cases | covered | new eval suite, table-driven cases, custom app harness, AI SDK `generateText`, AI SDK agent entrypoint, Pi agent default run, Pi custom run, native Pi tools, LLM-backed judge, deterministic tool/output judge, replayed tools. |
| Issues and workarounds | covered | troubleshooting reference includes missing harness, duplicate executions, missing tool traces, non-JSON data, replay misses, provider-executed tools, async iterable replay outputs, hidden Pi tools, reset behavior, blank judge output, stale metadata, missing provider keys. |
| Version variance | partial | Peer ranges are captured from package manifests; future package releases should refresh option tables before release-sensitive edits. |
| Reference discoverability | covered | Every runtime reference is directly routed from `SKILL.md`. |

## Trigger Optimization

Should trigger:
- "write a vitest-evals suite for my refund agent"
- "wire an ai-sdk generateText app into vitest-evals"
- "make a pi-ai harness eval"
- "add a custom judge using JudgeContext"
- "why are tool calls missing from my vitest-evals reporter output?"
- "configure vitest-evals replay"
- "create docs for harness-backed vitest-evals"

Should not trigger:
- "write a generic Vitest unit test"
- "optimize this model prompt"
- "create a spreadsheet of eval results"
- "build a React dashboard"
- "debug Anthropic authentication outside the eval harness"
- "write a generic AI SDK tutorial"

Final description:
`Use when authoring, reviewing, or debugging harness-backed vitest-evals suites, custom Harness adapters, first-party ai-sdk or pi-ai harness integrations, judges, replay, reporter-facing normalized run data, or examples and docs for these APIs.`

## Retrieval Stopping Rationale

Source coverage includes package docs, source types, first-party harness implementations, harness tests, demo evals, replay code, and repo policy docs. Additional retrieval is low-yield until API options, package names, or repo installation conventions change.

## Open gaps

- Review `skills`, `.agents`, plugin manifests, and repo install docs before adding any registration file.
- Confirm future repo docs or skill installer conventions before adding an install script or catalog entry.
- Retrieve package manifests plus `packages/*/src/index.ts` before changing version-sensitive guidance.

## Changelog

- Created initial self-contained `vitest-evals` skill with harness-specific references and shared authoring guidance.
