# Mobile Auth Scroll

## Scope

- fix the self-hosted cloud auth pages so phone-sized viewports can scroll vertically
- preserve the desktop centered auth-card presentation
- add a regression test for the initial authenticator bind page on a mobile viewport

## Verification

- `npm run verify`
- `npm run verify:e2e`
- `git status --short`

## Completion Gate

- the auth setup page can scroll when its content exceeds the viewport height
- desktop auth pages remain centered
- verification passes and is recorded
