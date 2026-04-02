# Verification

- `npx playwright test tests/cloud-mode.spec.ts -g "cloud auth setup page scrolls on mobile viewports"`
  - passed on 2026-04-02
- `npm run verify`
  - passed on 2026-04-02
- `npm run verify:e2e`
  - blocked by unrelated existing failures on this branch:
    - `tests/cloud-mode.spec.ts`: cloud wall multi-pane test failed because the node test run reported `codex not found on PATH`
    - `tests/mobile-layout.spec.ts`: existing theme-color expectation mismatch (`#141416` vs current `#141413`)
    - `tests/visual-layout.spec.ts`: existing hover-color expectation mismatch for the new-thread nav button
- `git status --short`
  - working tree limited to this auth-scroll fix and its regression test
