## Scope

- define an explicit icon scale spec for Codexy chrome
- update the visual spec so hit areas and glyph sizes are both documented
- converge the main shared icon classes in `src/app/globals.css`
- keep the existing visual language; only change sizing ratios and spacing that depend on icon scale

## Target Files

- `docs/visual-spec.md`
- `src/app/globals.css`

## Icon Scale Direction

- `36px` icon-only container -> `28px` glyph
- `30px to 32px` icon-only container -> `24px` glyph
- `28px` compact action container -> `22px` glyph
- `22px` micro badge/logo container -> `18px` glyph
- `18px to 20px` disclosure container -> `14px` glyph

## Planned CSS Touch Points

- cloud remote top-bar icon buttons
- shared toolbar icon buttons
- sidebar and inline utility icons
- composer add/send icons
- scroll-to-bottom icon
- plan toggle and command disclosure icons
- menubar/logo icons

## Verification

- `npm run verify -- --task icon-scale-20260329-verify`
- `npm run verify:e2e -- --task icon-scale-20260329-e2e`

## Completion Gate

- visual spec includes a clear icon scale contract
- shared icon classes follow the planned container-to-glyph ratios
- remote cloud header and local workspace remain usable
- verify and e2e both pass, with artifacts written under `output/tasks/icon-scale-20260329/`
