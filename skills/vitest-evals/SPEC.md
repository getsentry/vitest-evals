# vitest-evals Specification

## Intent

This skill helps agents author, review, and debug harness-backed `vitest-evals`
work without needing to rediscover the package shape from source every time.
It is optimized for product API correctness, trace quality, and small targeted
verification.

## Scope

In scope:
- harness-backed eval suites using `describeEval(...)`
- custom `Harness` adapters
- first-party `@vitest-evals/harness-ai-sdk` and `@vitest-evals/harness-pi-ai`
- judges, explicit judge matchers, reporter-facing normalized data, and replay
- examples, docs, tests, and package work that changes those APIs

Out of scope:
- unrelated Vitest test authoring
- provider SDK setup that is not part of a harness
- broad application design outside the runtime seam being evaluated
- alternate suite APIs outside the harness-backed model

## Users And Trigger Context

- Primary users: coding agents working in this repo or in apps adopting the package.
- Common user requests: create an eval, wire an AI SDK app, wire a Pi agent, add a judge, add replay, debug missing tool calls, document harness usage.
- Should not trigger for: generic unit tests, generic prompt writing, spreadsheet or slide work, or frontend-only tasks.

## Runtime Contract

- Required first actions: inspect the touched code, choose the runtime target, open the matching reference.
- Required outputs: implementation or review guidance that uses the harness-backed API only, plus targeted verification.
- Non-negotiable constraints: normalized run data remains JSON-serializable, suite tests call `run(...)` explicitly, and judge model calls go through `harness.prompt(...)`.
- Expected bundled files loaded at runtime: `SKILL.md` first, then one or more focused files under `references/`.

## Source And Evidence Model

Authoritative sources:
- package source and tests under `packages/vitest-evals`
- first-party harness source and tests under `packages/harness-ai-sdk` and `packages/harness-pi-ai`
- demo evals under `apps/demo-ai-sdk` and `apps/demo-pi`
- repo docs that describe the harness-backed product shape

Useful improvement sources:
- positive examples: demo evals, passing harness tests, reviewer-approved docs
- negative examples: review feedback, test failures, reporter regressions
- commit logs/changelogs: use when API behavior has changed recently
- issue or PR feedback: use when it clarifies user-facing ergonomics
- eval results: use when examples or reporter output drift

Data that must not be stored:
- secrets
- customer data
- private URLs or identifiers not needed for reproduction
- raw provider transcripts unless redacted and required for a reproducible example

## Reference Architecture

- `SKILL.md` contains activation rules, routing, defaults, and verification commands.
- `references/` contains focused runtime lookup files by authoring need.
- `SOURCES.md` contains provenance, decisions, coverage, gaps, and changelog.
- `SPEC.md` contains this maintenance contract.
- `scripts/` and `assets/` are intentionally absent until repeatable validation or templates are needed.

## Evaluation

- Lightweight validation: run the skill validator, inspect routing coverage, and search new files for excluded API guidance.
- Deeper evaluation: run holdout prompts when trigger behavior or reference coverage changes materially.
- Holdout examples: keep examples in `SOURCES.md` unless they become large enough for `references/evidence/`.
- Acceptance gates: all supported harnesses have a direct reference, every reference is routed from `SKILL.md`, and no runtime guidance points outside the harness-backed model.

## Known Limitations

- The skill does not automate installation; it is installable as a self-contained directory.
- Provider-specific model credentials and environment setup remain application concerns.
- API details must be refreshed when package options, peer ranges, or reporter behavior change.

## Maintenance Notes

- Update `SKILL.md` when trigger language, routing, or universal defaults change.
- Update `SOURCES.md` when source evidence, decisions, coverage, or gaps change.
- Update harness reference files when a harness package option, runtime contract, normalization rule, or replay behavior changes.
- Add `references/evidence/` only when repeated positive or negative examples become useful for future revisions.
