# Harness

Run from the repository root with Python 3:

```text
python -m unittest discover -s harness/tests -v
python harness/checks/check.py context
python harness/checks/check.py scope --base <commit> --policy <task-scope.json>
python harness/checks/check.py scope --base <commit> --policy-from-base <path-in-commit>
```

The context check validates required file presence, the project's restricted skill-frontmatter format (unquoted name and description) and the shape of `policy/state.json`; it does not establish factual correctness, agent behavior or document links. A scope policy is JSON such as `{"allowed_paths": ["docs/", "README.md"]}`; a trailing slash denotes a directory. Use a trusted, task-specific commit baseline and independently approved policy. The command checks baseline, staged, unstaged and non-ignored untracked paths, including both sides of renames. It does not detect ignored files, historical changes absent from the final diff, semantic violations, or modifications outside the worktree. Review those separately. Exit 0 means the check passed, 1 means a violation, and 2 means execution is blocked or inputs are invalid. A check does not enforce permissions by itself.

The manually dispatched `Task scope verification` workflow accepts an approved full baseline SHA and policy path, requires the baseline to be an ancestor and reads the policy from that commit, not the task worktree. Commit and approve the task policy before its baseline, and choose the branch to check when dispatching. This is an optional, explicit task check: the normal CI does not run it and no branch protection is configured by this repository. A user must choose a trustworthy baseline and policy; the workflow executes the checked-out checker and does not protect itself against a task that modifies it. See [GitHub's manual workflow documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

Tests create disposable Git repositories under the system temporary directory; they never use or alter the project Git metadata. Application build, tests, architecture, dependency audit and specification compliance are not yet applicable. Merge protection is not verified. No hook has been verified or configured.

## Secret scanning

Gitleaks 8.30.1 is installed locally under `.tools/gitleaks-8.30.1/`, which is excluded from Git. On Windows from the root:

```text
python harness/checks/verify_gitleaks.py .tools/gitleaks-8.30.1/gitleaks.exe
.tools/gitleaks-8.30.1/gitleaks.exe dir --no-banner --redact=100 .
.tools/gitleaks-8.30.1/gitleaks.exe git --no-banner --redact=100 --log-opts="--all" .
```

The first command uses disposable synthetic input to check clean and failing cases, redaction and invalid configuration. Directory scanning examines the current files; Git scanning examines available commit history. `.gitleaks.toml` extends the default rules and excludes only `.tools/`, containing downloaded third-party binaries and documentation. Do not put project secrets or source there. The workflow installs the pinned Linux release after SHA-256 verification and runs these checks; its remote execution remains unverified until pushed and run. Scanner coverage is limited by rules, configuration, available history and skipped content. Redaction does not prevent every possible exposure; do not publish raw scan reports.
