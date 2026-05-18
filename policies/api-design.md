# API Design

## Intent

Public APIs should make the common path hard to misuse while preserving escape
hatches for advanced cases.

## Policy

- Start from the common path, not from every capability the implementation can
  expose. Add an abstraction only when multiple projects are likely to need it
  regularly.
- Prefer the smallest native-feeling shape for the primary path. In TypeScript,
  this usually means plain objects, direct values, value-or-factory inputs, and
  familiar verbs like `run`.
- Keep the low-level contract stable, then layer a small convenience helper on
  top when repeated integration boilerplate appears. Do not replace a useful
  primitive with a larger framework.
- Prefer one shared contextual API over parallel specialized APIs when callers
  are doing the same kind of work.
- Let strong types express optional capabilities. If only some users need a
  capability, return a stronger typed object when it is configured instead of
  adding a dummy placeholder method that fails at runtime.
- Put capabilities on the object that owns their configuration. Avoid parallel
  context objects with overlapping lifecycle names such as `harness` and
  `runtime`.
- Do not pass duplicate context shapes into the same callback. If a convenience
  callback exposes `metadata`, `signal`, and artifact helpers directly, avoid
  also exposing the raw backing context.
- Put the action on the role that performs it. A harness runs the system under
  test; a judge assesses a run. Binding helpers should assemble context and
  delegate to that role method rather than becoming another owner of the
  behavior.
- Keep assessment prompts, model choices, and parsers on the judge. Prefer
  `createJudge("Name", assess)` as the public custom-judge authoring path; use
  helper binding only when multiple judges reuse provider setup and need
  curried run-scoped options such as abort signals.
- Per-run factories should receive one contextual args object with the run
  input and harness context when the harness owns later instrumentation or
  execution.
- Infer context from fixtures, registered runs, or the current test when that
  removes repetitive parameters and avoids caller mistakes.
- Keep explicit overrides for values that cannot be inferred reliably.
- Prefer typed `run()` output over mapping hooks. If a native provider result
  needs projection into app output, expose one semantic selector such as
  `output`; do not publish generic normalization knobs.
- Preserve caller-owned types exactly. If `run()` declares a concrete output,
  downstream `result.output` and `ctx.output` should be concrete too; require
  `undefined` in the type only when missing output is a real state.
- Put the common typed values first in public generics. Prefer
  `Input, Output, Metadata` over forcing users to spell metadata before they can
  type the result they assert on.
- Matchers should preserve the same contract: a judge over string output should
  not type-check against a structured object result, and required custom judge
  params should stay required.
- Keep overload helper types private when overloads are the intended API.
  Exporting implementation unions makes users annotate around the simpler
  contract and weakens the design.
- Keep compatibility aliases working when migration cost matters, but document
  and test the preferred spelling. Do not make new users choose between equally
  prominent aliases.
- Use clean breaks when the root API shape is wrong; do not preserve confusing
  compatibility aliases on new harness-first surfaces.
- After simplifying an interface, remove stale examples, dead branches, and
  unnecessary helper layers in the same change.

## Exceptions

- Split an API only when the behavior, lifecycle, or ownership boundary is
  genuinely different.
- Require explicit parameters when implicit context would be ambiguous or
  likely to attach the wrong run.
- Promote an escape hatch into the primary API only after repeated real use
  shows it is part of the common workflow.
