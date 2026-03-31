# Merge Main Into Self-Hosted Cloud

## Scope

- merge `origin/main` into `codex/self-hosted-cloud`
- preserve self-hosted cloud and API-base behavior from the branch
- preserve sidebar archive and tooltip interaction changes from `origin/main`
- resolve merge conflicts only; do not widen scope

## Verification

- `npm run verify`
- `npm run verify:e2e`
- `git status --short`

## Completion Gate

- merge conflicts are fully resolved
- frontend behavior compiles and tests pass
- merge commit is created and pushed
