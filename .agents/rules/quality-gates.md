# Quality gates

For each task establish the approved scope, baseline, acceptance criteria, applicable commands, and pre-existing changes. Run the scope check when a suitable committed baseline and independently reviewed scope policy exist; otherwise record BLOCKED or NOT RUN and review changes manually. A scope check covers final tracked differences and non-ignored untracked files, not ignored files or semantics.

Run relevant Harness checks and tests. Run build, unit, integration, architecture, security, and specification checks when applicable and available; record each unavailable gate separately and never replace it with a simulated pass. Refer to harness/README.md for exact commands and scanner coverage. A local check or CI file alone does not enforce branch protection. Review actual changes, record evidence and update state before completion.
