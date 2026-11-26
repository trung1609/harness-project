# Phase 0 evidence and outstanding work

## Current status

Phase 0 foundation is complete for its approved scope, with the limitations below. This does not approve Phase 1.

- VERIFIED: Repository agent rules, workflows and six project skills exist; all six appeared in a Codex session's skill inventory. Metadata structure is checked by the context gate; behavior and future discovery remain subject to the agent environment.
- VERIFIED: Gitleaks 8.30.1 Windows archive was checked against the official SHA-256 release checksum before installation. Synthetic clean, positive, redaction and invalid-configuration cases passed. Project tree and available history were scanned locally without findings after excluding `.tools/`, which must not contain project source or secrets.
- VERIFIED FROM USER-PROVIDED SCREENSHOT: GitHub Actions Harness run #2 succeeded, including context, Harness tests and Gitleaks installation, verification and scans. The screenshot did not show the commit SHA or detailed logs. The user subsequently reported another successful CI run.
- VERIFIED: Superpowers 7.0.2 was installed via Codex CLI into its user cache. Current sandboxed `codex plugin list --json` reports no plugins, so active plugin discovery is NOT VERIFIED. Project-specific skills are stored in this repository independently.
- VERIFIED: `git diff` against a baseline could miss a staged change if the worktree was restored to baseline. The updated checker compares baseline, staged and unstaged changes; regression tests cover the case. A baseline-sourced policy cannot be replaced by an uncommitted policy edit.
- VERIFIED FROM USER-PROVIDED SCREENSHOTS: Harness run #4 succeeded on commit `bcf1072`; manual `Task scope verification` run #1 succeeded on commit `5608483`. The screenshots show successful jobs, not detailed logs or scope-workflow inputs. The smoke invocation is intended to compare a commit to itself and therefore does not establish detection of an out-of-scope change remotely; positive and negative cases were exercised locally. Manual scope verification is explicitly invoked per task and requires a previously approved baseline and policy; the normal Harness workflow does not assert task scope.
- NOT VERIFIED: Codex hooks and GitHub branch protection. No PR or merge test is required by the user. Optional hooks are not a prerequisite for running local checks; CI configuration alone does not enforce a merge gate.
- BLOCKED IN CURRENT ENVIRONMENT: Docker engine access denied and Docker config inaccessible. Postman CLI was not found on PATH. No application exists, so application build, unit/integration tests, application architecture and dependency audit are NOT APPLICABLE in Phase 0.

## Verification and limits

Local validation: `python -m unittest discover -s harness/tests -v` passed 10 tests and `python harness/checks/check.py context` passed. These checks validate only their designed cases. Scope does not detect ignored files or changes outside the worktree and cannot establish policy approval or prevent a modified checker from cheating. Gitleaks cannot establish the absence of all secrets. CI and skill instructions cannot guarantee agent compliance. Review of these changes was performed by their author, not an independent reviewer.

## Historical context

On 2026-11-26 the user approved the Phase 0 plan. Initially there was no Git baseline; `git init` first failed under the sandbox and succeeded with approved elevated permissions. Git commits and an origin remote were subsequently created by the user. Earlier observations that CI had not run, secret scanning was not configured, and Superpowers was not installed are superseded by the current evidence above.

Sources: https://github.com/obra/superpowers, https://github.com/gitleaks/gitleaks, https://developers.openai.com/plugins/build/plugins, and https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow.
