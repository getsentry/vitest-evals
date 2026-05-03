# API Design

## Intent

Public APIs should make the common path hard to misuse while preserving escape
hatches for advanced cases.

## Policy

- Prefer one shared contextual API over parallel specialized APIs when callers
  are doing the same kind of work.
- Keep context objects stable and capability methods mandatory when the surface
  owns the configuration. Tighten the upstream config instead of exposing
  optional methods that every caller has to branch around.
- Put capabilities on the object that owns their configuration. Avoid parallel
  context objects with overlapping lifecycle names such as `harness` and
  `runtime`.
- Infer context from fixtures, registered runs, or the current test when that
  removes repetitive parameters and avoids caller mistakes.
- Keep explicit overrides for values that cannot be inferred reliably.
- Use clean breaks when the root API shape is wrong; do not preserve confusing
  compatibility aliases on new harness-first surfaces.

## Exceptions

- Split an API only when the behavior, lifecycle, or ownership boundary is
  genuinely different.
- Require explicit parameters when implicit context would be ambiguous or
  likely to attach the wrong run.
