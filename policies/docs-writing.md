# Docs Writing

## Intent

Docs should help readers choose the right eval shape quickly, copy a working
setup, and then understand the underlying model without rereading the same
concepts in multiple places.

## Policy

- Keep the primary path harness-first and judge-first. Mention legacy
  scorer-first APIs only when the page is explicitly about compatibility.
- Give each page one job:
  - root README: project orientation and repo navigation
  - package README: core package authoring model
  - Guide: the task path from install to CI report
  - API Reference: generated root API reference plus a short hand-written index
  - architecture/development docs: contributor-facing package boundaries
- Start workflow sections with the action a user should take, then explain the
  reason. Conceptual sections can lead with the model or tradeoff.
- A guide page should start with the first useful setup action. Add
  prerequisites only when they are non-obvious or likely to block the command a
  reader is about to run.
- Prefer short task-oriented headings such as "Configure Vitest" and
  "Write Evals" over clever or marketing-style headings.
- Introduce one recommended path before showing alternatives. Runtime-specific
  branches should use the same shape and order so readers can compare them.
- Keep harness and judge child pages on their local templates:
  `packages/docs/src/content/docs/docs/harnesses/_TEMPLATE.md` and
  `packages/docs/src/content/docs/docs/judges/_TEMPLATE.md`.
- Keep examples realistic but minimal. Include enough context to run the code,
  but remove unrelated production details from docs examples.
- Use consistent terms: `harness`, `run(input)`, `HarnessRun`, `session`,
  `metadata`, `judge`, `tool replay`, and `GitHub reporter action`.
- Put scenario inputs in `input` and per-run expectations or configuration in
  `metadata` in examples unless the example is intentionally showing another
  shape.
- Keep GitHub Actions docs action-first. Show
  `uses: getsentry/vitest-evals@v0` as the reporting surface instead of asking
  users to call package internals from workflows.
- Use callouts, tables, cards, and accordions only when they clarify a choice or
  reduce scanning cost. Do not wrap ordinary page sections in decorative cards.
- Make code blocks purposeful. Use terminal blocks for commands, file-labeled
  blocks for source examples, and generated reference blocks for API signatures.
- Keep inline code short enough to wrap cleanly on mobile; move long commands,
  object shapes, and type signatures into blocks.
- Keep the visual system mostly monochrome: black, white, and neutral grays for
  layout, copy, borders, and navigation. Syntax highlighting may use a limited
  high-contrast accent palette when it improves code scanning.
- Keep Starlight styling centralized in the local docs theme. Do not add
  page-specific palettes, border treatments, or syntax themes unless they become
  part of that theme.
- Code blocks must be high contrast. Avoid dim syntax themes, low-contrast
  terminal text, or tinted code backgrounds that make examples harder to scan.
- API reference groups should expose a local index before dense generated
  entries so readers can jump directly to the symbol they came for.

## Exceptions

- A page may repeat a small phrase or example when that keeps a user from
  jumping between pages during setup.
- Generated API reference can be denser than guide pages, but the surrounding
  copy should still explain what a reader should look at first.
