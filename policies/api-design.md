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
- Put the action on the role that performs it. A harness runs the system under
  test; a judge assesses a run. Binding helpers should assemble context and
  delegate to that role method rather than becoming another owner of the
  behavior.
- Keep assessment prompts, model choices, and parsers on the judge. If multiple
  judges reuse provider setup, pass a small judge-side helper into the judge and
  curry run-scoped options such as abort signals there instead of exposing
  passthrough plumbing on the judge context.
- Per-run factories should receive one contextual args object with the run
  input and harness context when the harness owns later instrumentation or
  execution.
- Infer context from fixtures, registered runs, or the current test when that
  removes repetitive parameters and avoids caller mistakes.
- Keep explicit overrides for values that cannot be inferred reliably.
- Group advanced normalization or mapping hooks under a clearly named escape
  hatch such as `normalize`; keep the default path free of those knobs.
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
