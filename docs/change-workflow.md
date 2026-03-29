# Change Workflow

All repository changes must follow this loop:

1. Plan
2. Implement
3. Verify
4. Fix

No change is complete until the loop ends with a green verification result.

## 1. Plan

Before editing files, write down:

- the goal of the task
- the files or subsystems expected to change
- the ownership boundary that must remain intact
- the source-of-truth docs that may need updates
- the verification steps that will be used
- the completion criteria

Keep the plan narrow. If scope changes during implementation, update the plan before continuing.

## 2. Implement

Implementation must stay inside the approved plan.

- avoid opportunistic refactors unless they are required to complete the task safely
- keep runtime ownership boundaries from [../agents.md](../agents.md)
- keep engineering rules from [engineering-governance.md](./engineering-governance.md)
- prefer changes that preserve stable browser-facing contracts
- prefer local, explicit code over cross-layer abstractions created only to remove small duplication
- normalize boundary data close to the boundary instead of leaking raw upstream shapes through the stack

## 3. Verify

Run verification after implementation and before calling the task done.

Baseline verification:

- `npm run verify`

Frontend or interaction changes:

- `npm run verify`
- `npm run verify:e2e`

Verification evidence belongs under `output/tasks/<task-id>/`.
At minimum, each task should keep:

- `plan.md`
- `verify.json`
- failure logs, screenshots, or traces when verification fails
- `fix-notes.md` when a failed verification requires follow-up fixes

The `npm run verify` scripts write `verify.json` and command logs for the executed verification steps.

## 4. Fix

If any verification step fails:

- do not mark the task complete
- fix only the issues exposed by verification or the minimum related root cause
- rerun the failed verification steps
- rerun the full required verification set before completion

## Completion Gate

A task is complete only when all of the following are true:

- the plan reflects the delivered scope
- implementation is finished
- required verification steps passed
- verification artifacts were written
- relevant source-of-truth docs were updated when the change introduced new invariants or boundary shifts
- known failures are either fixed or explicitly called out as unresolved blockers

If any verification step is skipped, the task remains incomplete.

## Default Command Matrix

- non-UI changes: `npm run verify`
- UI layout or interaction changes: `npm run verify:e2e`
- release or handoff candidate: run both commands again from a clean shell
