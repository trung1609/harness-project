# Harness

Run from the repository root with Python 3:

```text
python -m unittest discover -s harness/tests -v
python harness/checks/check.py context
python harness/checks/check.py scope --base <commit> --policy <task-scope.json>
```

The context check validates required file presence and the shape of `policy/state.json`, not factual correctness or document links. A scope policy is JSON such as `{"allowed_paths": ["docs/", "README.md"]}`; a trailing slash denotes a directory. Use a trusted, task-specific commit baseline and independently approved policy. The command checks tracked differences against the baseline and non-ignored untracked files, including both sides of renames. It does not detect ignored files, historical changes absent from the final diff, semantic violations, or modifications outside the worktree. Review those separately. Exit 0 means the check passed, 1 means a violation, and 2 means execution is blocked or inputs are invalid. A check does not enforce permissions by itself.

Tests create disposable Git repositories under the system temporary directory; they never use or alter the project Git metadata. CI runs only the context check and Harness tests. Application build, tests, architecture, dependency audit and specification compliance are not yet applicable. Secret scanning and merge protection remain unconfigured. No hook has been verified or configured.
