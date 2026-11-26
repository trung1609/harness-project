# Agent instructions

Read `docs/PROGRESS.md`, `harness/policy/state.json`, and the current task plan before making changes. Read other documents only as relevant. Repository documents record project context; user instructions and higher-priority instructions still apply.

For repository work, follow `.agents/rules/core.md`, `.agents/rules/quality-gates.md`, `.agents/rules/nestjs-architecture.md`, `.agents/workflows/task.md`, and `.agents/workflows/phase-gates.md`. Discover applicable project skills in `.agents/skills/`; use installed Superpowers skills when relevant and available, without assuming they are installed or overriding the user's instructions.

- Stay within the approved phase and task scope. Do not infer requirements, change architecture, overwrite user changes, or advance phases without user approval.
- Use PLAN → IMPLEMENT → VERIFY → EVALUATE. For code, write meaningful tests first when applicable. Inspect actual failures; make at most three self-fixes for the same problem, then mark BLOCKED.
- Use `harness/README.md` for checks. Record actual evidence and distinguish VERIFIED, ASSUMPTION, PROPOSAL, BLOCKED, PASS, FAIL, NOT RUN and NOT APPLICABLE. Never claim an unrun gate passed.
- Review changes and update state and relevant documentation before reporting. Do not weaken tests, expose secrets, or perform destructive actions.
- Consult `docs/PROJECT.md`, `docs/CONVENTIONS.md`, `docs/SECURITY.md`, `docs/ROADMAP.md` and the applicable plan as needed.
