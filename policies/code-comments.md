# Code Comments

## Intent

Comments are for non-obvious intent, invariants, and tradeoffs.

They are not there to narrate obvious code.

## Policy

- Add comments when behavior is easy to misread, policy-driven, or coupled to a non-obvious invariant.
- Public exported APIs must have a brief JSDoc comment explaining intent so
  TypeDoc can generate useful API reference pages. This includes exported
  functions, classes, interfaces, type aliases, and constants reachable from
  package export entrypoints.
- Run `pnpm docs:check` after changing public exports; CI enforces that every
  public exported symbol has usable JSDoc.
- Prefer inline docstrings on tricky local helpers when future readers will need context to change them safely.
- Keep comments short and concrete. Explain why the code exists or what boundary it is protecting.
- Delete or rewrite stale comments immediately when behavior changes.

## Exceptions

- Do not comment obvious transformations or control flow.
- Do not add comments that simply restate the code in English.
