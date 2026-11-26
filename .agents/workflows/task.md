# Task workflow

1. Load docs/PROGRESS.md, harness/policy/state.json and the applicable task plan; inspect git status. Identify phase, scope, baseline and pre-existing changes. Ask only for essential missing business decisions.
2. Plan the smallest approved change with acceptance criteria and test cases. Do not begin a later phase without confirmation.
3. For behavior changes, write meaningful failing tests first when feasible; implement within scope. Use the relevant project skill and existing checks.
4. Run applicable checks, inspect failures, fix at most three times per issue, and rerun affected checks. Do not claim PASS for a command that did not run.
5. Review the change, scope, requirements traceability and security implications; update the appropriate documents and state. Report phase, task, files, implementation, evidence, gate status, blockers and next action.
